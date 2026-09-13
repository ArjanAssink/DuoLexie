import { useCallback, useEffect, useMemo, useState } from 'react'
import { allSounds } from '../curriculum'
import { wordsInRecordingOrder } from '../data/path'
import { DEFAULT_PACE_MS, PACE_RANGE, takeBasename, type TakeKind } from './cueSheet'
import { micConstraints, openTakeGraph, peakDbfs, supportedRecorderOptions } from './takeAudio'
import { Teleprompter, type Take } from './Teleprompter'
import { TakeReview, type SplitReport } from './TakeReview'

/** Words worth recording first — the shortest ones (docs/hardop-lezen-rework.md §8). */
const STARTER_SET_SIZE = 20

type SetChoice = 'klanken' | 'woorden-startset' | 'woorden'
type Stage = 'setup' | 'recording' | 'saved'

const SET_KIND: Record<SetChoice, TakeKind> = {
  klanken: 'klanken',
  'woorden-startset': 'woorden',
  woorden: 'woorden',
}

/**
 * Dev-only recording studio (/opnemen), rebuilt around one continuous take
 * (docs/recording-pipeline-v2.md).
 *
 * The old studio recorded one clip per click: forty-five starts, forty-five stops, every one
 * of them a mouse or key press on the same desk as the microphone. That is the first of the
 * four things in §1 that made the first batch sound clacky, and no amount of post-processing
 * takes a click back out of a 300ms clip. So the recording is hands-free now: a teleprompter
 * shows one word at a time while a single MediaRecorder runs, and everything that used to be
 * a click is a timer instead.
 *
 * This screen is the setup and the loop around it — which set, how fast, which microphone,
 * where the take goes — plus, after `tools/split-take.mjs` has run, the report that says
 * which of the clips are worth a listen and the one button that re-records them (§5).
 */
