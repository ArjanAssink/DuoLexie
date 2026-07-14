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
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  const currentSound = allSounds[currentIdx]

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

  async function pickFolder() {
    // @ts-expect-error File System Access API (Chrome/Edge)
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    setDirHandle(handle)
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chunks.current = []
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    rec.ondataavailable = (e) => chunks.current.push(e.data)
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks.current, { type: 'audio/webm' })
      setLastBlob(blob)
      if (dirHandle) {
        const file = await dirHandle.getFileHandle(`${currentSound}.webm`, { create: true })
        const writable = await file.createWritable()
        await writable.write(blob)
        await writable.close()
        setStatuses((s) => ({ ...s, [currentSound]: 'new' }))
      }
    }
    recorder.current = rec
    rec.start()
    setRecording(true)
  }

  function stopRecording() {
    recorder.current?.stop()
    setRecording(false)
  }

  function playBack() {
    if (!lastBlob) return
    new Audio(URL.createObjectURL(lastBlob)).play()
  }

  function next() {
    setLastBlob(null)
    // jump to next sound without a recording
    const start = currentIdx + 1
    for (let i = 0; i < allSounds.length; i++) {
      const idx = (start + i) % allSounds.length
      if (statuses[allSounds[idx]] !== 'recorded' && statuses[allSounds[idx]] !== 'new') {
        setCurrentIdx(idx)
        return
      }
    }
    setCurrentIdx((start) % allSounds.length)
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

      <div className="big-sound">{currentSound}</div>
      <div className="studio-controls">
        {!recording ? (
          <button className="btn-primary" onClick={startRecording}>🔴 Opnemen</button>
        ) : (
          <button className="btn-bad" onClick={stopRecording}>⏹ Stop</button>
        )}
        <button className="btn-primary" disabled={!lastBlob} style={{ opacity: lastBlob ? 1 : 0.4 }} onClick={playBack}>
          ▶️ Luister
        </button>
        <button className="btn-primary" onClick={next}>Volgende ➡️</button>
      </div>

      <table>
        <tbody>
          {allSounds.map((id, idx) => (
            <tr key={id} onClick={() => setCurrentIdx(idx)} style={{ cursor: 'pointer' }}>
              <td style={{ fontWeight: 800, fontSize: 22 }}>{id}</td>
              <td>
                {statuses[id] === 'recorded' && '✅ mp3'}
                {statuses[id] === 'new' && '🆕 webm opgenomen'}
                {(statuses[id] ?? 'missing') === 'missing' && '⬜ nog niet'}
              </td>
              <td>{id === currentSound && '👈'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
