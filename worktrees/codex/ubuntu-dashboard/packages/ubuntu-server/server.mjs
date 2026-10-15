import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {constants} from 'node:fs'
import {randomBytes, timingSafeEqual, createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'

const exec = promisify(execFile)
const fail = (status, message) => Object.assign(new Error(message), {status})
const digest = (value) => createHash('sha256').update(value).digest()
const mime = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.webm': 'video/webm',
}

// Reject symlinks at every level. This root must be private to the service user:
// do not point it at a directory writable by other users or container workloads.
export async function confined(root, value = '', allowMissing = false) {
	if (typeof value !== 'string' || value.includes('\\') || value.includes('\0') || path.isAbsolute(value))
		throw fail(400, 'Invalid relative path')
	const parts = value.split('/').filter(Boolean)
	if (parts.some((p) => p === '.' || p === '..')) throw fail(400, 'Invalid relative path')
	let current = root
	for (const [i, part] of parts.entries()) {
		current = path.join(current, part)
		try {
			const stat = await fs.lstat(current)
			if (stat.isSymbolicLink()) throw fail(403, 'Symbolic links are not accessible')
			if (i < parts.length - 1 && !stat.isDirectory()) throw fail(400, 'Invalid parent directory')
		} catch (error) {
			if (allowMissing && i === parts.length - 1 && error.code === 'ENOENT') return current
			throw error
		}
	}
	return current
}

export function dockerClient(socketPath) {
	return (method, endpoint) =>
		new Promise((resolve, reject) => {
			const req = http.request({socketPath, path: endpoint, method}, (res) => {
				res.on('error', () => reject(fail(503, 'Docker connection interrupted')))
				let body = ''
				res.on('data', (chunk) => {
					body += chunk
					if (body.length > 4_000_000) req.destroy(new Error('Docker response too large'))
				})
				res.on('end', () => {
					if (res.statusCode >= 400) return reject(fail(502, 'Docker operation failed'))
					try {
						resolve(body ? JSON.parse(body) : null)
					} catch {
						reject(fail(502, 'Invalid Docker response'))
					}
				})
			})
			req.setTimeout(15_000, () => req.destroy(new Error('Docker timeout')))
			req.on('error', () => reject(fail(503, 'Docker is unavailable')))
			req.end()
		})
}

async function body(req) {
	if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'JSON required')
	let size = 0
	const chunks = []
	for await (const chunk of req) {
		size += chunk.length
		if (size > 1_500_000) throw fail(413, 'Request too large (maximum file size 1 MB)')
		chunks.push(chunk)
	}
	try {
		const input = JSON.parse(Buffer.concat(chunks).toString())
		if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Object required')
		return input
	} catch {
		throw fail(400, 'Invalid JSON')
	}
}

