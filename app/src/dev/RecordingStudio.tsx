import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { allSounds } from '../curriculum'
import { wordsInRecordingOrder } from '../data/path'
import { dealableWeetjes, narrationLines, type WeetjePart } from '../weetjes'
import {
  allSpellingWords, langerClipId, regelClipId, spellingPairs, strategyLine,
} from '../spelling'
import { clipSrc } from '../audio/recorded'
import {
  DEFAULT_PACE_MS, PACE_RANGE, folderFor, takeBasename, type AudioFolder, type TakeKind,
} from './cueSheet'
import { ClipGrid } from './ClipGrid'
import {
  FLOOR_TEXT, LEVEL_TEXT, TARGET_ZONE, floorVerdict, hasHum, levelVerdict, meterFraction,
} from './levels'
import {
  createPeakMeter, measureSilence, micConstraints, openTakeGraph, supportedRecorderOptions,
  type SilenceReading,
} from './takeAudio'
import { Teleprompter, type Take } from './Teleprompter'
import { TakeReview, type SplitReport } from './TakeReview'
import {
  MISSING, clipState, isMissing, mergeStores, readLocalVerdicts, withVerdict, writeLocalVerdicts,
  clearLocalVerdicts, type ClipProbe, type Verdict, type VerdictStore,
} from './verdicts'
import {
  archiveClip, fetchReport, fetchTakes, fetchVerdicts, saveVerdicts, splitTake, studioAvailable,
  uploadTake, type SplitLine, type TakeInfo,
} from './studioApi'

/** Words worth recording first — the shortest ones (docs/hardop-lezen-rework.md §8). */
const STARTER_SET_SIZE = 20

type SetChoice = 'klanken' | 'woorden-startset' | 'woorden' | 'weetjes' | 'spelling'
type Stage = 'setup' | 'recording' | 'saved'

const SET_KIND: Record<SetChoice, TakeKind> = {
  klanken: 'klanken',
  'woorden-startset': 'woorden',
  woorden: 'woorden',
  weetjes: 'weetjes',
  spelling: 'spelling',
}

/** The three parts of a card, each its own cue and its own mp3 (docs/weetjes.md §7). */
const WEETJE_PARTS: WeetjePart[] = ['fact', 'doe', 'reveal']

const CHECKLIST_KEY = 'duolexie-studio-checklist-dismissed'

/** Enough to be quick on localhost, few enough not to queue the dev server behind itself. */
const PROBE_CONCURRENCY = 12

/**
 * The Weetjes set: every reviewed card, three cues each, in path order.
 *
 * Three cues rather than one per card, because the three are played at three different
 * moments and one of them (`doe`) is a question with its options — there is no point in the
 * take at which reading a whole card straight through would give clips that can be used
 * apart. Unreviewed cards are left out: they are not dealt, so recording them would be a
 * take spent on copy that may still change (§3).
 */
function weetjeCues(): { ids: string[]; labels: Record<string, string> } {
  const ids: string[] = []
  const labels: Record<string, string> = {}
  for (const card of dealableWeetjes) {
    for (const part of WEETJE_PARTS) {
      const id = `${card.id}-${part}`
      ids.push(id)
      labels[id] = narrationLines(card, part).join(' … ')
    }
  }
  return { ids, labels }
}

/**
 * The Spelling set: one cue per pair rule and one per longer form
 * (docs/maak-het-woord-af.md §10).
 *
 * The rules come first, because there are two of them and they are the cues most likely to
 * need a second take — a rule is a sentence with a colon in it, read to a nine-year-old.
 * A `cht` word has no longer form and so no cue; `licht`/`ligt` are not in the file at all.
 *
 * Every word, not only the reviewed ones. The Weetjes set deliberately leaves unreviewed
 * cards out because their *copy* may still change; a longer form is not copy — `honden` is
 * `honden` whether or not the card has been signed off, and the review that is pending is
 * of the word list, not of the Dutch. Recording ahead is a take well spent here.
 */
