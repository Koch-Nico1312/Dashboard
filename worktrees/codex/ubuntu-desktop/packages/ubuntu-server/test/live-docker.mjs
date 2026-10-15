// Explicit opt-in integration check. Creates/removes only two uniquely named
// disposable containers; never changes any pre-existing container.
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomBytes} from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {createDashboard, dockerClient} from '../server.mjs'

if (process.env.RUN_LIVE_DOCKER !== 'true')
	throw new Error('Set RUN_LIVE_DOCKER=true to create disposable test containers')
const exec = promisify(execFile)
const cli = (...args) => exec(process.env.DOCKER_CLI || 'docker', args, {timeout: 120_000})
const image = process.env.TEST_DOCKER_IMAGE || 'alpine:3.22'
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ubuntu-live-'))
const ids = []
let server, cookie
const token = randomBytes(32).toString('hex')
try {
	for (const managed of [true, false]) {
		const {stdout} = await cli(
			'run',
			'-d',
			'--network',
			'none',
			'--name',
			`ubuntu-dashboard-test-${randomBytes(6).toString('hex')}`,
			'--label',
			`ubuntu-dashboard.manage=${managed}`,
			image,
			'sleep',
			'300',
		)
		ids.push(stdout.trim())
	}
	server = await createDashboard({
		origin: 'http://localhost:8080',
		token,
		fileRoot: path.join(temporary, 'files'),
		uiRoot: temporary,
		docker: dockerClient(process.env.DASHBOARD_DOCKER_SOCKET || '/var/run/docker.sock'),
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	function request(endpoint, data) {
		return new Promise((resolve, reject) => {
			const req = http.request(
				{
					hostname: '127.0.0.1',
					port: server.address().port,
					path: `/api/${endpoint}`,
					method: data === undefined ? 'GET' : 'POST',
					headers: {
						Host: 'localhost:8080',
						Origin: 'http://localhost:8080',
						'Content-Type': 'application/json',
						...(cookie ? {Cookie: cookie} : {}),
					},
				},
				(res) => {
					const chunks = []
					res.on('data', (chunk) => chunks.push(chunk))
					res.on('end', () =>
						resolve({status: res.statusCode, headers: res.headers, data: JSON.parse(Buffer.concat(chunks).toString())}),
					)
				},
			)
			req.on('error', reject)
			req.end(data === undefined ? undefined : JSON.stringify(data))
		})
	}
	const login = await request('login', {token})
	assert.equal(login.status, 200)
	cookie = login.headers['set-cookie'][0].split(';')[0]
	const listing = await request('containers')
	assert.equal(listing.status, 200)
	assert.ok(listing.data.some((container) => container.id === ids[0] && container.managed))
	assert.ok(listing.data.some((container) => container.id === ids[1] && !container.managed))
	for (const action of ['stop', 'start', 'restart']) {
		assert.equal((await request(`containers/${ids[0]}/${action}`, {})).status, 200)
		const {stdout} = await cli('inspect', '--format', '{{.State.Running}}', ids[0])
		assert.equal(stdout.trim(), action === 'stop' ? 'false' : 'true')
	}
	assert.equal((await request(`containers/${ids[1]}/stop`, {})).status, 403)
	assert.equal((await cli('inspect', '--format', '{{.State.Running}}', ids[1])).stdout.trim(), 'true')
	assert.equal(
		(
			await request(`containers/${ids[1]}/settings`, {
				managed: true,
				name: 'Freigegebener Testcontainer',
				icon: 'docker',
			})
		).status,
		200,
	)
	assert.equal((await request(`containers/${ids[1]}/stop`, {})).status, 200)
	assert.equal((await cli('inspect', '--format', '{{.State.Running}}', ids[1])).stdout.trim(), 'false')
	assert.equal((await request(`containers/${ids[1]}/settings`, {managed: false})).status, 200)
	assert.equal((await request(`containers/${ids[1]}/start`, {})).status, 403)
	console.info('LIVE DOCKER PASS: discovery, start/stop/restart, label-free grant and revocation')
} finally {
	if (server) await new Promise((resolve) => server.close(resolve))
	for (const id of ids) {
		assert.match(id, /^[a-f0-9]{64}$/)
		await cli('rm', '-f', id)
	}
	await fs.rm(temporary, {recursive: true, force: true})
}
