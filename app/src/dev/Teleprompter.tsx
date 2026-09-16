import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GO_GAP_MS, LEAD_IN_MS, buildCueSheet, markLastRetake, nextPrompt, takeProgress,
  type Cue, type CueSheet, type Pause, type TakeKind,
} from './cueSheet'
import { micConstraints, openTakeGraph, scheduleCountdown, supportedRecorderOptions, type TakeGraph } from './takeAudio'

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
export function Teleprompter({ ids, labels, kind, paceMs, deviceId, onDone, onError }: Props) {
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

      <p className="tp-keys">
        <b>spatie</b> deze opnieuw · <b>backspace</b> de vorige opnieuw · <b>Esc</b> pauze
      </p>
      <p className="tp-keys">
        <button className="tp-stop" onClick={finish}>stoppen en opslaan</button>
      </p>
    </div>
  )
}
