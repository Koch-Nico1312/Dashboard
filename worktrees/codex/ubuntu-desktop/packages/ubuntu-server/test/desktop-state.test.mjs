import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {desktopStore, webUrl} from '../desktop-state.mjs'
import {identifyApp} from '../app-catalog.mjs'

test('desktop preferences, shortcuts and grants survive restart without lost parallel writes', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-state-'))
	try {
		const statePath = path.join(root, 'state.json'),
			store = await desktopStore(statePath)
		await Promise.all([
			store.preferences({displayName: 'Nico', wallpaper: '18', widgets: false}),
			store.container('a'.repeat(64), {managed: true, name: 'Filme', url: 'http://server:8096', icon: 'jellyfin'}),
			store.shortcut({action: 'save', name: 'Router', url: 'https://192.168.1.1', icon: 'docker'}),
		])
		const restarted = await desktopStore(statePath),
			saved = restarted.get()
		assert.equal(saved.displayName, 'Nico')
		assert.equal(saved.widgets, false)
		assert.equal(saved.containers['a'.repeat(64)].managed, true)
		assert.equal(saved.shortcuts.length, 1)
		await restarted.container('a'.repeat(64), {managed: false})
		assert.equal(restarted.get().containers['a'.repeat(64)].managed, false)
		assert.equal(restarted.get().containers['a'.repeat(64)].name, 'Filme')
		await restarted.shortcut({
			action: 'save',
			id: saved.shortcuts[0].id,
			name: 'Heimnetz',
			url: 'http://192.168.1.1',
			icon: 'docker',
		})
		assert.equal(restarted.get().shortcuts.length, 1)
		await restarted.shortcut({action: 'delete', id: saved.shortcuts[0].id})
		assert.equal(restarted.get().shortcuts.length, 0)
		if (process.platform === 'linux') assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600)
	} finally {
		await fs.rm(root, {recursive: true, force: true})
	}
})
test('desktop input validation rejects unsafe URLs and does not poison the write queue', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-invalid-'))
	try {
		const store = await desktopStore(path.join(root, 'state.json'))
		for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:password@server', '/relative']) {
			assert.throws(() => webUrl(url), {status: 400})
			await assert.rejects(store.shortcut({action: 'save', name: 'Unsafe', url, icon: 'docker'}), {status: 400})
		}
		await assert.rejects(store.preferences({wallpaper: '../../private'}), {status: 400})
		await assert.rejects(store.container('a'.repeat(64), {managed: 'true'}), {status: 400})
		await assert.rejects(store.container('a'.repeat(64), {icon: 'https://evil.example/icon.svg'}), {status: 400})
		await assert.rejects(
			store.shortcut({action: 'save', id: 'missing', name: 'Unsafe', url: 'http://server', icon: 'docker'}),
			{status: 400},
		)
		await store.preferences({displayName: 'Valid'})
		assert.equal(store.get().displayName, 'Valid')
		assert.equal(store.get().shortcuts.length, 0)
	} finally {
		await fs.rm(root, {recursive: true, force: true})
	}
})
test('known container images get brand metadata; unknown services retain a Docker identity', () => {
	assert.equal(identifyApp('ghcr.io/home-assistant/home-assistant:stable', 'ha').id, 'home-assistant')
	assert.equal(identifyApp('adguard/adguardhome:latest', 'dns').id, 'adguard-home')
	assert.equal(identifyApp('company/private:1', 'internal-service').id, 'docker')
})
