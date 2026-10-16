import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {appCatalog} from './app-catalog.mjs'

const invalid = (message) => Object.assign(new Error(message), {status: 400})
export function webUrl(value, optional = false) {
	if (optional && value === '') return ''
	if (typeof value !== 'string' || value.length > 2048) throw invalid('Invalid application URL')
	let url
	try {
		url = new URL(value)
	} catch {
		throw invalid('Use a complete http:// or https:// address')
	}
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
		throw invalid('Only HTTP(S) addresses without embedded credentials are allowed')
	return url.href
}
function name(value) {
	if (typeof value !== 'string' || !value.trim() || value.length > 80)
		throw invalid('Name must contain 1–80 characters')
	return value.trim()
}
function icon(value) {
	if (!appCatalog.some((app) => app.id === value)) throw invalid('Unknown app icon')
	return value
}

export async function desktopStore(statePath) {
	let state = {displayName: '', wallpaper: '18', widgets: true, containers: {}, shortcuts: []}
	try {
		state = {...state, ...JSON.parse(await fs.readFile(statePath, 'utf8'))}
	} catch (error) {
		if (error.code !== 'ENOENT') throw error
	}
	let queue = Promise.resolve()
	function update(mutation) {
		const operation = queue.then(async () => {
			const next = structuredClone(state)
			const result = mutation(next)
			await fs.mkdir(path.dirname(statePath), {recursive: true, mode: 0o700})
			const temporary = `${statePath}.${randomUUID()}.tmp`
			try {
				await fs.writeFile(temporary, JSON.stringify(next), {mode: 0o600, flag: 'wx'})
				await fs.rename(temporary, statePath)
			} finally {
				await fs.rm(temporary, {force: true})
			}
			state = next
			return result
		})
		queue = operation.catch(() => {})
		return operation
	}
	return {
		get: () => structuredClone(state),
		preferences: (input) =>
			update((next) => {
				if (input.displayName !== undefined) next.displayName = name(input.displayName)
				if (input.wallpaper !== undefined) {
					if (!/^(?:[1-9]|1[0-9]|2[0-5])$/.test(String(input.wallpaper))) throw invalid('Unknown wallpaper')
					next.wallpaper = String(input.wallpaper)
				}
				if (input.widgets !== undefined) {
					if (typeof input.widgets !== 'boolean') throw invalid('Invalid widget preference')
					next.widgets = input.widgets
				}
			}),
		container: (id, input) =>
			update((next) => {
				const entry = next.containers[id] || {}
				if (input.name !== undefined) entry.name = name(input.name)
				if (input.url !== undefined) entry.url = webUrl(input.url, true)
				if (input.icon !== undefined) entry.icon = icon(input.icon)
				if (input.managed !== undefined) {
					if (typeof input.managed !== 'boolean') throw invalid('Invalid management permission')
					entry.managed = input.managed
				}
				next.containers[id] = entry
			}),
		shortcut: (input) =>
			update((next) => {
				if (input.action === 'delete') {
					if (!next.shortcuts.some((app) => app.id === input.id)) throw invalid('Unknown application')
					next.shortcuts = next.shortcuts.filter((app) => app.id !== input.id)
					return
				}
				if (input.action !== 'save') throw invalid('Unknown application action')
				if (input.id && !next.shortcuts.some((app) => app.id === input.id)) throw invalid('Unknown application')
				if (!input.id && next.shortcuts.length >= 200) throw invalid('Application limit reached')
				const app = {
					id: input.id || randomUUID(),
					name: name(input.name),
					url: webUrl(input.url),
					icon: icon(input.icon || 'docker'),
				}
				next.shortcuts = [...next.shortcuts.filter((item) => item.id !== app.id), app]
			}),
	}
}
