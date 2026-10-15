import {test, before, after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import {createDashboard, dockerClient} from '../server.mjs'

const origin = 'http://localhost:8080'
const token = 'a'.repeat(64)
const id = 'b'.repeat(64)
let temporary, server, base, cookie
const operations = []
let managed = true
let dockerAvailable = true
const powerCalls = []
// Native fetch rewrites Host on recent Node versions. Use a real HTTP client
// so these tests also exercise reverse-proxy Host preservation.
function fetch(url, options = {}) {
	return new Promise((resolve, reject) => {
		const req = http.request(url, options, (res) => {
			const chunks = []
			res.on('data', (chunk) => chunks.push(chunk))
			res.on('end', () => resolve(new Response(Buffer.concat(chunks), {status: res.statusCode, headers: res.headers})))
		})
		req.on('error', reject)
		req.end(options.body)
	})
}
async function request(endpoint, {data, auth = true, headers = {}, method = data === undefined ? 'GET' : 'POST'} = {}) {
	return fetch(`${base}/api/${endpoint}`, {
		method,
		headers: {
			Host: 'localhost:8080',
			...(auth && cookie ? {Cookie: cookie} : {}),
			...(data === undefined ? {} : {Origin: origin, 'Content-Type': 'application/json'}),
			...headers,
		},
		body: data === undefined ? undefined : JSON.stringify(data),
	})
}

before(async () => {
	temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ubuntu-dashboard-'))
	await fs.mkdir(path.join(temporary, 'ui/ubuntu'), {recursive: true})
	await fs.writeFile(path.join(temporary, 'ui/ubuntu/index.html'), '<html>dashboard</html>')
	server = await createDashboard({
		origin,
		token,
		fileRoot: path.join(temporary, 'files'),
		uiRoot: path.join(temporary, 'ui'),
		powerEnabled: true,
		power: async (action) => powerCalls.push(action),
		docker: async (method, endpoint) => {
			if (!dockerAvailable) throw Object.assign(new Error('Docker unavailable'), {status: 503})
			operations.push([method, endpoint])
			if (endpoint === '/containers/json?all=true')
				return [
					{
						Id: id,
						Names: ['/jellyfin'],
						Image: 'jellyfin/jellyfin',
						State: 'running',
						Status: 'Up',
						Labels: {'ubuntu-dashboard.manage': String(managed)},
						Ports: [{PublicPort: 8096, Type: 'tcp'}, {PublicPort: 53, Type: 'udp'}],
					},
				]
			if (endpoint.endsWith('/json')) return {Config: {Labels: {'ubuntu-dashboard.manage': String(managed)}}}
			return null
		},
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
	await new Promise((resolve) => server.close(resolve))
	await fs.rm(temporary, {recursive: true, force: true})
})

test('authentication protects every private surface; host and origin checks apply', async () => {
	for (const endpoint of ['system', 'containers', 'files', 'files/download?path=x'])
		assert.equal((await request(endpoint, {auth: false})).status, 401)
	for (const endpoint of [`containers/${id}/start`, 'files', 'power', 'logout'])
		assert.equal((await request(endpoint, {auth: false, data: {}})).status, 401)
	assert.equal((await request('login', {auth: false, data: {token: 'wrong'}})).status, 401)
	assert.equal(
		(await request('login', {auth: false, data: {token}, headers: {Origin: 'https://evil.example'}})).status,
		403,
	)
	assert.equal((await request('system', {headers: {Host: 'evil.example'}})).status, 403)
	const response = await request('login', {auth: false, data: {token}})
	assert.equal(response.status, 200)
	assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)
	cookie = response.headers.get('set-cookie').split(';')[0]
})
test('system telemetry returns actual OS and filesystem values', async () => {
	const response = await request('system')
	assert.equal(response.status, 200)
	const data = await response.json()
	assert.equal(data.hostname, os.hostname())
	assert.equal(data.platform, os.platform())
	assert.ok(data.memory.total > 0)
	assert.ok(data.storage.total > 0)
	assert.ok(data.cpu >= 0 && data.cpu <= 100)
})
test('malformed requests fail without changing server state', async () => {
	assert.equal((await request('files', {data: null})).status, 400)
	assert.equal((await request('files', {data: []})).status, 400)
	assert.equal((await request('files', {data: {}, headers: {'Content-Type': 'text/plain'}})).status, 415)
	assert.equal((await request('files', {data: {}, headers: {'Content-Type': 'application/json-fake'}})).status, 415)
	assert.equal((await request('system', {method: 'DELETE'})).status, 405)
})
test('container discovery and actions enforce labels and a strict allowlist', async () => {
	const list = await (await request('containers')).json()
	assert.equal(list[0].name, 'jellyfin')
	assert.deepEqual(list[0].ports, [8096])
	assert.equal((await request(`containers/${id}/restart`, {data: {}})).status, 200)
	assert.deepEqual(operations.at(-1), ['POST', `/containers/${id}/restart?t=10`])
	managed = false
	const count = operations.filter(([method]) => method === 'POST').length
	assert.equal((await request(`containers/${id}/stop`, {data: {}})).status, 403)
	assert.equal(operations.filter(([method]) => method === 'POST').length, count)
	assert.equal((await request(`containers/${id}/remove`, {data: {}})).status, 404)
	assert.equal((await request('containers/hello;reboot/start', {data: {}})).status, 404)
	dockerAvailable = false
	assert.equal((await request('containers')).status, 503)
	assert.equal((await request('system')).status, 200)
	dockerAvailable = true
})
test('private files support upload/list/download/delete and reject overwrite, traversal and symlinks', async (t) => {
	if (process.platform === 'linux') {
		const unsafe = path.join(temporary, 'unsafe-root')
		await fs.mkdir(unsafe, {mode: 0o755})
		await assert.rejects(createDashboard({origin, token, fileRoot: unsafe, uiRoot: temporary}), /mode 700/)
	}
	assert.equal((await request('files', {data: {action: 'mkdir', path: 'documents'}})).status, 200)
	assert.equal(
		(
			await request('files', {
				data: {action: 'upload', path: 'documents/file.txt', content: Buffer.from('Hallo Ubuntu').toString('base64')},
			})
		).status,
		200,
	)
	assert.equal((await (await request('files?path=documents')).json()).files[0].name, 'file.txt')
	const download = await (await request('files/download?path=documents/file.txt')).json()
	assert.equal(Buffer.from(download.content, 'base64').toString(), 'Hallo Ubuntu')
	assert.equal(
		(await request('files', {data: {action: 'upload', path: 'documents/file.txt', content: ''}})).status,
		409,
	)
	assert.equal((await request('files', {data: {action: 'delete', path: 'documents'}})).status, 409)
	for (const value of ['../outside', '/etc/passwd', 'documents/../../x', 'a\\b']) {
		assert.equal((await request(`files?path=${encodeURIComponent(value)}`)).status, 400)
		assert.equal((await request('files', {data: {action: 'upload', path: value, content: ''}})).status, 400)
	}
	assert.equal((await request('files', {data: {action: 'delete', path: ''}})).status, 403)
	try {
		await fs.symlink(
			path.join(temporary, 'ui'),
			path.join(temporary, 'files/link'),
			process.platform === 'win32' ? 'junction' : 'dir',
		)
		assert.equal((await request('files?path=link')).status, 403)
		assert.equal((await request('files', {data: {action: 'upload', path: 'link/escape', content: ''}})).status, 403)
		assert.ok(!(await (await request('files')).json()).files.some((entry) => entry.name === 'link'))
	} catch (error) {
		if (error.code !== 'EPERM') throw error
		t.diagnostic('Symlink creation unavailable on this host')
	}
	assert.equal(
		(
			await request('files', {
				data: {action: 'upload', path: 'large', content: Buffer.alloc(1_000_001).toString('base64')},
			})
		).status,
		413,
	)
	assert.equal((await request('files', {data: {action: 'delete', path: 'documents/file.txt'}})).status, 200)
	assert.equal((await request('files', {data: {action: 'delete', path: 'documents'}})).status, 200)
})
test('host actions require hostname confirmation and accept no arbitrary command', async () => {
	assert.equal((await request('power', {data: {action: 'reboot', confirm: 'wrong'}})).status, 400)
	assert.equal((await request('power', {data: {action: 'reboot;id', confirm: os.hostname()}})).status, 400)
	assert.equal(powerCalls.length, 0)
	assert.equal((await request('power', {data: {action: 'reboot', confirm: os.hostname()}})).status, 200)
	assert.deepEqual(powerCalls, ['reboot'])
	assert.equal(
		(await request('power', {data: {action: 'poweroff', confirm: os.hostname()}, headers: {Origin: ''}})).status,
		403,
	)
})
test('static hosting applies browser protections and prevents traversal', async () => {
	const response = await fetch(base, {headers: {Host: 'localhost:8080'}})
	assert.equal(response.status, 200)
	assert.match(await response.text(), /dashboard/)
	assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/)
	assert.equal((await fetch(`${base}/%2e%2e%2fserver.mjs`, {headers: {Host: 'localhost:8080'}})).status, 400)
	assert.equal((await request('logout', {data: {}})).status, 200)
	assert.equal((await request('system')).status, 401)
})
test('login throttling and secure cookies', async () => {
	for (let i = 0; i < 10; i++) await request('login', {auth: false, data: {token: 'wrong'}})
	assert.equal((await request('login', {auth: false, data: {token}})).status, 429)
	const secure = await createDashboard({
		origin: 'https://server.example',
		token,
		fileRoot: path.join(temporary, 'files'),
		uiRoot: path.join(temporary, 'ui'),
	})
	await new Promise((resolve) => secure.listen(0, '127.0.0.1', resolve))
	try {
		const response = await fetch(`http://127.0.0.1:${secure.address().port}/api/login`, {
			method: 'POST',
			headers: {Host: 'server.example', Origin: 'https://server.example', 'Content-Type': 'application/json'},
			body: JSON.stringify({token}),
		})
		assert.match(response.headers.get('set-cookie'), /; Secure/)
		const secureSession = response.headers.get('set-cookie').split(';')[0]
		assert.equal(
			(
				await fetch(`http://127.0.0.1:${secure.address().port}/api/power`, {
					method: 'POST',
					headers: {
						Host: 'server.example',
						Origin: 'https://server.example',
						Cookie: secureSession,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({action: 'reboot', confirm: os.hostname()}),
				})
			).status,
			403,
		)
	} finally {
		await new Promise((resolve) => secure.close(resolve))
	}
})
test('Docker socket client transmits only the requested method/path and handles errors', async () => {
	const socket =
		process.platform === 'win32' ? `\\\\.\\pipe\\ubuntu-dashboard-${process.pid}` : path.join(temporary, 'docker.sock')
	const fake = http.createServer((req, res) => {
		if (req.url === '/broken') {
			res.writeHead(200, {'Content-Type': 'application/json'})
			res.write('[')
			return setImmediate(() => res.destroy())
		}
		assert.equal(req.url, '/containers/json?all=true')
		res.setHeader('Content-Type', 'application/json')
		res.end('[]')
	})
	await new Promise((resolve) => fake.listen(socket, resolve))
	try {
		assert.deepEqual(await dockerClient(socket)('GET', '/containers/json?all=true'), [])
		await assert.rejects(dockerClient(socket)('GET', '/broken'), {status: 503})
	} finally {
		await new Promise((resolve) => fake.close(resolve))
	}
	await assert.rejects(dockerClient(socket)('GET', '/containers/json?all=true'), {status: 503})
})
