import { useEffect, useMemo, useRef, useState } from 'react'
import { allSounds } from '../curriculum'
import { wordsInRecordingOrder } from '../data/path'

type ClipStatus = 'missing' | 'recorded' | 'new'

type Mode = 'klanken' | 'woorden'

/** Words worth recording first — the shortest ones (docs/hardop-lezen-rework.md §8). */
const STARTER_SET_SIZE = 20

/**
 * Dev-only recording studio (/opnemen): record the family voice clips.
 * Saves .webm files via the File System Access API into a chosen folder, then run
 * `node tools/convert-audio.mjs <dir>` to convert to normalized MP3s.
 *
 * Two modes, because the app needs two kinds of clip:
 *   Klanken — the 45 graphemes, into app/public/audio/sounds
 *   Woorden — whole words for Hardop lezen, into app/public/audio/words, walked in the order
 *             she meets them on the path so the first clips recorded are the first she hears
 */
export function RecordingStudio() {
  const [mode, setMode] = useState<Mode>('klanken')
  const [starterOnly, setStarterOnly] = useState(true)
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

  const pathWords = useMemo(() => wordsInRecordingOrder(), [])
  const folder = mode === 'klanken' ? 'sounds' : 'words'
  /**
   * The clips this mode records, in recording order. Words are capped to the starter set by
   * default: the whole word list is a long sitting, and the first twenty are the shortest
   * words she reads (data/path.ts's wordsInRecordingOrder).
   */
  const items = useMemo(() => {
    if (mode === 'klanken') return allSounds
    const ids = pathWords.map((w) => w.id)
    return starterOnly ? ids.slice(0, STARTER_SET_SIZE) : ids
  }, [mode, starterOnly, pathWords])

  const currentItem = items[Math.min(currentIdx, items.length - 1)]

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
    for (const id of items) {
      fetch(`/audio/${folder}/${id}.mp3`, { method: 'HEAD' }).then((r) => {
        const isAudio = r.ok && (r.headers.get('content-type') ?? '').startsWith('audio')
        setStatuses((s) => ({ ...s, [id]: isAudio ? 'recorded' : (s[id] ?? 'missing') }))
      })
    }
  }, [items, folder])

  /** Switching mode starts that mode's list from the top, and drops the other's take. */
  function switchMode(next: Mode) {
    if (next === mode) return
    autoContinue.current = false
    recorder.current?.stop()
    setMode(next)
    setCurrentIdx(0)
    setStatuses({})
    setLastBlob(null)
  }

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
    const soundId = items[idx]
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
      // always move to the plain next item, whether or not it already has a
      // take — a full redo pass needs to walk every one, not just the gaps
      startRecording((idx + 1) % items.length)
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
    setCurrentIdx((currentIdx + 1) % items.length)
  }

  const doneCount = items.filter((id) => (statuses[id] ?? 'missing') !== 'missing').length

  return (
    <div className="studio">
      <h1>🎙️ Opnamestudio</h1>
      <div className="studio-modes">
        <button
          className={`btn-primary${mode === 'klanken' ? '' : ' studio-mode-off'}`}
          onClick={() => switchMode('klanken')}
        >
          Klanken ({allSounds.length})
        </button>
        <button
          className={`btn-primary${mode === 'woorden' ? '' : ' studio-mode-off'}`}
          onClick={() => switchMode('woorden')}
        >
          Woorden ({pathWords.length})
        </button>
      </div>
      {mode === 'woorden' && (
        <p>
          <label className="studio-starter">
            <input
              type="checkbox"
              checked={starterOnly}
              onChange={(e) => setStarterOnly(e.target.checked)}
            />{' '}
            alleen de eerste {STARTER_SET_SIZE} (de kortste woorden)
          </label>
        </p>
      )}
      <p>
        {doneCount}/{items.length} {mode} opgenomen.{' '}
        {!dirHandle && (
          <button className="btn-primary" style={{ fontSize: 16, padding: '8px 16px' }} onClick={pickFolder}>
            Kies map (app/public/audio/{folder})
          </button>
        )}
        {dirHandle && (
          <b>
            Map gekozen ✓ (webm → draai daarna{' '}
            <code>node tools/convert-audio.mjs app/public/audio/{folder}</code>)
          </b>
        )}
      </p>
      {mode === 'woorden' && (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Spreek het woord één keer natuurlijk uit, met een seconde stilte ervoor en erna —
          convert-audio.mjs knipt die eraf en normaliseert naar -16 LUFS.
        </p>
      )}
      {!supportsFileSystemAccess && (
        <p style={{ color: 'var(--red-orange, #c0392b)', fontWeight: 700 }}>
          ⚠️ Deze browser ondersteunt geen mapopslag. Open /opnemen in Chrome of Edge om op te nemen.
        </p>
      )}
      {saveError && <p style={{ color: 'var(--red-orange, #c0392b)', fontWeight: 700 }}>⚠️ {saveError}</p>}

      <div className="big-sound">{currentItem}</div>
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
        {items.map((id, idx) => (
          <button
            key={id}
            className={`studio-cell${id === currentItem ? ' studio-cell-active' : ''}`}
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