export async function createDashboard(options) {
	const {
		origin,
		token,
		fileRoot,
		uiRoot,
		powerEnabled = false,
		secureCookie = origin?.startsWith('https:'),
		docker = dockerClient('/var/run/docker.sock'),
		power = async (action) => exec('/usr/bin/sudo', ['-n', '/usr/bin/systemctl', action], {timeout: 10_000}),
	} = options
	if (!origin || new URL(origin).origin !== origin || !token || token.length < 32)
		throw new Error('Canonical origin and token of at least 32 characters required')
	await fs.mkdir(fileRoot, {recursive: true, mode: 0o700})
	const root = await fs.realpath(fileRoot)
	if (process.platform === 'linux') {
		const stat = await fs.stat(root)
		if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)
			throw new Error('File root must be owned by the service user and have mode 700')
	}
	const sessions = new Map()
	let loginAttempts = []
	let previousCpu = os.cpus().map((cpu) => cpu.times)
	const json = (res, status, data) => {
		res.writeHead(status, {'Content-Type': 'application/json'})
		res.end(JSON.stringify(data))
	}
	const server = http.createServer(async (req, res) => {
		res.setHeader('X-Content-Type-Options', 'nosniff')
		res.setHeader('Referrer-Policy', 'no-referrer')
		res.setHeader('X-Frame-Options', 'DENY')
		res.setHeader('Cache-Control', 'no-store')
		res.setHeader(
			'Content-Security-Policy',
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
		)
		try {
			// Ignore forwarded headers: the reverse proxy preserves Host and clients
			// cannot select an alternative origin through X-Forwarded-* headers.
			if (req.headers.host !== new URL(origin).host) throw fail(403, 'Unrecognized host')
			if (req.headers.origin && req.headers.origin !== origin) throw fail(403, 'Unrecognized origin')
			const url = new URL(req.url, origin)
			if (!url.pathname.startsWith('/api/')) {
				if (req.method !== 'GET') throw fail(405, 'GET required')
				const relative = decodeURIComponent(url.pathname === '/' ? '/ubuntu/index.html' : url.pathname).slice(1)
				const target = await confined(await fs.realpath(uiRoot), relative)
				const data = await fs.readFile(target)
				res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream'})
				return res.end(data)
			}
			if (!['GET', 'POST'].includes(req.method)) throw fail(405, 'Unsupported method')
			if (req.method === 'POST' && req.headers.origin !== origin) throw fail(403, 'Origin required')
			if (req.method === 'POST' && !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''))
				throw fail(415, 'JSON required')
			if (url.pathname === '/api/login' && req.method === 'POST') {
				loginAttempts = loginAttempts.filter((time) => Date.now() - time < 60_000)
				if (loginAttempts.length >= 10) throw fail(429, 'Too many login attempts; retry in one minute')
				loginAttempts.push(Date.now())
				const input = await body(req)
				if (typeof input.token !== 'string' || !timingSafeEqual(digest(input.token), digest(token)))
					throw fail(401, 'Invalid access key')
				const session = randomBytes(32).toString('hex')
				sessions.set(session, Date.now() + 8 * 3600_000)
				for (const [id, expiry] of sessions) if (expiry < Date.now()) sessions.delete(id)
				if (sessions.size > 100) sessions.delete(sessions.keys().next().value)
				res.setHeader(
					'Set-Cookie',
					`ubuntu_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie ? '; Secure' : ''}`,
				)
				return json(res, 200, {ok: true})
			}
			const session = req.headers.cookie?.match(/(?:^|;\s*)ubuntu_session=([a-f0-9]{64})(?:;|$)/)?.[1]
			if (!session || (sessions.get(session) || 0) < Date.now()) throw fail(401, 'Please sign in')
			if (url.pathname === '/api/logout' && req.method === 'POST') {
				sessions.delete(session)
				res.setHeader(
					'Set-Cookie',
					`ubuntu_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie ? '; Secure' : ''}`,
				)
				return json(res, 200, {ok: true})
			}
			if (url.pathname === '/api/system' && req.method === 'GET') {
				const current = os.cpus().map((cpu) => cpu.times)
				let total = 0,
					idle = 0
				current.forEach((cpu, i) => {
					const old = previousCpu[i] || cpu
					for (const key of Object.keys(cpu)) total += cpu[key] - old[key]
					idle += cpu.idle - old.idle
				})
				previousCpu = current
				const disk = await fs.statfs(root)
				return json(res, 200, {
					hostname: os.hostname(),
					platform: os.platform(),
					release: os.release(),
					uptime: os.uptime(),
					cpu: total ? Math.round((1 - idle / total) * 100) : 0,
					memory: {total: os.totalmem(), used: os.totalmem() - os.freemem()},
					storage: {total: disk.blocks * disk.bsize, available: disk.bavail * disk.bsize},
					powerEnabled,
					origin,
				})
			}
			if (url.pathname === '/api/containers' && req.method === 'GET') {
				const containers = await docker('GET', '/containers/json?all=true')
				return json(
					res,
					200,
					containers.map((c) => ({
						id: c.Id,
						name: c.Names[0]?.replace(/^\//, '') || c.Id.slice(0, 12),
						image: c.Image,
						state: c.State,
						status: c.Status,
						managed: c.Labels?.['ubuntu-dashboard.manage'] === 'true',
						ports: (c.Ports || []).filter((p) => p.PublicPort && p.Type === 'tcp').map((p) => p.PublicPort),
					})),
				)
			}
			const containerAction = url.pathname.match(/^\/api\/containers\/([a-f0-9]{64})\/(start|stop|restart)$/)
			if (containerAction && req.method === 'POST') {
				const [, id, action] = containerAction
				const info = await docker('GET', `/containers/${id}/json`)
				if (info.Config?.Labels?.['ubuntu-dashboard.manage'] !== 'true')
					throw fail(403, 'Container management requires the ubuntu-dashboard.manage=true label')
				await docker('POST', `/containers/${id}/${action}?t=10`)
				console.info(JSON.stringify({event: 'container', id, action, time: new Date().toISOString()}))
				return json(res, 200, {ok: true})
			}
			if (url.pathname === '/api/files' && req.method === 'GET') {
				const relative = url.searchParams.get('path') || ''
				const directory = await confined(root, relative)
				const entries = await fs.readdir(directory, {withFileTypes: true})
				const files = await Promise.all(
					entries
						.slice(0, 1000)
						.filter((entry) => !entry.isSymbolicLink())
						.map(async (entry) => {
							const stat = await fs.lstat(path.join(directory, entry.name))
							return {name: entry.name, directory: stat.isDirectory(), size: stat.size}
						}),
				)
				return json(res, 200, {path: relative, files, truncated: entries.length > 1000})
			}
			if (url.pathname === '/api/files/download' && req.method === 'GET') {
				const target = await confined(root, url.searchParams.get('path') || '')
				const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
				try {
					const stat = await handle.stat()
					if (!stat.isFile() || stat.size > 1_000_000) throw fail(413, 'Only files up to 1 MB can be downloaded')
					const content = await handle.readFile()
					return json(res, 200, {content: content.toString('base64')})
				} finally {
					await handle.close()
				}
			}
			if (url.pathname === '/api/files' && req.method === 'POST') {
				const input = await body(req)
				const target = await confined(root, input.path, true)
				if (target === root) throw fail(403, 'Cannot modify the root')
				if (input.action === 'mkdir') await fs.mkdir(target, {mode: 0o700})
				else if (input.action === 'upload') {
					if (typeof input.content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.content))
						throw fail(400, 'Invalid file content')
					const data = Buffer.from(input.content, 'base64')
					if (data.length > 1_000_000) throw fail(413, 'Maximum file size 1 MB')
					await fs.writeFile(target, data, {flag: 'wx', mode: 0o600})
				} else if (input.action === 'delete') {
					const stat = await fs.lstat(target)
					if (stat.isDirectory()) await fs.rmdir(target)
					else if (stat.isFile()) await fs.unlink(target)
					else throw fail(403, 'Unsupported file type')
				} else throw fail(400, 'Unsupported file action')
				console.info(JSON.stringify({event: 'file', action: input.action, time: new Date().toISOString()}))
				return json(res, 200, {ok: true})
			}
			if (url.pathname === '/api/power' && req.method === 'POST') {
				if (!powerEnabled) throw fail(403, 'Host power controls are disabled')
				const input = await body(req)
				if (!['reboot', 'poweroff'].includes(input.action) || input.confirm !== os.hostname())
					throw fail(400, 'Confirm the hostname and a valid power action')
				await power(input.action)
				console.info(JSON.stringify({event: 'power', action: input.action, time: new Date().toISOString()}))
				return json(res, 200, {ok: true})
			}
			throw fail(404, 'Unknown endpoint')
		} catch (error) {
			const status =
				error.status || {ENOENT: 404, EEXIST: 409, ENOTEMPTY: 409, EACCES: 403, ENOTDIR: 400}[error.code] || 500
			if (status === 500) console.error(error)
			json(res, status, {error: status === 500 ? 'Server operation failed' : error.message})
		}
	})
	server.requestTimeout = 20_000
	server.headersTimeout = 10_000
	return server
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const token = (await fs.readFile(process.env.DASHBOARD_TOKEN_FILE || '/etc/umbrel-ubuntu/access-key', 'utf8')).trim()
	const server = await createDashboard({
		origin: process.env.DASHBOARD_ORIGIN || 'http://localhost:8080',
		token,
		fileRoot: process.env.DASHBOARD_FILES || '/var/lib/umbrel-ubuntu/files',
		uiRoot: process.env.DASHBOARD_UI || path.resolve(import.meta.dirname, '../ui/dist-ubuntu'),
		powerEnabled: process.env.DASHBOARD_POWER === 'true',
		docker: dockerClient(process.env.DASHBOARD_DOCKER_SOCKET || '/var/run/docker.sock'),
	})
	server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () =>
		console.info('Ubuntu dashboard listening'),
	)
}
