import { useEffect, useRef, useState } from 'react'
import { allSounds } from '../curriculum'

type ClipStatus = 'missing' | 'recorded' | 'new'

/**
 * Dev-only recording studio (/opnemen): record the family voice clips.
 * Saves .webm files via the File System Access API into a chosen folder
 * (pick app/public/audio/sounds), then run `node tools/convert-audio.mjs`
 * to convert to normalized MP3s.
 */
export function RecordingStudio() {
  const [statuses, setStatuses] = useState<Record<string, ClipStatus>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [recording, setRecording] = useState(false)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [lastBlob, setLastBlob] = useState<Blob | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const micStream = useRef<MediaStream | null>(null)
  // when the primary button stops a take, it normally chains straight into
  // recording the next sound — set to false only for the "pause" escape hatch
  const autoContinue = useRef(true)

  const currentSound = allSounds[currentIdx]

  useEffect(() => {
    // in case the auto-record chain is still running when this page unmounts
    return () => {
      autoContinue.current = false
      micStream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    // check which mp3s already exist (dev server serves HTML fallback for
    // missing files, so verify the content type too)
    for (const id of allSounds) {
      fetch(`/audio/sounds/${id}.mp3`, { method: 'HEAD' }).then((r) => {
        const isAudio = r.ok && (r.headers.get('content-type') ?? '').startsWith('audio')
        setStatuses((s) => ({ ...s, [id]: isAudio ? 'recorded' : (s[id] ?? 'missing') }))
      })
    }
  }, [])

  const supportsFileSystemAccess = typeof (window as any).showDirectoryPicker === 'function'

  async function pickFolder() {
    if (!supportsFileSystemAccess) {
      setSaveError('Deze browser ondersteunt geen mapopslag (File System Access API). Open /opnemen in Chrome of Edge.')
      return
    }
    try {
      // @ts-expect-error File System Access API (Chrome/Edge)
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setDirHandle(handle)
      setSaveError(null)
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') {
        setSaveError(`Map kiezen mislukt: ${(err as Error).message}`)
      }
    }
  }

  async function startRecording(idx: number) {
    setCurrentIdx(idx)
    setLastBlob(null)
    const soundId = allSounds[idx]
    let stream: MediaStream
    try {
      // reuse one mic stream for the whole session — re-requesting getUserMedia
      // for every single sound was flaky and could silently kill the auto-chain
      if (!micStream.current || micStream.current.getAudioTracks().every((t) => t.readyState === 'ended')) {
        micStream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      stream = micStream.current
    } catch (err) {
      setSaveError(`Microfoon starten mislukt: ${(err as Error).message}`)
      setRecording(false)
      return
    }
    chunks.current = []
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    rec.ondataavailable = (e) => chunks.current.push(e.data)
    rec.onstop = async () => {
      const blob = new Blob(chunks.current, { type: 'audio/webm' })
      setLastBlob(blob)
      setRecording(false)
      if (dirHandle) {
        try {
          const file = await dirHandle.getFileHandle(`${soundId}.webm`, { create: true })
          const writable = await file.createWritable()
          await writable.write(blob)
          await writable.close()
          setStatuses((s) => ({ ...s, [soundId]: 'new' }))
          setSaveError(null)
        } catch (err) {
          setSaveError(`Opslaan van "${soundId}" mislukt: ${(err as Error).message}`)
          return
        }
      }
      if (!autoContinue.current) {
        // done for now — release the mic instead of leaving it open indefinitely
        micStream.current?.getTracks().forEach((t) => t.stop())
        micStream.current = null
        return
      }
      // always move to the plain next sound, whether or not it already has a
      // take — a full redo pass needs to walk every sound, not just the gaps
      startRecording((idx + 1) % allSounds.length)
    }
    recorder.current = rec
    rec.start()
    setRecording(true)
  }

  /** Primary button: stop the current take, save it, and immediately start the next one. */
  function stopAndContinue() {
    autoContinue.current = true
    recorder.current?.stop()
  }

  /** Escape hatch: stop and save, but don't auto-start the next recording. */
  function stopAndPause() {
    autoContinue.current = false
    recorder.current?.stop()
  }

  function playBack() {
    if (!lastBlob) return
    new Audio(URL.createObjectURL(lastBlob)).play()
  }

  function skipToNext() {
    setLastBlob(null)
    setCurrentIdx((currentIdx + 1) % allSounds.length)
  }

  const doneCount = Object.values(statuses).filter((s) => s !== 'missing').length

  return (
    <div className="studio">
      <h1>🎙️ Opnamestudio</h1>
      <p>
        {doneCount}/{allSounds.length} klanken opgenomen.{' '}
        {!dirHandle && (
          <button className="btn-primary" style={{ fontSize: 16, padding: '8px 16px' }} onClick={pickFolder}>
            Kies map (app/public/audio/sounds)
          </button>
        )}
        {dirHandle && <b>Map gekozen ✓ (webm → draai daarna tools/convert-audio.mjs)</b>}
      </p>
      {!supportsFileSystemAccess && (
        <p style={{ color: 'var(--red-orange, #c0392b)', fontWeight: 700 }}>
          ⚠️ Deze browser ondersteunt geen mapopslag. Open /opnemen in Chrome of Edge om op te nemen.
        </p>
      )}
      {saveError && <p style={{ color: 'var(--red-orange, #c0392b)', fontWeight: 700 }}>⚠️ {saveError}</p>}

      <div className="big-sound">{currentSound}</div>
      <div className="studio-controls">
        {!recording ? (
          <button className="btn-primary" disabled={!dirHandle} style={{ opacity: dirHandle ? 1 : 0.4 }} onClick={() => startRecording(currentIdx)}>
            🔴 Opnemen
          </button>
        ) : (
          <button className="btn-bad" onClick={stopAndContinue}>⏹ Klaar → volgende 🔴</button>
        )}
        <button className="btn-primary" disabled={!lastBlob} style={{ opacity: lastBlob ? 1 : 0.4 }} onClick={playBack}>
          ▶️ Luister
        </button>
        <button className="btn-primary" onClick={skipToNext}>Overslaan ➡️</button>
      </div>
      {recording && (
        <p style={{ textAlign: 'center' }}>
          <button style={{ fontSize: 14, color: 'var(--muted)', textDecoration: 'underline' }} onClick={stopAndPause}>
            stoppen zonder door te gaan
          </button>
        </p>
      )}

      <div className="studio-grid">
        {allSounds.map((id, idx) => (
          <button
            key={id}
            className={`studio-cell${id === currentSound ? ' studio-cell-active' : ''}`}
            onClick={() => setCurrentIdx(idx)}
          >
            <span className="studio-cell-id">{id}</span>
            <span className="studio-cell-status">
              {statuses[id] === 'recorded' && '✅'}
              {statuses[id] === 'new' && '🆕'}
              {(statuses[id] ?? 'missing') === 'missing' && '⬜'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
