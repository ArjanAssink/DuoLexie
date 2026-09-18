import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GO_GAP_MS, LEAD_IN_MS, buildCueSheet, markLastRetake, nextPrompt, takeProgress,
  type Cue, type CueSheet, type Pause, type TakeKind,
} from './cueSheet'
import { createPeakMeter, micConstraints, openTakeGraph, scheduleCountdown, supportedRecorderOptions, type TakeGraph } from './takeAudio'
import { CLIP_FRAMES, NO_SIGNAL_AFTER_MS, NO_SIGNAL_DBFS, meterFraction } from './levels'

export interface Take {
  blob: Blob
  sheet: CueSheet
}

interface Props {
  ids: string[]
  /**
   * What to put on screen for an id, when the id is not the thing to read. A Weetjes cue is
   * `slim-doe`; what he has to say is "Kinderen met dyslexie zijn minder slim." The cue
   * sheet still carries the id, which is what the splitter names the mp3 after.
   */
  labels?: Record<string, string>
  kind: TakeKind
  paceMs: number
  deviceId: string | null
  /**
   * The take these clips replace, when *Deze opnieuw opnemen* started this one.
   *
   * Written into the cue sheet so the splitter lifts this take by the gain it gave that one
   * rather than measuring three words on their own (docs/recording-studio-v3.md §2.6).
   */
  retakeOf?: string | null
  onDone: (take: Take) => void
  onError: (message: string) => void
}

type Phase = 'starting' | 'countdown' | 'prompting' | 'paused' | 'saving'

interface Screen {
  phase: Phase
  /** the word, or the countdown number, or nothing */
  word: string | null
  count: number | null
  done: number
  total: number
  pending: number
  flagged: boolean
  /** counts prompts, so the pace bar restarts even when the same word comes round again */
  seq: number
}

const BLANK: Screen = { phase: 'starting', word: null, count: null, done: 0, total: 0, pending: 0, flagged: false, seq: 0 }

/** What the meter shows. Updated at 20Hz; the clip detector underneath runs every frame. */
interface Meter {
  peak: number
  hold: number
  clips: number
  /** the last word a clipped frame landed on — what to re-record, and why */
  clippedOn: string | null
  noSignal: boolean
}

const QUIET_METER: Meter = { peak: -Infinity, hold: -Infinity, clips: 0, clippedOn: null, noSignal: false }

/** 20Hz is plenty for an eye glancing sideways, and 60 React renders a second is not. */
const METER_PAINT_MS = 50

/**
 * The take itself: one word at a time, at a steady pace, while one MediaRecorder runs from
 * the first beep to the last word (docs/recording-pipeline-v2.md §3.2).
 *
 * Nothing on this screen is clickable during a take and nothing has to be. Every click and
 * key press lands on the same desk as the microphone, and those were the first thing wrong
 * with the old recordings — so the keys that do exist (Space, Backspace, Esc) are all
 * optional, and none of them stops the recorder except Esc.
 *
 * The machine runs in refs rather than in state. It is driven by timers against a clock the
 * cue sheet is written in, and a re-render in the middle of that has nothing useful to say;
 * React state here is only what is on screen.
 */