export function RecordingStudio() {
  const [choice, setChoice] = useState<SetChoice>('woorden-startset')
  const [missingOnly, setMissingOnly] = useState(false)
  const [paceMs, setPaceMs] = useState(DEFAULT_PACE_MS.woorden)
  const [stage, setStage] = useState<Stage>('setup')
  const [recorded, setRecorded] = useState<Record<string, boolean>>({})
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAs, setSavedAs] = useState<string | null>(null)
  const [report, setReport] = useState<SplitReport | null>(null)
  const [retakeIds, setRetakeIds] = useState<string[] | null>(null)
  const [testClip, setTestClip] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const kind = SET_KIND[choice]
  const folder = kind === 'klanken' ? 'sounds' : 'words'
  const pathWords = useMemo(() => wordsInRecordingOrder(), [])

  const fullSet = useMemo(() => {
    if (choice === 'klanken') return allSounds
    const ids = pathWords.map((w) => w.id)
    return choice === 'woorden-startset' ? ids.slice(0, STARTER_SET_SIZE) : ids
  }, [choice, pathWords])

  /** What the next take will actually prompt: the set, narrowed by the gaps-only switch. */
  const ids = useMemo(() => {
    if (retakeIds) return retakeIds
    return missingOnly ? fullSet.filter((id) => !recorded[id]) : fullSet
  }, [fullSet, missingOnly, recorded, retakeIds])

  useEffect(() => setPaceMs(DEFAULT_PACE_MS[kind]), [kind])

  useEffect(() => {
    // which ids already have an mp3 (the dev server serves an HTML fallback for missing
    // files, so the content type has to be checked too)
    let live = true
    for (const id of fullSet) {
      void fetch(`/audio/${folder}/${id}.mp3`, { method: 'HEAD' }).then((r) => {
        const isAudio = r.ok && (r.headers.get('content-type') ?? '').startsWith('audio')
        if (live) setRecorded((s) => (s[id] === isAudio ? s : { ...s, [id]: isAudio }))
      }).catch(() => {})
    }
    return () => { live = false }
  }, [fullSet, folder])

  /**
   * Live level meter and device list.
   *
   * Worth the code: a three-minute take is a long thing to throw away, and the two ways to
   * lose one are silent (wrong input selected) or clipped (gain too high). Both are visible
   * here in two seconds, before committing to the take.
   */
  useEffect(() => {
    if (stage !== 'setup') return
    let cancelled = false
    let raf = 0
    let graph: ReturnType<typeof openTakeGraph> | null = null
    let stream: MediaStream | null = null

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId))
      } catch (err) {
        if (!cancelled) setError(`Microfoon starten mislukt: ${(err as Error).message}`)
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      setError(null)
      const all = await navigator.mediaDevices.enumerateDevices()
      if (!cancelled) setDevices(all.filter((d) => d.kind === 'audioinput'))
      graph = openTakeGraph(stream)
      const buffer = new Float32Array(graph.analyser.fftSize)
      const tick = () => {
        if (cancelled || !graph) return
        setLevel(peakDbfs(graph.analyser, buffer))
        raf = requestAnimationFrame(tick)
      }
      tick()
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      graph?.close()
      stream?.getTracks().forEach((t) => t.stop())
      setLevel(null)
    }
  }, [stage, deviceId])

  const supportsPicker = typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'

  async function pickFolder() {
    if (!supportsPicker) {
      setError('Deze browser ondersteunt geen mapopslag (File System Access API). Open /opnemen in Chrome of Edge.')
      return
    }
    try {
      const picker = (window as unknown as {
        showDirectoryPicker: (o: { mode: string }) => Promise<FileSystemDirectoryHandle>
      }).showDirectoryPicker
      setDirHandle(await picker({ mode: 'readwrite' }))
      setError(null)
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') setError(`Map kiezen mislukt: ${(err as Error).message}`)
    }
  }

  async function write(name: string, data: Blob | string) {
    if (!dirHandle) {
      // no picker (or he cancelled it): hand the file to the browser's downloads instead of
      // losing a take that has already been recorded
      const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type: 'application/json' }) : data)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    const file = await dirHandle.getFileHandle(name, { create: true })
    const writable = await file.createWritable()
    await writable.write(data)
    await writable.close()
  }

  const onTakeDone = useCallback(async (take: Take) => {
    const base = takeBasename(take.sheet.kind, new Date(take.sheet.startedAt))
    try {
      await write(`${base}.webm`, take.blob)
      await write(`${base}.json`, `${JSON.stringify(take.sheet, null, 2)}\n`)
      setSavedAs(base)
      setStage('saved')
      setRetakeIds(null)
    } catch (err) {
      setError(`Opslaan mislukt: ${(err as Error).message}`)
      setStage('setup')
    }
    // `write` closes over dirHandle, which is set before a take can start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirHandle])

  /** Read the report the splitter left next to the take, and switch to the review list. */
  async function loadReport() {
    if (!dirHandle || !savedAs) return
    try {
      const handle = await dirHandle.getFileHandle(`${savedAs}.report.json`)
      setReport(JSON.parse(await (await handle.getFile()).text()) as SplitReport)
      setError(null)
    } catch {
      setError(`Nog geen ${savedAs}.report.json in de map — draai eerst het split-commando hieronder.`)
    }
  }

  /** Three seconds and play it back: enough to hear a hum, a clip, or the wrong input. */
  async function testThreeSeconds() {
    setTesting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId))
      const rec = new MediaRecorder(stream, supportedRecorderOptions())
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => chunks.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setTestClip(URL.createObjectURL(new Blob(chunks, { type: 'audio/webm' })))
        setTesting(false)
      }
      rec.start()
      window.setTimeout(() => rec.stop(), 3000)
    } catch (err) {
      setError(`Testopname mislukt: ${(err as Error).message}`)
      setTesting(false)
    }
  }

  if (stage === 'recording') {
    return (
      <div className="studio">
        <Teleprompter
          ids={ids}
          kind={kind}
          paceMs={paceMs}
          deviceId={deviceId}
          onDone={onTakeDone}
          onError={(message) => { setError(message); setStage('setup') }}
        />
      </div>
    )
  }

  const doneCount = fullSet.filter((id) => recorded[id]).length
  const hot = level !== null && level > -3

  return (
    <div className="studio">
      <h1>🎙️ Opnamestudio</h1>

      {error && <p className="studio-error">⚠️ {error}</p>}

      {stage === 'saved' && savedAs && (
        <div className="studio-next">
          <p>
            Take opgeslagen als <code>{savedAs}.webm</code> + <code>{savedAs}.json</code>.
            Knip hem nu op:
          </p>
          <pre>node tools/split-take.mjs recordings/{savedAs}.webm</pre>
          <p className="studio-hint">
            Daarna: <b>herstart de dev-server</b> — <code>vite.config.ts</code> leest
            <code> public/audio/words/</code> één keer bij het starten, dus nieuwe mp3's
            worden pas daarna in een leesronde gebruikt. En check de clips een keer op haar
            échte iPad: tien <code>&lt;audio&gt;</code>-elementen per ronde is een openstaand
            punt in <code>docs/code-review-backlog.md</code> dat pas met echte opnames scherp
            wordt.
          </p>
          <p className="review-actions">
            <button className="btn-primary" onClick={loadReport}>Rapport laden</button>
            <button className="btn-primary" onClick={() => { setStage('setup'); setReport(null) }}>
              Nieuwe take
            </button>
          </p>
        </div>
      )}

      {report && (
        <TakeReview
          report={report}
          onRetake={(pick) => { setRetakeIds(pick); setReport(null); setStage('setup') }}
        />
      )}

      {stage === 'setup' && (
        <>
          <div className="studio-modes">
            {([
              ['klanken', `Klanken (${allSounds.length})`],
              ['woorden-startset', `Woorden, startset (${Math.min(STARTER_SET_SIZE, pathWords.length)})`],
              ['woorden', `Woorden, alle (${pathWords.length})`],
            ] as [SetChoice, string][]).map(([value, label]) => (
              <button
                key={value}
                className={`btn-primary${choice === value ? '' : ' studio-mode-off'}`}
                onClick={() => { setChoice(value); setRetakeIds(null) }}
              >
                {label}
              </button>
            ))}
          </div>

          <p>
            <label className="studio-starter">
              <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
              {' '}alleen ontbrekende ({fullSet.length - doneCount} van {fullSet.length})
            </label>
          </p>

          {retakeIds && (
            <p className="studio-retake">
              Opnieuw opnemen: <b>{retakeIds.join(' · ')}</b>{' '}
              <button className="studio-link" onClick={() => setRetakeIds(null)}>(hele set toch)</button>
            </p>
          )}

          <p>
            <label className="studio-starter">
              Tempo: <b>{(paceMs / 1000).toFixed(1)}s</b> per woord{' '}
              <input
                type="range"
                min={PACE_RANGE.min}
                max={PACE_RANGE.max}
                step={100}
                value={paceMs}
                onChange={(e) => setPaceMs(Number(e.target.value))}
              />
            </label>
          </p>

          <p>
            <label className="studio-starter">
              Microfoon:{' '}
              <select value={deviceId ?? ''} onChange={(e) => setDeviceId(e.target.value || null)}>
                <option value="">standaard</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 8)}</option>
                ))}
              </select>
            </label>
          </p>

          <div className="studio-meter" aria-label="microfoonniveau">
            <i
              className={hot ? 'studio-meter-hot' : undefined}
              style={{ width: `${Math.max(0, Math.min(100, (((level ?? -60) + 60) / 60) * 100))}%` }}
            />
            <b>{level === null || level === -Infinity ? '—' : `${level.toFixed(0)} dBFS`}</b>
          </div>

          <p className="review-actions">
            <button className="btn-primary" disabled={testing} onClick={testThreeSeconds}>
              {testing ? '● opnemen…' : 'Test 3 seconden'}
            </button>
            {testClip && <audio controls src={testClip} />}
          </p>

          <p>
            {!dirHandle ? (
              <button className="btn-primary" onClick={pickFolder}>Kies map (recordings/)</button>
            ) : (
              <b>Map gekozen ✓ — takes komen in recordings/, niet in app/public/</b>
            )}
          </p>

          <p className="review-actions">
            <button
              className="btn-primary"
              disabled={ids.length === 0}
              style={{ opacity: ids.length ? 1 : 0.4 }}
              onClick={() => { setError(null); setSavedAs(null); setStage('recording') }}
            >
              🔴 Start take ({ids.length} {kind})
            </button>
          </p>

          <p className="studio-hint">
            Lees elk woord één keer, rustig, zodra het verschijnt. Handen van het bureau —
            klikken en toetsen komen mee de opname in. Gaat er één mis: <b>spatie</b>, en hij
            komt achteraan terug.
          </p>

          <div className="studio-grid">
            {fullSet.map((id) => (
              <span key={id} className={`studio-cell${ids.includes(id) ? ' studio-cell-active' : ''}`}>
                <span className="studio-cell-id">{id}</span>
                <span className="studio-cell-status">{recorded[id] ? '✅' : '⬜'}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