function spellingCues(): { ids: string[]; labels: Record<string, string> } {
  const ids: string[] = []
  const labels: Record<string, string> = {}
  for (const pair of spellingPairs) {
    const id = regelClipId(pair.id)
    ids.push(id)
    labels[id] = strategyLine(pair)
  }
  for (const word of allSpellingWords) {
    if (!word.langer) continue
    const id = langerClipId(word.wordId)
    ids.push(id)
    labels[id] = word.langer
  }
  return { ids, labels }
}

/**
 * Verdicts, wherever they happen to live (§2.1).
 *
 * `localStorage` until the dev middleware exists, `recordings/verdicts.json` once it does —
 * and the first load with the middleware present folds one into the other and clears the
 * browser copy, so the move happens without anyone being asked about it. Writes go to both
 * for the rest of the session: disk is the shared truth, and the local copy is what survives
 * `vite build && vite preview`, where there is no middleware at all.
 */
function useVerdicts() {
  const [store, setStore] = useState<VerdictStore>(() => readLocalVerdicts())
  const remote = useRef(false)

  useEffect(() => {
    let live = true
    void (async () => {
      if (!(await studioAvailable())) return
      const disk = await fetchVerdicts()
      if (!live || disk === null) return
      remote.current = true
      const local = readLocalVerdicts()
      const merged = mergeStores(disk, local)
      setStore(merged)
      if (Object.keys(local).length > 0) {
        // one-time migration: write the union back and stop keeping two copies in step
        if (await saveVerdicts(merged)) clearLocalVerdicts()
      }
    })()
    return () => { live = false }
  }, [])

  const persist = useCallback((next: VerdictStore) => {
    setStore(next)
    if (remote.current) void saveVerdicts(next)
    else writeLocalVerdicts(next)
  }, [])

  return { store, persist, remote }
}

/**
 * Dev-only recording studio (/opnemen).
 *
 * Two jobs, and they are the same loop seen from two ends. Before a take it is a setup
 * screen: which set, how fast, which microphone, is the room quiet, is the level right. After
 * one it is where the clips are listened to and judged — because the splitter can hear levels
 * and silence but not whether a word was read well, and until this screen existed that
 * judgement lived in Arjan's head between one evening and the next.
 *
 * With `vite dev` from this repo it also drives the splitter directly (§3): record, *Knip en
 * beluister*, judge with `G`/`A`, re-record the ❌ set. Without it — a preview build, a
 * different server — everything still works through the File System Access picker and the
 * terminal, one step at a time.
 */
