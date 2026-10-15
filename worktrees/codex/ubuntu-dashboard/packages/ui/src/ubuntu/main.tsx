import {Cpu, Folder, Grid2X2, HardDrive, LogOut, MemoryStick, RefreshCw, Settings} from 'lucide-react'
import React, {useCallback, useEffect, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'

import 'inter-ui/inter.css'
import '@/index.css'
import './ubuntu.css'

import {Button} from '@/components/ui/button'
import UmbrelLogo from '@/components/umbrel-logo'

type System = {
	hostname: string
	platform: string
	release: string
	uptime: number
	cpu: number
	memory: {total: number; used: number}
	storage: {total: number; available: number}
	powerEnabled: boolean
	origin: string
}
type Container = {
	id: string
	name: string
	image: string
	state: string
	status: string
	managed: boolean
	ports: number[]
}
type Entry = {name: string; directory: boolean; size: number}
const bytes = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`
function appPortUrl(port: number) {
	const url = new URL(location.origin)
	url.port = String(port)
	return url.href
}

async function api<T>(endpoint: string, data?: unknown): Promise<T> {
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

function Dashboard() {
	const [authenticated, setAuthenticated] = useState(false)
	const [checking, setChecking] = useState(true)
	const [key, setKey] = useState('')
	const [system, setSystem] = useState<System>()
	const [containers, setContainers] = useState<Container[]>([])
	const [dockerError, setDockerError] = useState('')
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [busy, setBusy] = useState(false)
	const [tab, setTab] = useState('Apps')
	const [directory, setDirectory] = useState('')
	const currentDirectory = useRef(directory)
	currentDirectory.current = directory
	const [files, setFiles] = useState<Entry[]>([])
	const [truncated, setTruncated] = useState(false)
	const [folderName, setFolderName] = useState('')
	const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('ubuntu-wallpaper') || '1')
	const [powerConfirm, setPowerConfirm] = useState('')

	const refresh = useCallback(async () => {
		const value = await api<System>('system')
		setSystem(value)
		try {
			setContainers(await api<Container[]>('containers'))
			setDockerError('')
		} catch (e) {
			setDockerError((e as Error).message)
		}
	}, [])
	const loadFiles = useCallback(async () => {
		const listing = await api<{files: Entry[]; truncated: boolean}>(`files?path=${encodeURIComponent(directory)}`)
		if (currentDirectory.current !== directory) return
		setFiles(listing.files.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)))
		setTruncated(listing.truncated)
	}, [directory])
	useEffect(() => {
		const expired = () => {
			setAuthenticated(false)
			setContainers([])
			setFiles([])
			setSystem(undefined)
		}
		window.addEventListener('ubuntu-session-expired', expired)
		void api<System>('system')
			.then((value) => {
				setSystem(value)
				setAuthenticated(true)
			})
			.catch(() => {})
			.finally(() => setChecking(false))
		return () => window.removeEventListener('ubuntu-session-expired', expired)
	}, [])
	useEffect(() => {
		if (!authenticated) return
		let active = true
		let timer: ReturnType<typeof setTimeout>
		const poll = async () => {
			try {
				await refresh()
			} catch (e) {
				if (active) setError((e as Error).message)
			}
			if (active) timer = setTimeout(() => void poll(), 5000)
		}
		void poll()
		return () => {
			active = false
			clearTimeout(timer)
		}
	}, [authenticated, refresh])
	useEffect(() => {
		if (authenticated && tab === 'Dateien') {
			setFiles([])
			void loadFiles().catch((e) => setError(e.message))
		}
	}, [authenticated, tab, loadFiles])

	async function run(action: () => Promise<unknown>) {
		setBusy(true)
		setError('')
		setNotice('')
		try {
			await action()
		} catch (e) {
			setError((e as Error).message)
		} finally {
			setBusy(false)
		}
	}
	const childPath = (name: string) => [directory, name].filter(Boolean).join('/')
	async function upload(file: File) {
		if (file.size > 1_000_000) throw new Error('Maximale Dateigröße: 1 MB')
		const buffer = new Uint8Array(await file.arrayBuffer())
		let content = ''
		for (const byte of buffer) content += String.fromCharCode(byte)
		await api('files', {action: 'upload', path: childPath(file.name), content: btoa(content)})
		await loadFiles()
	}
	async function download(entry: Entry) {
		const {content} = await api<{content: string}>(`files/download?path=${encodeURIComponent(childPath(entry.name))}`)
		const blob = new Blob([Uint8Array.from(atob(content), (c) => c.charCodeAt(0))])
		const link = document.createElement('a')
		link.href = URL.createObjectURL(blob)
		link.download = entry.name
		link.click()
		setTimeout(() => URL.revokeObjectURL(link.href), 1000)
	}

	return (
		<div
			className='ubuntu-desktop'
			style={{backgroundImage: `linear-gradient(#0003,#0009),url(/assets/wallpapers/${wallpaper}.jpg)`}}
		>
			<header>
				<UmbrelLogo width={64} aria-label='Umbrel' />
				<span>
					Ubuntu Server <small>Community Dashboard</small>
				</span>
				{authenticated && (
					<Button
						onClick={() =>
							void run(async () => {
								await api('logout', {})
								setAuthenticated(false)
								setSystem(undefined)
								setFiles([])
								setContainers([])
							})
						}
					>
						<LogOut size={16} />
						Abmelden
					</Button>
				)}
			</header>
			<main>
				{error && (
					<div role='alert' className='ubuntu-error'>
						{error}
						<Button onClick={() => setError('')}>Schließen</Button>
					</div>
				)}
				{notice && <p role='status'>{notice}</p>}
				{checking ? (
					<p>Verbindung wird geprüft …</p>
				) : !authenticated ? (
					<form
						className='ubuntu-panel ubuntu-login'
						onSubmit={(e) => {
							e.preventDefault()
							void run(async () => {
								await api('login', {token: key})
								setKey('')
								setAuthenticated(true)
							})
						}}
					>
						<h1>Willkommen zu Hause.</h1>
						<p>Melde dich mit dem Zugriffsschlüssel deines Servers an.</p>
						<label>
							Zugriffsschlüssel
							<input
								type='password'
								autoComplete='current-password'
								value={key}
								onChange={(e) => setKey(e.target.value)}
								required
							/>
						</label>
						<Button type='submit' variant='primary' size='lg' disabled={busy}>
							Anmelden
						</Button>
					</form>
				) : (
					<>
						<h1>Willkommen auf {system?.hostname}</h1>
						<section className='ubuntu-metrics' aria-label='Systeminformationen'>
							<Metric icon={<Cpu />} label='CPU' value={`${system?.cpu ?? 0} %`} percent={system?.cpu ?? 0} />
							<Metric
								icon={<MemoryStick />}
								label='Arbeitsspeicher'
								value={system ? `${bytes(system.memory.used)} / ${bytes(system.memory.total)}` : '…'}
								percent={system ? (system.memory.used / system.memory.total) * 100 : 0}
							/>
							<Metric
								icon={<HardDrive />}
								label='Dateispeicher verfügbar'
								value={system ? `${bytes(system.storage.available)} / ${bytes(system.storage.total)}` : '…'}
								percent={system ? (1 - system.storage.available / system.storage.total) * 100 : 0}
							/>
						</section>
						<nav aria-label='Dashboard'>
							{[
								['Apps', Grid2X2],
								['Dateien', Folder],
								['Einstellungen', Settings],
							].map(([name, Icon]) => {
								const Component = Icon as typeof Folder
								return (
									<Button
										key={String(name)}
										variant={tab === name ? 'secondary' : 'default'}
										size='lg'
										onClick={() => {
											setTab(String(name))
											setError('')
										}}
									>
										<Component size={18} />
										{String(name)}
									</Button>
								)
							})}
						</nav>
						{tab === 'Apps' && (
							<section className='ubuntu-panel'>
								<div className='ubuntu-heading'>
									<h2>Deine Apps</h2>
									<Button disabled={busy} onClick={() => void run(refresh)}>
										<RefreshCw size={16} />
										Aktualisieren
									</Button>
								</div>
								{dockerError ? (
									<p role='alert'>{dockerError}</p>
								) : containers.length === 0 ? (
									<p>Keine Container vorhanden. Installiere deine Apps mit Docker Compose auf dem Server.</p>
								) : (
									<div className='ubuntu-apps'>
										{containers.map((container) => (
											<article key={container.id}>
												<div className='ubuntu-app-icon'>
													<img src='/assets/app-icon-placeholder.svg' alt='' />
												</div>
												<h3>{container.name}</h3>
												<p title={container.image}>{container.image}</p>
												<p>{container.status}</p>
												{container.ports.length > 0 && (
													<div className='ubuntu-actions'>
														{[...new Set(container.ports)].map((port) => (
															<a key={port} target='_blank' rel='noopener noreferrer' href={appPortUrl(port)}>
																Port {port} ↗
															</a>
														))}
													</div>
												)}
												{container.managed ? (
													<div className='ubuntu-actions'>
														{(container.state === 'running' ? ['stop', 'restart'] : ['start']).map((action) => (
															<Button
																disabled={busy}
																key={action}
																onClick={() => {
																	if (
																		window.confirm(
																			`${container.name}: ${action === 'stop' ? 'Stoppen' : action === 'restart' ? 'Neustarten' : 'Starten'}?`,
																		)
																	)
																		void run(async () => {
																			await api(`containers/${container.id}/${action}`, {})
																			await refresh()
																		})
																}}
															>
																{{start: 'Starten', stop: 'Stoppen', restart: 'Neustarten'}[action]}
															</Button>
														))}
													</div>
												) : (
													<small>Nur Anzeige · Verwaltungsfreigabe fehlt</small>
												)}
											</article>
										))}
									</div>
								)}
							</section>
						)}
						{tab === 'Dateien' && (
							<section className='ubuntu-panel'>
								<h2>Dateien</h2>
								<p>Privater Dashboard-Dateibereich · Upload/Download bis 1 MB · Ordner nur leer löschbar</p>
								<div className='ubuntu-actions'>
									<Button
										disabled={!directory || busy}
										onClick={() => setDirectory(directory.split('/').slice(0, -1).join('/'))}
									>
										↑ Übergeordnet
									</Button>
									<strong>/{directory}</strong>
									<Button disabled={busy} onClick={() => void run(loadFiles)}>
										Aktualisieren
									</Button>
								</div>
								<form
									className='ubuntu-actions'
									onSubmit={(e) => {
										e.preventDefault()
										void run(async () => {
											if (folderName.includes('/') || folderName.includes('\\'))
												throw new Error('Einfachen Ordnernamen verwenden')
											await api('files', {action: 'mkdir', path: childPath(folderName)})
											setFolderName('')
											await loadFiles()
										})
									}}
								>
									<input
										aria-label='Neuer Ordnername'
										value={folderName}
										onChange={(e) => setFolderName(e.target.value)}
										required
										placeholder='Neuer Ordner'
									/>
									<Button type='submit' disabled={busy}>
										Ordner erstellen
									</Button>
								</form>
								<label>
									Datei hochladen
									<input
										type='file'
										disabled={busy}
										onChange={(e) => {
											const file = e.target.files?.[0]
											if (file) void run(() => upload(file))
											e.target.value = ''
										}}
									/>
								</label>
								{truncated && <p role='status'>Anzeige auf 1000 Einträge begrenzt.</p>}
								<ul className='ubuntu-files'>
									{files.map((entry) => (
										<li key={entry.name}>
											<Button
												onClick={() =>
													entry.directory ? setDirectory(childPath(entry.name)) : void run(() => download(entry))
												}
											>
												{entry.directory ? '📁' : '📄'} {entry.name}
											</Button>
											<span>{entry.directory ? 'Ordner' : `${entry.size} B`}</span>
											<Button
												disabled={busy}
												onClick={() => {
													if (window.confirm(`${entry.name} endgültig löschen?`))
														void run(async () => {
															await api('files', {action: 'delete', path: childPath(entry.name)})
															await loadFiles()
														})
												}}
											>
												Löschen
											</Button>
										</li>
									))}
								</ul>
							</section>
						)}
						{tab === 'Einstellungen' && (
							<section className='ubuntu-panel'>
								<h2>Einstellungen</h2>
								<p>
									{system?.platform} · {system?.release}
								</p>
								<p>Laufzeit: {Math.floor((system?.uptime || 0) / 3600)} Stunden</p>
								<p>Serveradresse: {system?.origin}</p>
								<label>
									Hintergrund
									<select
										value={wallpaper}
										onChange={(e) => {
											setWallpaper(e.target.value)
											localStorage.setItem('ubuntu-wallpaper', e.target.value)
										}}
									>
										{['1', '2', '3', '4', '5', '6'].map((value) => (
											<option key={value} value={value}>
												Umbrel {value}
											</option>
										))}
									</select>
								</label>
								<h3>Systemsteuerung</h3>
								{system?.powerEnabled ? (
									<>
										<p>Zum Bestätigen den Hostnamen „{system.hostname}“ eingeben.</p>
										<input
											aria-label='Hostname bestätigen'
											value={powerConfirm}
											onChange={(e) => setPowerConfirm(e.target.value)}
										/>
										<div className='ubuntu-actions'>
											{['reboot', 'poweroff'].map((action) => (
												<Button
													variant='destructive'
													key={action}
													disabled={busy || powerConfirm !== system.hostname}
													onClick={() => {
														if (
															window.confirm(
																action === 'reboot' ? 'Server jetzt neu starten?' : 'Server jetzt herunterfahren?',
															)
														)
															void run(async () => {
																await api('power', {action, confirm: powerConfirm})
																setPowerConfirm('')
																setNotice('Systembefehl angenommen. Die Verbindung wird unterbrochen.')
															})
													}}
												>
													{action === 'reboot' ? 'Neustarten' : 'Herunterfahren'}
												</Button>
											))}
										</div>
									</>
								) : (
									<p>
										Neustart und Herunterfahren sind serverseitig deaktiviert. Die Anleitung erklärt die gezielte
										Freigabe.
									</p>
								)}
								<p className='ubuntu-muted'>
									Ubuntu bleibt das Betriebssystem. Dies ist eine unabhängige Anpassung; umbrelOS-Updates, App Store,
									RAID und Netzwerkkonfiguration werden hier nicht angeboten.
								</p>
							</section>
						)}
					</>
				)}
			</main>
		</div>
	)
}

function Metric({icon, label, value, percent}: {icon: React.ReactNode; label: string; value: string; percent: number}) {
	return (
		<article className='ubuntu-panel'>
			<div className='ubuntu-actions'>
				{icon}
				<span>{label}</span>
			</div>
			<strong>{value}</strong>
			<progress aria-label={label} max={100} value={Math.min(100, Math.max(0, percent))} />
		</article>
	)
}

createRoot(document.getElementById('root')!).render(<Dashboard />)
