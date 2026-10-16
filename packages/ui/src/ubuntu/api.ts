export type System = {
	hostname: string
	platform: string
	release: string
	uptime: number
	cpu: number
	threads: number
	memory: {total: number; used: number}
	storage: {total: number; available: number}
	powerEnabled: boolean
	origin: string
	preview?: boolean
}
export type Container = {
	id: string
	name: string
	containerName: string
	image: string
	icon: string
	url: string
	state: string
	status: string
	managed: boolean
	ports: number[]
}
export type Shortcut = {id: string; name: string; url: string; icon: string}
export type Desktop = {
	displayName: string
	wallpaper: string
	widgets: boolean
	shortcuts: Shortcut[]
	catalog: {id: string; name: string; icon: string}[]
}
export type Entry = {name: string; directory: boolean; size: number}
export const bytes = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`
export async function api<T = {ok: boolean}>(endpoint: string, data?: unknown): Promise<T> {
	const response = await fetch(`/api/${endpoint}`, {
		method: data === undefined ? 'GET' : 'POST',
		headers: data === undefined ? {} : {'Content-Type': 'application/json'},
		body: data === undefined ? undefined : JSON.stringify(data),
	})
	const result = await response.json()
	if (!response.ok) {
		if (response.status === 401) window.dispatchEvent(new Event('ubuntu-session-expired'))
		throw new Error(result.error || 'Anfrage fehlgeschlagen')
	}
	return result
}
export function containerUrl(container: Container) {
	if (container.url) return container.url
	if (!container.ports.length) return ''
	const url = new URL(location.origin)
	url.port = String(container.ports[0])
	return url.href
}
