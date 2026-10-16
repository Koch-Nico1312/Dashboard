import {useEffect, useState} from 'react'
import {TbArrowLeft, TbFile, TbFolder, TbRefresh, TbTrash, TbUpload} from 'react-icons/tb'

import {Button} from '@/components/ui/button'

import {api, type Entry} from './api'

export function FilesPanel({onChanged}: {onChanged: () => void}) {
	const [directory, setDirectory] = useState(''),
		[files, setFiles] = useState<Entry[]>([]),
		[folderName, setFolderName] = useState(''),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false),
		[truncated, setTruncated] = useState(false),
		[deleting, setDeleting] = useState<Entry>()
	const child = (name: string) => [directory, name].filter(Boolean).join('/')
	async function load() {
		const value = await api<{files: Entry[]; truncated: boolean}>(`files?path=${encodeURIComponent(directory)}`)
		setFiles(value.files.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)))
		setTruncated(value.truncated)
	}
	useEffect(() => {
		let active = true
		setFiles([])
		setError('')
		void api<{files: Entry[]; truncated: boolean}>(`files?path=${encodeURIComponent(directory)}`)
			.then((value) => {
				if (active) {
					setFiles(
						value.files.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)),
					)
					setTruncated(value.truncated)
				}
			})
			.catch((e) => {
				if (active) setError(e.message)
			})
		return () => {
			active = false
		}
	}, [directory])
	async function run(action: () => Promise<unknown>) {
		setBusy(true)
		setError('')
		try {
			await action()
			onChanged()
		} catch (e) {
			setError((e as Error).message)
		} finally {
			setBusy(false)
		}
	}
	async function download(entry: Entry) {
		const {content} = await api<{content: string}>(`files/download?path=${encodeURIComponent(child(entry.name))}`)
		const link = document.createElement('a')
		link.href = URL.createObjectURL(new Blob([Uint8Array.from(atob(content), (c) => c.charCodeAt(0))]))
		link.download = entry.name
		link.click()
		setTimeout(() => URL.revokeObjectURL(link.href), 1000)
	}
	return (
		<section className='files-panel'>
			<p className='panel-intro'>Dein privater Dateibereich · Upload und Download bis 1 MB</p>
			{error && (
				<p role='alert' className='desktop-error'>
					{error}
				</p>
			)}
			<div className='file-toolbar'>
				<Button disabled={!directory || busy} onClick={() => setDirectory(directory.split('/').slice(0, -1).join('/'))}>
					<TbArrowLeft />
					Zurück
				</Button>
				<strong>/{directory}</strong>
				<Button disabled={busy} onClick={() => void run(load)}>
					<TbRefresh />
					Aktualisieren
				</Button>
				<label className='file-upload'>
					<TbUpload />
					Hochladen
					<input
						aria-label='Datei hochladen'
						type='file'
						disabled={busy}
						onChange={(e) => {
							const file = e.target.files?.[0]
							if (file)
								void run(async () => {
									if (file.size > 1_000_000) throw new Error('Maximal 1 MB pro Datei')
									let content = ''
									for (const byte of new Uint8Array(await file.arrayBuffer())) content += String.fromCharCode(byte)
									await api('files', {action: 'upload', path: child(file.name), content: btoa(content)})
									await load()
								})
							e.target.value = ''
						}}
					/>
				</label>
			</div>
			<form
				className='actions'
				onSubmit={(e) => {
					e.preventDefault()
					void run(async () => {
						if (/[\\/]/.test(folderName)) throw new Error('Einfachen Ordnernamen verwenden')
						await api('files', {action: 'mkdir', path: child(folderName)})
						setFolderName('')
						await load()
					})
				}}
			>
				<input
					aria-label='Neuer Ordnername'
					placeholder='Neuer Ordner'
					value={folderName}
					onChange={(e) => setFolderName(e.target.value)}
					required
				/>
				<Button type='submit' disabled={busy}>
					Ordner erstellen
				</Button>
			</form>
			{deleting && (
				<div className='confirm-action'>
					<h3>„{deleting.name}“ endgültig löschen?</h3>
					<p>Ordner können nur gelöscht werden, wenn sie leer sind.</p>
					<div className='actions'>
						<Button
							variant='destructive'
							disabled={busy}
							onClick={() =>
								void run(async () => {
									await api('files', {action: 'delete', path: child(deleting.name)})
									setDeleting(undefined)
									await load()
								})
							}
						>
							Löschen bestätigen
						</Button>
						<Button onClick={() => setDeleting(undefined)}>Abbrechen</Button>
					</div>
				</div>
			)}
			{truncated && <p role='status'>Anzeige auf 1000 Einträge begrenzt.</p>}
			<ul className='file-list'>
				{files.map((entry) => (
					<li key={entry.name}>
						<button
							className='file-name'
							disabled={busy}
							onClick={() => (entry.directory ? setDirectory(child(entry.name)) : void run(() => download(entry)))}
						>
							{entry.directory ? <TbFolder /> : <TbFile />}
							<span>{entry.name}</span>
						</button>
						<small>{entry.directory ? 'Ordner' : `${entry.size} B`}</small>
						<Button disabled={busy} aria-label={`${entry.name} löschen`} onClick={() => setDeleting(entry)}>
							<TbTrash />
						</Button>
					</li>
				))}
			</ul>
			{!files.length && <p className='manager-empty'>Dieser Ordner ist leer.</p>}
		</section>
	)
}
