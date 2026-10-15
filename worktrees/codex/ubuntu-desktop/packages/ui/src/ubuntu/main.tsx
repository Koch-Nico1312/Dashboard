import * as Dialog from '@radix-ui/react-dialog'
import React, {useCallback, useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {
	TbApps,
	TbCheck,
	TbChevronLeft,
	TbChevronRight,
	TbCircuitCell,
	TbCpu,
	TbDeviceFloppy,
	TbExternalLink,
	TbFile,
	TbFolder,
	TbLock,
	TbLogout,
	TbPencil,
	TbPlayerPlay,
	TbPlayerStop,
	TbPlus,
	TbPower,
	TbRefresh,
	TbSearch,
	TbSettings,
	TbTrash,
	TbUser,
	TbX,
} from 'react-icons/tb'

import 'inter-ui/inter.css'
import '@/index.css'
import './ubuntu.css'

import {Button} from '@/components/ui/button'
import {Switch} from '@/components/ui/switch'
import UmbrelLogo from '@/components/umbrel-logo'

import {api, bytes, containerUrl, type Container, type Desktop, type Entry, type Shortcut, type System} from './api'
import {FilesPanel} from './files-panel'

type Panel = 'apps' | 'settings' | 'files' | 'search' | null
type App = (Container & {kind: 'container'}) | (Shortcut & {kind: 'shortcut'})
const wallpaperUrl = (id: string) => `/assets/wallpapers/${id}.jpg`
const greeting = () =>
	new Date().getHours() < 12 ? 'Guten Morgen' : new Date().getHours() < 18 ? 'Guten Tag' : 'Guten Abend'

function Dashboard() {
	const [authenticated, setAuthenticated] = useState(false),
		[checking, setChecking] = useState(true),
		[key, setKey] = useState('')
	const [system, setSystem] = useState<System>(),
		[desktop, setDesktop] = useState<Desktop>(),
		[containers, setContainers] = useState<Container[]>([]),
		[recent, setRecent] = useState<Entry[]>([])
	const [dockerError, setDockerError] = useState(''),
		[error, setError] = useState(''),
		[notice, setNotice] = useState(''),
		[busy, setBusy] = useState(false)
	const [panel, setPanel] = useState<Panel>(null),
		[page, setPage] = useState(0),
		[search, setSearch] = useState(''),
		[selected, setSelected] = useState('')
	const [nameDraft, setNameDraft] = useState(''),
		[editingName, setEditingName] = useState(false),
		[powerConfirm, setPowerConfirm] = useState('')
	const [pending, setPending] = useState<{title: string; description: string; action: () => Promise<unknown>} | null>(
		null,
	)
	const [draft, setDraft] = useState({name: '', url: '', icon: 'docker'})
	const wallpaper = desktop?.wallpaper || '18'
	const openPanel = (value: Panel) => {
		setPanel(value)
		setError('')
		setNotice('')
		setSelected('')
		setSearch('')
		setPending(null)
	}
	const refresh = useCallback(async () => {
		const [info, preferences] = await Promise.all([api<System>('system'), api<Desktop>('desktop')])
		setSystem(info)
		setDesktop(preferences)
		try {
			setContainers(await api<Container[]>('containers'))
			setDockerError('')
		} catch (e) {
			setDockerError((e as Error).message)
		}
		try {
			setRecent((await api<{files: Entry[]}>('files')).files.slice(0, 3))
		} catch {
			setRecent([])
		}
	}, [])
	useEffect(() => {
		const expired = () => {
			setAuthenticated(false)
			setPanel(null)
			setContainers([])
			setDesktop(undefined)
			setSystem(undefined)
			setKey('')
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
		let active = true,
			timer: ReturnType<typeof setTimeout>
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
		const onKey = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'k' && authenticated) {
				event.preventDefault()
				setSearch('')
				setPanel('search')
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [authenticated])
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
	const apps: App[] = [
		...containers.map((app) => ({...app, kind: 'container' as const})),
		...(desktop?.shortcuts || []).map((app) => ({...app, kind: 'shortcut' as const})),
	]
	const filtered = apps.filter((app) =>
		`${app.name} ${app.kind === 'container' ? app.containerName + ' ' + app.image : app.url}`
			.toLowerCase()
			.includes(search.toLowerCase()),
	)
	const pages = Math.max(1, Math.ceil(apps.length / 12)),
		safePage = Math.min(page, pages - 1)
	const activeApp = apps.find((app) => app.id === selected)
	function iconSrc(id: string) {
		return desktop?.catalog.find((app) => app.id === id)?.icon || '/assets/ubuntu-apps/docker.svg'
	}
	function appImage(app: {icon: string; name: string}) {
		return <img src={iconSrc(app.icon)} alt='' draggable={false} />
	}
	function edit(app: App) {
		setSelected(app.id)
		setDraft({name: app.name, url: app.url, icon: app.icon})
		setPanel('apps')
		setSearch('')
		setPending(null)
	}
	function launch(app: App) {
		const url = app.kind === 'container' ? containerUrl(app) : app.url
		if (url && (app.kind !== 'container' || app.state === 'running')) {
			window.open(url, '_blank', 'noopener,noreferrer')
			return
		}
		edit(app)
	}
	async function savePreferences(value: Partial<Desktop>) {
		await api('desktop', value)
		await refresh()
	}
	async function logout() {
		await api('logout', {})
		setAuthenticated(false)
		setPanel(null)
		setSystem(undefined)
		setDesktop(undefined)
		setContainers([])
	}
	function askContainer(app: Container, action: string) {
		setPending({
			title: `${app.name} ${action === 'start' ? 'starten' : action === 'stop' ? 'stoppen' : 'neu starten'}?`,
			description: `Diese Aktion betrifft den Container „${app.containerName}“.`,
			action: async () => {
				await api(`containers/${app.id}/${action}`, {})
				setPending(null)
				await refresh()
				setNotice('Container-Aktion abgeschlossen.')
			},
		})
	}
	function dock() {
		return (
			<nav className='desktop-dock' aria-label='Dock'>
				<button title='Startseite' aria-label='Startseite' onClick={() => openPanel(null)}>
					<img src='/assets/umbrel-app.svg' alt='' />
					<i data-active={!panel} />
				</button>
				{(
					[
						['apps', 'dock-app-store.webp', 'Apps verwalten'],
						['files', 'dock-files.webp', 'Dateien'],
						['settings', 'dock-settings.webp', 'Einstellungen'],
						['search', 'dock-live-usage.webp', 'Suche'],
					] as const
				).map(([value, src, label]) => (
					<button key={value} title={label} aria-label={label} onClick={() => openPanel(value)}>
						<img src={`/assets/dock/${src}`} alt='' />
						<i data-active={panel === value} />
					</button>
				))}
			</nav>
		)
	}
	function feedback() {
		return (
			<>
				{error && (
					<div className='desktop-error' role='alert'>
						{error}
						<button aria-label='Fehler schließen' onClick={() => setError('')}>
							<TbX />
						</button>
					</div>
				)}
				{notice && (
					<p className='desktop-notice' role='status'>
						{notice}
					</p>
				)}
			</>
		)
	}
	function meter(label: string, used: number, total: number, free: string) {
		return (
			<article className='settings-meter'>
				<h3>{label}</h3>
				<p>
					<strong>{bytes(used)}</strong>
					<span> / {bytes(total)}</span>
					<small>{free}</small>
				</p>
				<progress value={used} max={total || 1} aria-label={label} />
			</article>
		)
	}

	return (
		<div className='ubuntu-desktop' style={{backgroundImage: `url(${wallpaperUrl(wallpaper)})`}}>
			{system?.preview && <span className='preview-badge'>Vorschau · Beispiel-Apps</span>}
			{checking ? (
				<div className='desktop-loading'>Verbindung wird geprüft …</div>
			) : !authenticated ? (
				<form
					className='desktop-login'
					onSubmit={(e) => {
						e.preventDefault()
						void run(async () => {
							await api('login', {token: key})
							setKey('')
							setAuthenticated(true)
						})
					}}
				>
					<UmbrelLogo />
					<h1>Willkommen zu Hause.</h1>
					<p>Dein Server. Deine Anwendungen.</p>
					{feedback()}
					<label>
						Zugriffsschlüssel
						<input
							type='password'
							value={key}
							onChange={(e) => setKey(e.target.value)}
							autoComplete='current-password'
							required
						/>
					</label>
					<Button type='submit' size='lg' variant='primary' disabled={busy}>
						Anmelden
					</Button>
				</form>
			) : (
				<>
					<main className='desktop-home'>
						<header className='desktop-greeting'>
							<UmbrelLogo />
							<h1>
								{greeting()}, {desktop?.displayName || system?.hostname || 'zu Hause'}.
							</h1>
						</header>
						{!panel && feedback()}
						{desktop?.widgets !== false && (
							<section className='desktop-widgets' aria-label='Widgets'>
								<div>
									<button className='home-widget files-widget' onClick={() => openPanel('files')}>
										<span>Deine Dateien</span>
										{recent.length ? (
											recent.map((file) => (
												<div className='widget-file' key={file.name}>
													{file.directory ? <TbFolder /> : <TbFile />}
													<strong>{file.name}</strong>
													<small>{file.directory ? 'Ordner' : `${Math.round(file.size / 1024)} KB`}</small>
												</div>
											))
										) : (
											<div className='widget-empty'>
												<TbFolder />
												<p>Platz für deine Dateien</p>
												<small>Dateiverwaltung öffnen</small>
											</div>
										)}
									</button>
									<p>Dateien</p>
								</div>
								<div>
									<button className='home-widget stats-widget' onClick={() => openPanel('settings')}>
										<div>
											<TbCpu />
											<span>CPU</span>
											<strong>{system?.cpu ?? 0} %</strong>
										</div>
										<div>
											<TbDeviceFloppy />
											<span>Frei</span>
											<strong>{bytes(system?.storage.available || 0)}</strong>
										</div>
										<div>
											<TbCircuitCell />
											<span>RAM</span>
											<strong>{bytes(system?.memory.used || 0)}</strong>
										</div>
									</button>
									<p>System</p>
								</div>
								<div>
									<button className='home-widget activity-widget' onClick={() => openPanel('apps')}>
										<span>Deine Anwendungen</span>
										<div>
											<i className='status-dot running' />
											<strong>{containers.filter((app) => app.state === 'running').length} laufen</strong>
										</div>
										<div>
											<i className='status-dot stopped' />
											<span>{containers.filter((app) => app.state !== 'running').length} gestoppt</span>
										</div>
										<div>
											<TbExternalLink />
											<span>{desktop?.shortcuts.length || 0} Verknüpfungen</span>
										</div>
										<b>{apps.length}</b>
									</button>
									<p>Anwendungen</p>
								</div>
							</section>
						)}
						<section className='desktop-app-region' aria-label='Deine Anwendungen'>
							{pages > 1 && (
								<button
									className='page-arrow previous'
									aria-label='Vorherige App-Seite'
									disabled={safePage === 0}
									onClick={() => setPage(safePage - 1)}
								>
									<TbChevronLeft />
								</button>
							)}
							<div className='desktop-app-grid'>
								{apps.slice(safePage * 12, safePage * 12 + 12).map((app) => (
									<div className='desktop-app' key={app.id}>
										<button
											className='app-launch'
											onClick={() => launch(app)}
											title={app.kind === 'container' ? `${app.containerName} · ${app.status}` : app.url}
										>
											{appImage(app)}
											{app.kind === 'container' && app.state !== 'running' && (
												<span className='app-stopped'>
													<TbPlayerStop />
												</span>
											)}
											<span>{app.name}</span>
										</button>
										<button className='app-edit' aria-label={`${app.name} verwalten`} onClick={() => edit(app)}>
											<TbSettings />
										</button>
									</div>
								))}
							</div>
							{!apps.length && (
								<div className='desktop-empty'>
									<TbApps size={36} />
									<h2>{dockerError ? 'Docker ist nicht erreichbar' : 'Deine Anwendungen erscheinen hier'}</h2>
									<p>
										{dockerError ||
											'Vorhandene Docker-Container werden automatisch erkannt. Weitere Anwendungen kannst du als Verknüpfung hinzufügen.'}
									</p>
									<Button size='lg' onClick={() => openPanel('apps')}>
										Apps verwalten
									</Button>
								</div>
							)}
							{dockerError && apps.length > 0 && (
								<p role='alert' className='desktop-warning'>
									{dockerError}
								</p>
							)}
							{pages > 1 && (
								<button
									className='page-arrow next'
									aria-label='Nächste App-Seite'
									disabled={safePage === pages - 1}
									onClick={() => setPage(safePage + 1)}
								>
									<TbChevronRight />
								</button>
							)}
						</section>
						<div className='desktop-pagination' aria-label='App-Seiten'>
							{Array.from({length: pages}, (_, i) => (
								<button
									key={i}
									aria-label={`App-Seite ${i + 1}`}
									aria-current={safePage === i ? 'page' : undefined}
									onClick={() => setPage(i)}
								/>
							))}
						</div>
						<button className='desktop-search' onClick={() => openPanel('search')}>
							<TbSearch />
							Suche <kbd>Strg K</kbd>
						</button>
					</main>
					{!panel && dock()}
					<Dialog.Root
						open={panel !== null}
						onOpenChange={(open) => {
							if (!open) openPanel(null)
						}}
					>
						<Dialog.Portal>
							<Dialog.Overlay className='desktop-window-backdrop' />
							<Dialog.Content className={`desktop-window ${panel === 'search' ? 'search-window' : ''}`}>
								<Dialog.Title>
									{panel === 'settings'
										? 'Einstellungen'
										: panel === 'files'
											? 'Dateien'
											: panel === 'search'
												? 'Suche'
												: 'Apps verwalten'}
								</Dialog.Title>
								<Dialog.Description className='sr-only'>
									Verwalte deinen Ubuntu Server und deine Anwendungen.
								</Dialog.Description>
								<Dialog.Close className='window-close' aria-label='Fenster schließen'>
									<TbX />
								</Dialog.Close>
								{feedback()}
								{pending && (
									<section className='confirm-action' role='alertdialog' aria-label={pending.title}>
										<h3>{pending.title}</h3>
										<p>{pending.description}</p>
										<div className='actions'>
											<Button variant='destructive' disabled={busy} onClick={() => void run(pending.action)}>
												Bestätigen
											</Button>
											<Button disabled={busy} onClick={() => setPending(null)}>
												Abbrechen
											</Button>
										</div>
									</section>
								)}
								{panel === 'settings' && system && desktop && (
									<div className='settings-layout'>
										<aside>
											<button
												className='desktop-miniature'
												onClick={() => openPanel(null)}
												aria-label='Desktop-Vorschau öffnen'
												style={{backgroundImage: `url(${wallpaperUrl(wallpaper)})`}}
											>
												<UmbrelLogo />
												<strong>
													{greeting()}, {desktop.displayName || system.hostname}.
												</strong>
												<div>
													{apps.slice(0, 6).map((app) => (
														<img key={app.id} src={iconSrc(app.icon)} alt='' />
													))}
												</div>
												<span>
													<img src='/assets/umbrel-app.svg' alt='' />
													<img src='/assets/dock/dock-files.webp' alt='' />
													<img src='/assets/dock/dock-settings.webp' alt='' />
												</span>
											</button>
											{meter(
												'Speicher',
												system.storage.total - system.storage.available,
												system.storage.total,
												`${bytes(system.storage.available)} frei`,
											)}
											{meter(
												'Arbeitsspeicher',
												system.memory.used,
												system.memory.total,
												`${bytes(system.memory.total - system.memory.used)} frei`,
											)}
											<article className='settings-meter'>
												<h3>CPU</h3>
												<p>
													<strong>{system.cpu} %</strong>
													<small>{system.threads} Threads</small>
												</p>
												<progress max={100} value={system.cpu} aria-label='CPU' />
											</article>
										</aside>
										<div className='settings-main'>
											<section className='device-card'>
												<div>
													<h2>
														{desktop.displayName || system.hostname}
														<span>’s Server</span>
													</h2>
													<dl>
														<dt>Gerät</dt>
														<dd>{system.hostname}</dd>
														<dt>Betriebssystem</dt>
														<dd>{system.platform === 'linux' ? 'Ubuntu / Linux' : system.platform}</dd>
														<dt>Laufzeit</dt>
														<dd>{Math.floor(system.uptime / 3600)} Stunden</dd>
													</dl>
												</div>
												<div className='actions'>
													<Button size='lg' onClick={() => void run(logout)}>
														<TbLogout />
														Abmelden
													</Button>
													{(['reboot', 'poweroff'] as const).map((action) => (
														<Button
															size='lg'
															key={action}
															disabled={!system.powerEnabled || busy || powerConfirm !== system.hostname}
															title={!system.powerEnabled ? 'Serverseitig deaktiviert' : 'Hostnamen unten bestätigen'}
															onClick={() =>
																setPending({
																	title: action === 'reboot' ? 'Server neu starten?' : 'Server herunterfahren?',
																	description: 'Die Verbindung zum Server wird unterbrochen.',
																	action: async () => {
																		await api('power', {action, confirm: powerConfirm})
																		setPending(null)
																		setPowerConfirm('')
																		setNotice('Systembefehl angenommen.')
																	},
																})
															}
														>
															<TbPower />
															{action === 'reboot' ? 'Neustarten' : 'Herunterfahren'}
														</Button>
													))}
												</div>
											</section>
											<section className='settings-list'>
												<div className='settings-row'>
													<div>
														<h3>Profil</h3>
														<p>Dein Name in der Begrüßung</p>
													</div>
													{editingName ? (
														<form
															className='actions'
															onSubmit={(e) => {
																e.preventDefault()
																void run(async () => {
																	await savePreferences({displayName: nameDraft})
																	setEditingName(false)
																})
															}}
														>
															<input
																aria-label='Anzeigename'
																maxLength={80}
																value={nameDraft}
																onChange={(e) => setNameDraft(e.target.value)}
																required
																autoFocus
															/>
															<Button type='submit' disabled={busy}>
																<TbCheck />
																Speichern
															</Button>
														</form>
													) : (
														<Button
															onClick={() => {
																setNameDraft(desktop.displayName || system.hostname)
																setEditingName(true)
															}}
														>
															<TbUser />
															Name ändern
														</Button>
													)}
												</div>
												<div className='settings-row wallpaper-row'>
													<div>
														<h3>Hintergrund</h3>
														<p>Dein Desktop, dein Stil</p>
													</div>
													<div className='wallpaper-options'>
														{['1', '2', '4', '14', '15', '16', '17', '18', '19', '20', '21'].map((id) => (
															<button
																aria-label={`Hintergrund ${id}`}
																aria-pressed={wallpaper === id}
																disabled={busy}
																key={id}
																onClick={() => void run(() => savePreferences({wallpaper: id}))}
															>
																<img src={wallpaperUrl(id)} alt='' />
															</button>
														))}
													</div>
												</div>
												<div className='settings-row'>
													<div>
														<h3>Widgets</h3>
														<p>Dateien, System und Anwendungen auf dem Desktop</p>
													</div>
													<Switch
														aria-label='Widgets anzeigen'
														checked={desktop.widgets}
														disabled={busy}
														onCheckedChange={(widgets) => void run(() => savePreferences({widgets}))}
													/>
												</div>
												<div className='settings-row'>
													<div>
														<h3>Anwendungen</h3>
														<p>
															{containers.length} Docker-Container und {desktop.shortcuts.length} Verknüpfungen
														</p>
													</div>
													<Button onClick={() => openPanel('apps')}>
														<TbApps />
														Verwalten
													</Button>
												</div>
												<div className='settings-row'>
													<div>
														<h3>Zugriffsschlüssel</h3>
														<p>Wird über die geschützte Schlüsseldatei auf deinem Server verwaltet.</p>
													</div>
													<TbLock size={22} />
												</div>
												<div className='settings-row'>
													<div>
														<h3>Systemsteuerung</h3>
														<p>
															{system.powerEnabled
																? `Zur Bestätigung „${system.hostname}“ eingeben.`
																: 'Neustart und Herunterfahren sind serverseitig deaktiviert.'}
														</p>
													</div>
													{system.powerEnabled && (
														<input
															aria-label='Hostname bestätigen'
															value={powerConfirm}
															onChange={(e) => setPowerConfirm(e.target.value)}
														/>
													)}
												</div>
												<div className='settings-row'>
													<div>
														<h3>Serverinformationen</h3>
														<p>
															{system.origin}
															<br />
															Kernel {system.release}
														</p>
													</div>
													<span className='ubuntu-badge'>Ubuntu Server</span>
												</div>
											</section>
										</div>
									</div>
								)}
								{panel === 'files' && <FilesPanel onChanged={() => void refresh().catch((e) => setError(e.message))} />}
								{(panel === 'apps' || panel === 'search') && (
									<>
										<div className='app-manager-toolbar'>
											<label className='search-input'>
												<TbSearch />
												<input
													aria-label='Anwendungen suchen'
													placeholder='Anwendungen suchen …'
													value={search}
													onChange={(e) => setSearch(e.target.value)}
													autoFocus={panel === 'search'}
												/>
											</label>
											{panel === 'apps' && (
												<>
													<Button disabled={busy} onClick={() => void run(refresh)}>
														<TbRefresh />
														Aktualisieren
													</Button>
													<Button
														onClick={() => {
															setSelected('new')
															setDraft({name: '', url: '', icon: 'docker'})
														}}
													>
														<TbPlus />
														Anwendung hinzufügen
													</Button>
												</>
											)}
										</div>
										{dockerError && (
											<p className='desktop-warning' role='alert'>
												{dockerError}
											</p>
										)}
										{panel === 'apps' && selected && (
											<section className='app-editor'>
												<div className='app-editor-heading'>
													<h2>{selected === 'new' ? 'Anwendung hinzufügen' : activeApp?.name}</h2>
													<Button aria-label='Bearbeitung schließen' onClick={() => setSelected('')}>
														<TbX />
													</Button>
												</div>
												{activeApp?.kind === 'container' && (
													<>
														<p>
															{activeApp.containerName} · {activeApp.image}
															<br />
															{activeApp.status}
														</p>
														<div className='settings-row'>
															<div>
																<h3>Verwaltung erlauben</h3>
																<p>Starten, Stoppen und Neustarten dieses Containers freigeben</p>
															</div>
															<Switch
																checked={activeApp.managed}
																disabled={busy}
																aria-label='Container-Verwaltung erlauben'
																onCheckedChange={(managed) =>
																	void run(async () => {
																		await api(`containers/${activeApp.id}/settings`, {managed})
																		await refresh()
																	})
																}
															/>
														</div>
														<div className='actions'>
															{(activeApp.state === 'running' ? ['stop', 'restart'] : ['start']).map((action) => (
																<Button
																	disabled={!activeApp.managed || busy}
																	key={action}
																	onClick={() => askContainer(activeApp, action)}
																>
																	{action === 'start' ? (
																		<TbPlayerPlay />
																	) : action === 'stop' ? (
																		<TbPlayerStop />
																	) : (
																		<TbRefresh />
																	)}
																	{action === 'start' ? 'Starten' : action === 'stop' ? 'Stoppen' : 'Neustarten'}
																</Button>
															))}
															{containerUrl(activeApp) && (
																<a
																	className='app-open-link'
																	href={containerUrl(activeApp)}
																	target='_blank'
																	rel='noopener noreferrer'
																>
																	<TbExternalLink />
																	Öffnen
																</a>
															)}
														</div>
													</>
												)}
												<form
													onSubmit={(e) => {
														e.preventDefault()
														void run(async () => {
															if (activeApp?.kind === 'container')
																await api(`containers/${activeApp.id}/settings`, draft)
															else
																await api('shortcuts', {
																	action: 'save',
																	...(activeApp ? {id: activeApp.id} : {}),
																	...draft,
																})
															await refresh()
															setSelected('')
															setNotice('Anwendung gespeichert.')
														})
													}}
												>
													<div className='editor-fields'>
														<label>
															Name
															<input
																value={draft.name}
																maxLength={80}
																onChange={(e) => setDraft({...draft, name: e.target.value})}
																required
															/>
														</label>
														<label>
															Webadresse
															<input
																type='url'
																placeholder={
																	activeApp?.kind === 'container'
																		? 'Automatisch aus veröffentlichtem Port'
																		: 'https://anwendung.example'
																}
																value={draft.url}
																onChange={(e) => setDraft({...draft, url: e.target.value})}
																required={activeApp?.kind !== 'container'}
															/>
														</label>
														<label>
															App-Symbol
															<select value={draft.icon} onChange={(e) => setDraft({...draft, icon: e.target.value})}>
																{desktop?.catalog.map((app) => (
																	<option key={app.id} value={app.id}>
																		{app.name}
																	</option>
																))}
															</select>
														</label>
													</div>
													<div className='actions'>
														<Button type='submit' variant='primary' disabled={busy}>
															Speichern
														</Button>
														{activeApp?.kind === 'shortcut' && (
															<Button
																variant='destructive'
																onClick={() =>
																	setPending({
																		title: 'Verknüpfung entfernen?',
																		description: `„${activeApp.name}“ wird aus deinem Desktop entfernt. Die Anwendung selbst bleibt erhalten.`,
																		action: async () => {
																			await api('shortcuts', {action: 'delete', id: activeApp.id})
																			setPending(null)
																			setSelected('')
																			await refresh()
																		},
																	})
																}
															>
																<TbTrash />
																Entfernen
															</Button>
														)}
													</div>
												</form>
											</section>
										)}
										<div className='managed-app-list'>
											{filtered.map((app) => (
												<article key={app.id}>
													{appImage(app)}
													<div>
														<h3>{app.name}</h3>
														<p>
															{app.kind === 'container'
																? `${app.containerName} · ${app.state === 'running' ? 'Läuft' : 'Gestoppt'}`
																: app.url}
														</p>
													</div>
													<span className='app-kind'>{app.kind === 'container' ? 'Docker' : 'Web-App'}</span>
													{panel === 'search' ? (
														<Button onClick={() => launch(app)}>
															Öffnen
															<TbExternalLink />
														</Button>
													) : (
														<Button onClick={() => edit(app)}>
															<TbPencil />
															Verwalten
														</Button>
													)}
												</article>
											))}
										</div>
										{!filtered.length && (
											<p className='manager-empty'>
												{search
													? 'Keine passende Anwendung gefunden.'
													: 'Noch keine Anwendungen vorhanden. Docker-Container erscheinen automatisch; Web-Apps kannst du hinzufügen.'}
											</p>
										)}
									</>
								)}
								{dock()}
							</Dialog.Content>
						</Dialog.Portal>
					</Dialog.Root>
				</>
			)}
		</div>
	)
}

createRoot(document.getElementById('root')!).render(<Dashboard />)
