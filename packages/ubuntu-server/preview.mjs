// Local visual preview. Deliberately simulated Docker data, visibly marked in
// the UI. This process never accesses a real Docker socket or host power API.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createDashboard} from './server.mjs'
import {desktopStore} from './desktop-state.mjs'

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'umbrel-desktop-preview-'))
const fileRoot = path.join(temporary, 'files'),
	statePath = path.join(temporary, 'dashboard.json')
await fs.mkdir(fileRoot, {mode: 0o700})
await fs.writeFile(path.join(fileRoot, 'Willkommen.txt'), 'Dein privater Dateibereich.\n')
await fs.writeFile(path.join(fileRoot, 'Server-Notizen.md'), '# Mein Server\n')
await fs.mkdir(path.join(fileRoot, 'Dokumente'))
const store = await desktopStore(statePath)
await store.preferences({displayName: 'Nico', wallpaper: '18'})
const services = [
	'jellyfin',
	'adguard-home',
	'home-assistant',
	'nextcloud',
	'pi-hole',
	'plex',
	'ollama',
	'transmission',
	'tailscale',
	'uptime-kuma',
	'syncthing',
	'gitea',
	'vaultwarden',
	'immich',
]
const containers = services.map((name, index) => ({
	Id: (index + 1).toString(16).padStart(64, '0'),
	Names: [`/${name}`],
	Image: `${name}:latest`,
	State: index === 7 ? 'exited' : 'running',
	Status: index === 7 ? 'Exited' : 'Up',
	Labels: {},
	Ports: [{PublicPort: 8100 + index, Type: 'tcp'}],
}))
const server = await createDashboard({
	origin: 'http://localhost:8090',
	token: 'preview-only-access-key-not-for-production',
	fileRoot,
	statePath,
	uiRoot: path.resolve(import.meta.dirname, '../ui/dist-ubuntu'),
	preview: true,
	docker: async (method, endpoint) => {
		if (endpoint === '/containers/json?all=true') return containers
		const match = endpoint.match(/^\/containers\/([a-f0-9]{64})\/(json|start|stop|restart)/)
		const app = containers.find((c) => c.Id === match?.[1])
		if (!app) throw Object.assign(new Error('Unknown preview container'), {status: 404})
		if (method === 'GET') return {Config: {Labels: app.Labels}}
		app.State = match[2] === 'stop' ? 'exited' : 'running'
		app.Status = app.State === 'running' ? 'Up' : 'Exited'
		return null
	},
})
server.listen(8090, '127.0.0.1', () => console.info('Local simulated preview: http://localhost:8090'))