export function Teleprompter({ ids, labels, kind, paceMs, deviceId, retakeOf, onDone, onError }: Props) {
  const [screen, setScreen] = useState<Screen>({ ...BLANK, total: ids.length })
  const cues = useRef<Cue[]>([])
  const pauses = useRef<Pause[]>([])
  const current = useRef<{ id: string; shownAt: number; retake: boolean } | null>(null)
  const t0 = useRef(0)
  const startedAt = useRef(new Date())
  const timer = useRef<number | null>(null)
  const graph = useRef<TakeGraph | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const pausedAt = useRef<number | null>(null)
  const finished = useRef(false)
  const ticks = useRef<number[]>([])
  const [meter, setMeter] = useState<Meter>(QUIET_METER)
  const clips = useRef<{ count: number; on: string | null }>({ count: 0, on: null })
  /** ids already counted as clipped — and `''` for a clip before the first word appeared */
  const clippedIds = useRef(new Set<string>())
  const stopMeter = useRef<(() => void) | null>(null)

  const paint = useCallback((patch: Partial<Screen>) => {
    const progress = takeProgress(ids, cues.current)
    setScreen((s) => ({ ...s, ...progress, ...patch }))
  }, [ids])

  /** Everything the machine schedules goes through here, so a single clear stops all of it. */
  const after = useCallback((ms: number, fn: () => void) => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, Math.max(0, ms))
  }, [])

  const now = () => performance.now() - t0.current

  const clearTicks = () => {
    ticks.current.forEach(clearTimeout)
    ticks.current = []
  }

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    if (timer.current !== null) clearTimeout(timer.current)
    clearTicks()
    paint({ phase: 'saving', word: null, count: null })
    recorder.current?.stop()
  }, [paint])

  const showPrompt = useCallback((id: string, at = now()) => {
    current.current = { id, shownAt: at, retake: false }
    setScreen((s) => ({ ...s, seq: s.seq + 1 }))
    paint({ phase: 'prompting', word: id, count: null, flagged: false })
    after(paceMs, () => {
      const shown = current.current
      if (!shown) return
      // one reading of the clock closes this cue and opens the next. Two readings would leave
      // a sub-millisecond hole between them, and a hole in the cue sheet is a stretch of take
      // that no prompt's own span contains — which is exactly what the splitter uses to tell
      // an unambiguous word from one that straddles a prompt change.
      const at = now()
      cues.current = [...cues.current, {
        id: shown.id,
        shownAt: shown.shownAt,
        hiddenAt: at,
        ...(shown.retake ? { retake: true as const } : {}),
      }]
      current.current = null
      const next = nextPrompt(ids, cues.current)
      if (next === null) finish()
      else showPrompt(next, at)
    })
  }, [after, finish, ids, paceMs, paint])

  /** 3 · 2 · 1 · go, then a beat, then the first word. Used again after every resume. */
  const runCountdown = useCallback(() => {
    const g = graph.current
    if (!g) return
    const firstBeepAt = scheduleCountdown(g, LEAD_IN_MS)
    // the cue clock is zeroed once, on the very first beep of the take; a resume countdown is
    // more beeps on the same clock, not a new one
    if (t0.current === 0) t0.current = firstBeepAt
    paint({ phase: 'countdown', word: null, count: 3 })
    clearTicks()
    for (const step of [1, 2, 3]) {
      ticks.current.push(window.setTimeout(
        () => paint({ phase: 'countdown', count: 3 - step || null }),
        (LEAD_IN_MS / 3) * step,
      ))
    }
    after(LEAD_IN_MS + GO_GAP_MS, () => {
      const next = nextPrompt(ids, cues.current)
      if (next === null) finish()
      else showPrompt(next)
    })
  }, [after, finish, ids, paint, showPrompt])

  /**
   * The meter, the clip counter and the "geen signaal" warning (§2.2).
   *
   * A slipped microphone, a USB interface dropping out, or one word shouted into the
   * diaphragm are all invisible today: they surface at split time, after three minutes of
   * reading, and the whole take goes again. None of them is subtle while it is happening, so
   * the only thing missing was somewhere to see it.
   *
   * Reading runs every animation frame, painting at 20Hz. That is not a micro-optimisation:
   * the analyser's window is 43ms of audio, so a frame every 17ms covers the take with
   * overlap and cannot miss a clipped word between looks, while re-rendering the prompt sixty
   * times a second to move a bar is exactly the kind of work that makes a word arrive late.
   */
  const watchLevel = useCallback((g: TakeGraph) => {
    const read = createPeakMeter(g.analyser)
    let over = 0
    let quietSince: number | null = null
    let painted = 0
    let raf = 0

    const tick = () => {
      if (finished.current) return
      const now = performance.now()
      const { peak, hold, over: isOver } = read(now)

      // Two frames, not one: a single frame at the top of the scale is a transient that mp3
      // will round off anyway, and a counter that fires on those cries wolf for a whole take.
      over = isOver ? over + 1 : 0
      if (over >= CLIP_FRAMES) {
        over = 0
        const shown = current.current
        // Counted once per word, not once per frame and not once per take.
        //
        // Once per frame would race to hundreds on a microphone set too hot, which is a
        // number nobody can act on. Once per take was worse: a continuously clipping input
        // never lets the frame counter fall back, so the first clip — which lands during the
        // countdown, before any word is on screen — would be the only one ever reported, and
        // the counter would never name a word at all.
        const key = shown?.id ?? ''
        if (!clippedIds.current.has(key)) {
          clippedIds.current.add(key)
          clips.current = { count: clips.current.count + 1, on: shown?.id ?? clips.current.on }
          // exactly what Space does, without him having to notice: a clipped word is not a
          // word that can be rescued later, and the retake queue already knows how to bring
          // one back at the end of the set.
          //
          // Once per id here too. A microphone this hot clips the retakes as well, and a
          // queue that re-flags what it re-prompts is a take that never ends — where a person
          // pressing Space eventually stops, this would not. A second clip on the same word
          // is a level problem the counter is already shouting about, not something another
          // pass would fix.
          if (shown) {
            shown.retake = true
            paint({ flagged: true })
          }
        }
      }

      if (peak < NO_SIGNAL_DBFS) quietSince ??= now
      else quietSince = null
      // only while prompting: the countdown and the pause are supposed to be silent, and a
      // warning that fires during them is a warning nobody reads during the take
      const prompting = current.current !== null
      const noSignal = prompting && quietSince !== null && now - quietSince > NO_SIGNAL_AFTER_MS

      if (now - painted >= METER_PAINT_MS) {
        painted = now
        setMeter({ peak, hold, clips: clips.current.count, clippedOn: clips.current.on, noSignal })
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paint])

  useEffect(() => {
    let cancelled = false
    const chunks: Blob[] = []

    async function start() {
      let mic: MediaStream
      try {
        mic = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId))
      } catch (err) {
        if (!cancelled) onError(`Microfoon starten mislukt: ${(err as Error).message}`)
        return
      }
      if (cancelled) {
        mic.getTracks().forEach((t) => t.stop())
        return
      }
      const g = openTakeGraph(mic)
      graph.current = g
      stopMeter.current = watchLevel(g)
      const rec = new MediaRecorder(g.stream, supportedRecorderOptions())
      recorder.current = rec
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        mic.getTracks().forEach((t) => t.stop())
        g.close()
        if (cancelled) return
        onDone({
          blob,
          sheet: buildCueSheet({
            kind,
            startedAt: startedAt.current,
            paceMs,
            leadInMs: LEAD_IN_MS,
            cues: cues.current,
            pauses: pauses.current,
            retakeOf,
          }),
        })
      }
      startedAt.current = new Date()
      rec.start()
      runCountdown()
    }

    void start()
    return () => {
      cancelled = true
      if (timer.current !== null) clearTimeout(timer.current)
      clearTicks()
      // the analyser belongs to a graph that is about to be closed; a raf loop still reading
      // from it would be reading from nothing
      stopMeter.current?.()
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      graph.current?.mic.getTracks().forEach((t) => t.stop())
      graph.current?.close()
    }
    // one take per mount: the settings are fixed when it starts, and a re-run mid-take
    // would be a second recorder on the same microphone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * The three keys of §3.2, and only these. Space and Backspace do not interrupt anything —
   * they leave a mark in the cue sheet and the word comes back at the end of the set.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.key === ' ') {
        e.preventDefault()
        if (!current.current) return
        current.current.retake = true
        paint({ flagged: true })
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        cues.current = markLastRetake(cues.current)
        paint({})
      } else if (e.key === 'Escape') {
        e.preventDefault()
        togglePause()
      }
    }

    function togglePause() {
      const rec = recorder.current
      if (!rec || finished.current) return
      if (pausedAt.current === null) {
        if (timer.current !== null) clearTimeout(timer.current)
        // the word on screen was cut off mid-read, so it is flagged rather than trusted —
        // it comes back after the resume like any other stumble
        const shown = current.current
        if (shown) {
          cues.current = [...cues.current, { id: shown.id, shownAt: shown.shownAt, hiddenAt: now(), retake: true as const }]
          current.current = null
        }
        pausedAt.current = now()
        rec.pause()
        paint({ phase: 'paused', word: null, count: null })
      } else {
        // `from`/`to` are exactly the interval MediaRecorder produced nothing for; the
        // splitter subtracts it from every cue after it
        pauses.current = [...pauses.current, { from: pausedAt.current, to: now() }]
        pausedAt.current = null
        rec.resume()
        runCountdown()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paint, runCountdown])

  const ring = screen.phase === 'prompting' ? { animationDuration: `${paceMs}ms` } : undefined

  return (
    <div className="tp" data-phase={screen.phase}>
      <div className="tp-progress">
        {screen.done} / {screen.total}
        {screen.pending > 0 && <span className="tp-pending"> · {screen.pending} opnieuw</span>}
      </div>

      {screen.phase === 'countdown' && (
        <div className="big-sound tp-count">{screen.count ?? 'nu!'}</div>
      )}
      {screen.phase === 'prompting' && (
        <>
          <div
            className={`big-sound tp-word${screen.flagged ? ' tp-word-flagged' : ''}${
              kind === 'weetjes' ? ' tp-sentence' : ''
            }`}
          >
            {(screen.word && labels?.[screen.word]) ?? screen.word}
          </div>
          <div className="tp-bar"><i key={screen.seq} style={ring} /></div>
        </>
      )}
      {screen.phase === 'paused' && <div className="big-sound tp-paused">gepauzeerd</div>}
      {screen.phase === 'saving' && <div className="big-sound tp-paused">opslaan…</div>}
      {screen.phase === 'starting' && <div className="big-sound tp-paused">microfoon…</div>}

      <div className="tp-meter" aria-label="microfoonniveau">
        <div className="tp-meter-bar">
          <i style={{ width: `${meterFraction(meter.peak) * 100}%` }} />
          <b className="tp-meter-hold" style={{ left: `${meterFraction(meter.hold) * 100}%` }} />
          <span className="tp-meter-zone" />
        </div>
        <span className="tp-meter-db">
          {Number.isFinite(meter.hold) ? `${meter.hold.toFixed(0)} dBFS` : '—'}
        </span>
        {meter.clips > 0 && (
          <span className="tp-meter-clip">
            ⚠︎ {meter.clips}× oversturing{meter.clippedOn ? ` (${meter.clippedOn})` : ''}
          </span>
        )}
        {meter.noSignal && <span className="tp-meter-clip">⚠︎ geen signaal</span>}
      </div>

      <p className="tp-keys">
        <b>spatie</b> deze opnieuw · <b>backspace</b> de vorige opnieuw · <b>Esc</b> pauze
      </p>
      <p className="tp-keys">
        <button className="tp-stop" onClick={finish}>stoppen en opslaan</button>
      </p>
    </div>
  )
}