export function RecordingStudio() {
  const [choice, setChoice] = useState<SetChoice>('woorden-startset')
  const [missingOnly, setMissingOnly] = useState(false)
  const [paceMs, setPaceMs] = useState(DEFAULT_PACE_MS.woorden)
  const [stage, setStage] = useState<Stage>('setup')
  const [probes, setProbes] = useState<Record<AudioFolder, Record<string, ClipProbe>>>({
    sounds: {}, words: {}, weetjes: {}, spelling: {},
  })
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [level, setLevel] = useState<{ peak: number; hold: number } | null>(null)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAs, setSavedAs] = useState<string | null>(null)
  const [report, setReport] = useState<SplitReport | null>(null)
  const [retake, setRetake] = useState<{ ids: string[]; from: string | null } | null>(null)
  const [testClip, setTestClip] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [silence, setSilence] = useState<SilenceReading | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [checklist, setChecklist] = useState(() => {
    try { return sessionStorage.getItem(CHECKLIST_KEY) !== '1' } catch { return true }
  })
  const [hasStudio, setHasStudio] = useState(false)
  const [takes, setTakes] = useState<TakeInfo[]>([])
  const [splitting, setSplitting] = useState(false)
  const [progress, setProgress] = useState<string[]>([])

  const { store, persist } = useVerdicts()
  const kind = SET_KIND[choice]
  const folder = folderFor(kind)
  const pathWords = useMemo(() => wordsInRecordingOrder(), [])
  const weetjes = useMemo(() => weetjeCues(), [])
  const spelling = useMemo(() => spellingCues(), [])

  const sets = useMemo((): Record<SetChoice, { ids: string[]; kind: TakeKind; folder: AudioFolder }> => {
    const words = pathWords.map((w) => w.id)
    const set = (ids: string[], setKind: TakeKind) => ({ ids, kind: setKind, folder: folderFor(setKind) })
    return {
      klanken: set(allSounds, 'klanken'),
      'woorden-startset': set(words.slice(0, STARTER_SET_SIZE), 'woorden'),
      woorden: set(words, 'woorden'),
      weetjes: set(weetjes.ids, 'weetjes'),
      spelling: set(spelling.ids, 'spelling'),
    }
  }, [pathWords, weetjes, spelling])

  /**
   * What the teleprompter shows instead of the bare id. Words are their own label, so the
   * two sets whose ids are not words (`slim-doe`, `hond-langer`) carry one and the rest
   * pass `undefined` (§2.8).
   */
  const cueLabels =
    kind === 'weetjes' ? weetjes.labels : kind === 'spelling' ? spelling.labels : undefined
  const reportLabels = (reportKind: TakeKind) =>
    reportKind === 'weetjes' ? weetjes.labels
      : reportKind === 'spelling' ? spelling.labels
      : undefined

  const fullSet = sets[choice].ids
  const folderProbes = probes[folder]

  /** What the next take will actually prompt: the set, narrowed by the gaps-only switch. */
  const ids = useMemo(() => {
    if (retake) return retake.ids
    if (!missingOnly) return fullSet
    return fullSet.filter((id) => isMissing(store, folder, id, folderProbes[id] ?? MISSING))
  }, [fullSet, missingOnly, retake, store, folder, folderProbes])

  const missingCount = fullSet.filter((id) => isMissing(store, folder, id, folderProbes[id] ?? MISSING)).length

  useEffect(() => setPaceMs(DEFAULT_PACE_MS[kind]), [kind])

  useEffect(() => { void studioAvailable().then(setHasStudio) }, [])
  useEffect(() => { if (hasStudio) void fetchTakes().then(setTakes) }, [hasStudio, report])

  /**
   * What is on disk, and when it was written.
   *
   * Every set, not only the one selected, so each set button can say `12 goed van 20` without
   * being clicked — the point of the counts is to see where the work stands at a glance. The
   * `Last-Modified` is what makes a verdict belong to a file rather than to an id: when a
   * retake lands, the timestamp changes and the old opinion is dropped (§2.1).
   */
  const refreshProbes = useCallback(async () => {
    const wanted: { kind: TakeKind; folder: AudioFolder; id: string }[] = []
    const seen = new Set<string>()
    for (const set of Object.values(sets)) {
      for (const id of set.ids) {
        const key = `${set.folder}/${id}`
        if (seen.has(key)) continue
        seen.add(key)
        wanted.push({ kind: set.kind, folder: set.folder, id })
      }
    }

    const found: Record<AudioFolder, Record<string, ClipProbe>> = {
      sounds: {}, words: {}, weetjes: {}, spelling: {},
    }
    let cursor = 0
    const worker = async () => {
      for (let i = cursor++; i < wanted.length; i = cursor++) {
        const { kind: probeKind, folder: f, id } = wanted[i]
        try {
          // through clipSrc like every other clip URL: when docs/private-audio.md moves the
          // clips behind /api/audio/{kind}/{id}, the probe has to move with them
          const res = await fetch(clipSrc(probeKind, id), { method: 'HEAD' })
          // the dev server answers a missing public file with the SPA's index.html, so the
          // status alone says nothing — the content type is what distinguishes them
          const isAudio = res.ok && (res.headers.get('content-type') ?? '').startsWith('audio')
          found[f][id] = { present: isAudio, lastModified: isAudio ? res.headers.get('last-modified') : null }
        } catch {
          found[f][id] = MISSING
        }
      }
    }
    await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker))
    setProbes(found)
  }, [sets])

  useEffect(() => { void refreshProbes() }, [refreshProbes])

  /**
   * Live level meter and device list.
   *
   * Worth the code: a three-minute take is a long thing to throw away, and the two ways to
   * lose one are silent (wrong input selected) and clipped (gain too high). Both are visible
   * here in two seconds, in words rather than as a bar to interpret (§2.3).
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
      const read = createPeakMeter(graph.analyser)
      const tick = () => {
        if (cancelled || !graph) return
        const { peak, hold } = read()
        setLevel({ peak, hold })
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

  const writeThroughPicker = useCallback(async (name: string, data: Blob | string) => {
    if (!dirHandle) {
      // no picker (or he cancelled it): hand the file to the browser's downloads rather than
      // lose a take that has already been recorded
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
  }, [dirHandle])

  const onTakeDone = useCallback(async (take: Take) => {
    const base = takeBasename(take.sheet.kind, new Date(take.sheet.startedAt))
    try {
      if (await studioAvailable()) {
        if (!(await uploadTake(base, take.blob, take.sheet))) throw new Error('de dev-server nam de take niet aan')
      } else {
        await writeThroughPicker(`${base}.webm`, take.blob)
        await writeThroughPicker(`${base}.json`, `${JSON.stringify(take.sheet, null, 2)}\n`)
      }
      setSavedAs(base)
      setStage('saved')
      setRetake(null)
      setProgress([])
    } catch (err) {
      setError(`Opslaan mislukt: ${(err as Error).message}`)
      setStage('setup')
    }
  }, [writeThroughPicker])

  /** One button for the whole middle of the loop: split, then show what came out (§3.3). */
  const cutAndListen = useCallback(async (basename: string) => {
    setSplitting(true)
    setProgress([])
    setError(null)
    const onLine = (line: SplitLine) => {
      if (line.type === 'progress' || line.type === 'output') {
        setProgress((lines) => [...lines, line.line])
      } else if (line.type === 'error') {
        setError(line.error)
      }
    }
    const result = await splitTake(basename, null, onLine)
    setSplitting(false)
    if (result) {
      setReport(result)
      // the clips the splitter just wrote are new files: re-probe, so their verdicts reset
      // and the grid counts them
      await refreshProbes()
    } else if (!error) {
      setError('Knippen is niet gelukt — kijk in de regels hierboven wat er misging.')
    }
  }, [error, refreshProbes])

  /** Read the report the splitter left next to the take, without the middleware. */
  async function loadReportFromFolder() {
    if (!savedAs) return
    if (hasStudio) {
      const found = await fetchReport(savedAs)
      if (found) { setReport(found); await refreshProbes() }
      else setError(`Nog geen rapport voor ${savedAs} — knip de take eerst.`)
      return
    }
    if (!dirHandle) return
    try {
      const handle = await dirHandle.getFileHandle(`${savedAs}.report.json`)
      setReport(JSON.parse(await (await handle.getFile()).text()) as SplitReport)
      await refreshProbes()
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

  /** Two seconds of not speaking, and what the room sounds like when nobody is (§2.4). */
  async function measureTheSilence() {
    setMeasuring(true)
    setSilence(null)
    try {
      setSilence(await measureSilence(deviceId, 2000))
    } catch (err) {
      setError(`Stiltemeting mislukt: ${(err as Error).message}`)
    } finally {
      setMeasuring(false)
    }
  }

  /**
   * A verdict, and the one side effect that makes rejecting worth doing (§2.1).
   *
   * With the dev middleware, rejecting also *moves* the mp3 to `recordings/afgekeurd/`. Moved,
   * never deleted: a retake can come out worse than what it replaced, and at that point the
   * only thing that can tell you so is the clip you threw away.
   */
  const onVerdict = useCallback(async (clipFolder: AudioFolder, id: string, verdict: Verdict | null) => {
    const probe = probes[clipFolder][id] ?? MISSING
    persist(withVerdict(store, clipFolder, id, verdict, probe))
    if (verdict === 'afgekeurd' && hasStudio && probe.present) {
      if (await archiveClip(clipFolder, id)) await refreshProbes()
    }
  }, [probes, persist, store, hasStudio, refreshProbes])

  if (stage === 'recording') {
    return (
      <div className="studio">
        <Teleprompter
          ids={ids}
          labels={cueLabels}
          kind={kind}
          paceMs={paceMs}
          deviceId={deviceId}
          retakeOf={retake?.from ?? null}
          onDone={onTakeDone}
          onError={(message) => { setError(message); setStage('setup') }}
        />
      </div>
    )
  }

  const verdict = levelVerdict(level?.hold ?? null)
  const zoneLeft = meterFraction(TARGET_ZONE.low) * 100
  const zoneWidth = (meterFraction(TARGET_ZONE.high) - meterFraction(TARGET_ZONE.low)) * 100

  return (
    <div className="studio">
      <h1>🎙️ Opnamestudio</h1>

      {error && <p className="studio-error">⚠️ {error}</p>}

      {stage === 'saved' && savedAs && (
        <div className="studio-next">
          <p>Take opgeslagen als <code>{savedAs}.webm</code> + <code>{savedAs}.json</code>.</p>
          {hasStudio ? (
            <p className="review-actions">
              <button className="btn-primary" disabled={splitting} onClick={() => void cutAndListen(savedAs)}>
                {splitting ? '✂️ bezig met knippen…' : '✂️ Knip en beluister'}
              </button>
              <button className="btn-primary" onClick={() => { setStage('setup'); setReport(null) }}>
                Nieuwe take
              </button>
              <a className="studio-link" href="/#/proberen" target="_blank" rel="noreferrer">
                Speel een proefronde met deze clips ↗
              </a>
            </p>
          ) : (
            <>
              <p>Knip hem nu op:</p>
              <pre>node tools/split-take.mjs recordings/{savedAs}.webm</pre>
              <p className="review-actions">
                <button className="btn-primary" onClick={() => void loadReportFromFolder()}>Rapport laden</button>
                <button className="btn-primary" onClick={() => { setStage('setup'); setReport(null) }}>
                  Nieuwe take
                </button>
              </p>
            </>
          )}
          {progress.length > 0 && (
            <pre className="studio-progress">{progress.join('\n')}</pre>
          )}
        </div>
      )}

      {report && (
        <TakeReview
          report={report}
          labels={reportLabels(report.kind)}
          store={store}
          probes={probes[folderFor(report.kind)]}
          onVerdict={(id, v) => void onVerdict(folderFor(report.kind), id, v)}
          onRetake={(pick) => {
            setRetake({ ids: pick, from: savedAs })
            setReport(null)
            setStage('setup')
          }}
        />
      )}

      {stage === 'setup' && (
        <>
          {checklist && (
            <div className="studio-checklist">
              <b>Voor je begint</b>
              <ul>
                <li>15–20 cm van de mic, iets naast je mond</li>
                <li>plopkap ervoor</li>
                <li>telefoon stil, ventilator en laptopfan uit</li>
                <li>dezelfde plek en afstand als de vorige keer</li>
              </ul>
              <button
                className="studio-link"
                onClick={() => {
                  setChecklist(false)
                  try { sessionStorage.setItem(CHECKLIST_KEY, '1') } catch { /* private mode */ }
                }}
              >
                oké, verbergen
              </button>
            </div>
          )}

          <div className="studio-modes">
            {(Object.keys(sets) as SetChoice[]).map((value) => {
              const set = sets[value]
              // ✅ only, not "has a file": the 45 klanken on disk are the old clacky batch
              // and nobody has approved one of them, so "0 goed van 45" is exactly what this
              // set's state is and exactly what the button should say
              const good = set.ids.filter(
                (id) => clipState(store, set.folder, id, probes[set.folder][id] ?? MISSING) === 'goed',
              ).length
              const name = value === 'klanken' ? 'Klanken'
                : value === 'woorden-startset' ? 'Woorden, startset'
                : value === 'woorden' ? 'Woorden, alle'
                : value === 'weetjes' ? 'Weetjes'
                : 'Spelling'
              return (
                <button
                  key={value}
                  className={`btn-primary${choice === value ? '' : ' studio-mode-off'}`}
                  onClick={() => { setChoice(value); setRetake(null) }}
                >
                  {name}
                  <small>{good} goed van {set.ids.length}</small>
                </button>
              )
            })}
          </div>

          <p>
            <label className="studio-starter">
              <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
              {' '}alleen ontbrekende ({missingCount} van {fullSet.length})
            </label>
          </p>

          {retake && (
            <p className="studio-retake">
              Opnieuw opnemen: <b>{retake.ids.join(' · ')}</b>{' '}
              <button className="studio-link" onClick={() => setRetake(null)}>(hele set toch)</button>
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
            <div className="studio-meter-bar">
              <span className="studio-meter-zone" style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }} />
              <i style={{ width: `${meterFraction(level?.peak ?? null) * 100}%` }} />
              <b className="studio-meter-hold" style={{ left: `${meterFraction(level?.hold ?? null) * 100}%` }} />
            </div>
            <b className="studio-meter-db">
              {level && Number.isFinite(level.hold) ? `${level.hold.toFixed(0)} dBFS` : '—'}
            </b>
          </div>
          <p className={`studio-level-verdict studio-level-${verdict}`}>{LEVEL_TEXT[verdict]}</p>

          <p className="review-actions">
            <button className="btn-primary" disabled={testing} onClick={testThreeSeconds}>
              {testing ? '● opnemen…' : 'Test 3 seconden'}
            </button>
            <button className="btn-primary" disabled={measuring} onClick={() => void measureTheSilence()}>
              {measuring ? '● meten…' : 'Meet de stilte (2 s)'}
            </button>
            {testClip && <audio controls src={testClip} />}
          </p>

          {silence && (
            <p className="studio-silence">
              Ruisvloer <b>{silence.floorDbfs.toFixed(0)} dBFS</b> —{' '}
              {FLOOR_TEXT[floorVerdict(silence.floorDbfs)]}
              {hasHum(silence.hz50Db, silence.hz100Db) && (
                <>
                  {' · '}
                  <b className="studio-hum">
                    brom — kabel, USB-voeding, dimmer? (50 Hz +{silence.hz50Db.toFixed(0)} dB,
                    100 Hz +{silence.hz100Db.toFixed(0)} dB)
                  </b>
                </>
              )}
            </p>
          )}

          {!hasStudio && (
            <p>
              {!dirHandle ? (
                <button className="btn-primary" onClick={pickFolder}>Kies map (recordings/)</button>
              ) : (
                <b>Map gekozen ✓ — takes komen in recordings/, niet in app/public/</b>
              )}
            </p>
          )}

          <p className="review-actions">
            <button
              className="btn-primary"
              disabled={ids.length === 0}
              style={{ opacity: ids.length ? 1 : 0.4 }}
              onClick={() => { setError(null); setSavedAs(null); setReport(null); setStage('recording') }}
            >
              🔴 Start take ({ids.length} {kind})
            </button>
          </p>

          <p className="studio-hint">
            {kind === 'weetjes' ? (
              <>
                Lees elke zin één keer, rustig, zodra hij verschijnt. Bij een vraag: eerst de
                vraag, dan de drie antwoorden, met een adempauze ertussen.{' '}
              </>
            ) : kind === 'spelling' ? (
              <>
                De twee regels zijn zinnen; lees ze zoals je ze tegen haar zou zeggen. De rest
                zijn losse woorden — het langere woord alleen, dus <b>honden</b>, niet
                {' '}<i>hond, honden</i>.{' '}
              </>
            ) : (
              <>Lees elk woord één keer, rustig, zodra het verschijnt. </>
            )}
            Handen van het bureau — klikken en toetsen komen mee de opname in. Gaat er één mis:{' '}
            <b>spatie</b>, en hij komt achteraan terug.
          </p>

          <ClipGrid
            ids={fullSet}
            activeIds={ids}
            kind={kind}
            labels={cueLabels}
            probes={folderProbes}
            store={store}
            onVerdict={(id, v) => void onVerdict(folder, id, v)}
          />

          {hasStudio && takes.length > 0 && (
            <div className="studio-takes">
              <h2>Takes in recordings/</h2>
              <ul>
                {takes.slice(0, 10).map((take) => (
                  <li key={take.basename}>
                    <code>{take.basename}</code>{' '}
                    <span className="studio-takes-meta">
                      {take.cues} cues · {(take.bytes / 1_000_000).toFixed(1)} MB
                    </span>{' '}
                    {take.hasReport ? (
                      <button
                        className="studio-link"
                        onClick={() => void (async () => {
                          const found = await fetchReport(take.basename)
                          if (found) { setSavedAs(take.basename); setStage('saved'); setReport(found) }
                        })()}
                      >
                        rapport openen
                      </button>
                    ) : (
                      <button
                        className="studio-link"
                        disabled={splitting}
                        onClick={() => { setSavedAs(take.basename); setStage('saved'); void cutAndListen(take.basename) }}
                      >
                        knip opnieuw
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
