import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import confetti from 'canvas-confetti'
import type { Lesson, AnswerRecord, Word, WordResult } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { buildWordExercises } from '../engine/exerciseSelector'
import { windowForWord } from '../engine/readingWindow'
import { getWord } from '../words'
import { useProgress } from '../state/progress'
import { playWord, playEffect, haptic, resumeAudio, stopSpeech } from '../audio/audio'
import { Frida, type FridaExpression } from '../components/Frida'
import { Bliksemsprint } from '../components/Bliksemsprint'

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

/**
 * Where one card is in the read → listen → sort loop. The card is only graded in
 * `judging`, and only ever gets there by way of `listening` — she judges by ear, so she
 * cannot answer before she has heard the word.
 */
type Phase = 'dealing' | 'reading' | 'listening' | 'judging' | 'flying'

type PileKey = 'goed' | 'nogEven'

const SWIPE_THRESHOLD = 90
/** Drag distance at which a pile starts visibly reaching for the card. */
const TARGET_THRESHOLD = 24
/** Card deal-in, matching the .word-card.dealing animation in theme.css. */
const DEAL_MS = 260
/** Card flight to the pile, matching @keyframes cardFly. */
const FLY_MS = 420
/** Landing squash + count bump. */
const LAND_MS = 220
/** Beat after the last card lands, so the final landing reads before the reward screen. */
const END_PAUSE_MS = 600
/** Silence before the card nudges itself to suggest swiping. */
const HINT_AFTER_MS = 2500
/** She stops needing the swipe hint once she has sorted this many cards, ever. */
const HINT_UNTIL_SORTED = 5
/** Consecutive "goed" cards that earn a Bliksemsprint — same rule as Tijdrit. */
const STREAK_FOR_BURST = 3

const COACH: Record<Phase, { expr: FridaExpression; text: string }> = {
  dealing: { expr: 'head-grumpy', text: 'Klaar?' },
  reading: { expr: 'head-grumpy', text: 'Lees maar!' },
  listening: { expr: 'head-sleepy', text: 'Luister…' },
  judging: { expr: 'head-grumpy', text: 'Was het goed?' },
  // replaced by `feedback` for the whole of this phase; only a fallback
  flying: { expr: 'head-grumpy', text: '' },
}

const PILE_LABEL: Record<PileKey, string> = { goed: 'Goed!', nogEven: 'Nog even' }

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Hardop lezen — read the word, hear it, sort it onto a pile.
 *
 * A card deals in and a fuse drains along its bottom edge (10s for a new word, shorter as
 * the word becomes automatic — engine/readingWindow.ts). She reads it aloud, then either
 * taps **Laat horen** or lets the fuse run out; either way the word is then pronounced.
 * Only after hearing it can she grade herself, by swiping — or tapping — the card onto the
 * *Goed!* or *Nog even* pile, which keeps her running count for the round.
 *
 * The ordering is the point: the audio is a check on an attempt she has already made, never
 * a prompt that hands her the word. Full design in docs/hardop-lezen-rework.md.
 */
export function HardopLezen({ lesson, onComplete, onQuit }: Props) {
  const wordStats = useProgress((s) => s.wordStats)

  const [queue, setQueue] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('dealing')
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flight, setFlight] = useState<{ dx: number; dy: number; rot: number } | null>(null)
  const [piles, setPiles] = useState<Record<PileKey, string[]>>({ goed: [], nogEven: [] })
  const [feedback, setFeedback] = useState<{ expr: FridaExpression; text: string } | null>(null)
  const [bumped, setBumped] = useState<PileKey | null>(null)
  const [nudge, setNudge] = useState(false)
  /** 0 = idle; any other value keys a running Bliksemsprint so a re-trigger restarts it */
  const [burst, setBurst] = useState(0)

  /**
   * Whether the "swipe me" nudge is still worth showing, read once at mount. Total attempts
   * across every word she has ever read *is* the number of cards she has ever sorted, so
   * this needs no extra persisted state of its own.
   */
  const [showHint] = useState(
    () =>
      Object.values(useProgress.getState().wordStats).reduce((n, s) => n + s.attempts, 0) <
      HINT_UNTIL_SORTED,
  )

  const answers = useRef<AnswerRecord[]>([])
  const wordResults = useRef<WordResult[]>([])
  /**
   * The phase, readable synchronously. Guards run inside pointer/key handlers and after
   * awaits, where a render closure's `phase` can be a step behind and would let a second
   * gesture grade a card that has already flown.
   */
  const phaseRef = useRef<Phase>('dealing')
  const shownAt = useRef(0)
  /** How long she took from the word appearing to hearing it — the read time we score. */
  const readMs = useRef(0)
  /** She tapped Laat horen rather than letting the fuse run out — the promotion gate. */
  const revealedEarly = useRef(false)
  const startX = useRef(0)
  /**
   * The one pointer this drag belongs to. Without it, a second finger merely resting on the
   * card overwrites `startX` and either finger lifting could commit a grade neither gesture
   * intended — reachable for a 9-year-old resting a hand on a tablet.
   */
  const activePointerId = useRef<number | null>(null)
  const busy = useRef(false)
  const streak = useRef(0)
  const cancelled = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const pileRefs: Record<PileKey, React.RefObject<HTMLButtonElement | null>> = {
    goed: useRef<HTMLButtonElement>(null),
    nogEven: useRef<HTMLButtonElement>(null),
  }
  /** Latest reveal/commit, for listeners registered once (window timer, keyboard). */
  const revealRef = useRef<(early: boolean) => void>(() => {})
  const commitRef = useRef<(dir: 'left' | 'right') => void>(() => {})

  // commit() awaits the flight, the landing and — on a miss — the word being replayed.
  // Tapping ✕ inside that gap used to run the rest of it anyway: onComplete credited the
  // lesson and fired the fanfare and confetti over the path screen she'd just returned to.
  // `quit()` below is the primary fix (it cancels synchronously on the click, before
  // navigation even starts); this cleanup is the backstop for any other way the component
  // unmounts (StrictMode's dev remount, a future caller that navigates away without going
  // through `quit()`).
  useEffect(() => {
    // Reset on mount as well as set on unmount — StrictMode's mount → cleanup → remount in
    // dev would otherwise latch this true and freeze the game.
    cancelled.current = false
    return () => {
      cancelled.current = true
      // she's gone; don't keep reading the word she walked away from
      stopSpeech()
    }
  }, [])

  useEffect(() => {
    const ids = buildWordExercises(lesson)
    setQueue(ids)
    setTotal(ids.length)
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id])

  const currentId = queue[0]
  const current = currentId ? getWord(currentId) : undefined
  const windowMs = windowForWord(currentId ? wordStats[currentId] : undefined)

  function goPhase(next: Phase) {
    phaseRef.current = next
    setPhase(next)
  }

  /**
   * Cancel synchronously, on the click itself — not just in the unmount effect's cleanup.
   * That only runs once react-router's navigate() actually unmounts this component, which
   * isn't guaranteed to happen before commit()'s pending `await`s resolve; quitting a hair
   * before they do could otherwise still race them. This can't lose that race: it's the
   * first thing that runs on the click that starts the navigation. Stopping the speech here
   * too means she isn't still being read to on the path screen.
   */
  function quit() {
    cancelled.current = true
    stopSpeech()
    onQuit()
  }

  // A new card: deal it in, then start its reading window.
  useEffect(() => {
    if (!currentId) return
    goPhase('dealing')
    setDragX(0)
    setFlight(null)
    setFeedback(null)
    setNudge(false)
    revealedEarly.current = false
    playEffect('swish')
    const dealTimer = window.setTimeout(() => {
      shownAt.current = performance.now()
      goPhase('reading')
    }, DEAL_MS)
    return () => window.clearTimeout(dealTimer)
  }, [currentId])

  // The fuse. Registered per card so it restarts with the card, and cleared the moment she
  // reveals the word herself — a swipe or a tap must never be racing a stale timer.
  useEffect(() => {
    if (phase !== 'reading') return
    const timer = window.setTimeout(() => revealRef.current(false), windowMs)
    return () => window.clearTimeout(timer)
  }, [phase, currentId, windowMs])

  // The wordless "swipe me", for her first few cards only.
  useEffect(() => {
    if (phase !== 'judging' || !showHint) return
    const timer = window.setTimeout(() => setNudge(true), HINT_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [phase, currentId, showHint])

  useLayoutEffect(() => {
    revealRef.current = (early) => void reveal(early)
    commitRef.current = (dir) => void commit(dir)
  })

  // Keyboard play, for building and reviewing on a desktop: space reveals, arrows sort.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current === 'reading' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        revealRef.current(true)
      } else if (phaseRef.current === 'judging') {
        if (e.key === 'ArrowRight') commitRef.current('right')
        if (e.key === 'ArrowLeft') commitRef.current('left')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * Reveal the word: stop the fuse, remember how long the read took, and play it. `early`
   * means she tapped Laat horen instead of letting the fuse run out — that is the speed
   * signal that promotes the word to a shorter window next time (WordResult.withinWindow).
   */
  async function reveal(early: boolean) {
    if (phaseRef.current !== 'reading' || !current) return
    readMs.current = performance.now() - shownAt.current
    revealedEarly.current = early
    goPhase('listening')
    playEffect('pop')
    await playWord(current.id, current.text)
    if (cancelled.current) return
    goPhase('judging')
  }

  /** Hear it again while judging. Never affects timing or score. */
  async function replay() {
    if (phaseRef.current !== 'judging' || !current) return
    await playWord(current.id, current.text)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // A pointer is already driving this drag — an incidental second touch (a resting palm,
    // a stray finger) must not steal it and reset startX.
    if (phaseRef.current !== 'judging' || busy.current || activePointerId.current !== null) return
    activePointerId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    startX.current = e.clientX
    setDragging(true)
    setNudge(false)
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || e.pointerId !== activePointerId.current) return
    setDragX(e.clientX - startX.current)
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setDragging(false)
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      void commit(dragX > 0 ? 'right' : 'left')
    } else {
      setDragX(0)
    }
  }
  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    // A gesture the browser cancels (edge back-swipe, scroll takeover, an incoming call) is
    // not a completed swipe — reset rather than grade whatever dragX happened to reach.
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setDragging(false)
    setDragX(0)
  }

  function onCardClick() {
    if (phaseRef.current === 'reading') revealRef.current(true)
  }

  /**
   * Where the card has to travel to land on its pile, measured against the real elements so
   * it is right on every viewport. The card's rect already includes the drag translation, so
   * `dragX` comes back off it — otherwise a long drag counts its distance twice.
   */
  function measureFlight(pile: PileKey, direction: 'left' | 'right') {
    const cardEl = cardRef.current
    const pileEl = pileRefs[pile].current
    const rot = Math.round(Math.random() * 12 - 6)
    if (!cardEl || !pileEl) return { dx: direction === 'right' ? 400 : -400, dy: 0, rot }
    const c = cardEl.getBoundingClientRect()
    const p = pileEl.getBoundingClientRect()
    return {
      dx: Math.round(p.left + p.width / 2 - (c.left + c.width / 2 - dragX)),
      dy: Math.round(p.top + p.height / 2 - (c.top + c.height / 2)),
      rot,
    }
  }

  function confettiPuff(pile: PileKey) {
    if (prefersReducedMotion()) return
    const el = pileRefs[pile].current
    if (!el) return
    const r = el.getBoundingClientRect()
    confetti({
      particleCount: 18,
      spread: 50,
      startVelocity: 26,
      gravity: 0.9,
      ticks: 90,
      origin: {
        x: (r.left + r.width / 2) / window.innerWidth,
        y: (r.top + r.height / 2) / window.innerHeight,
      },
      colors: ['#2FA79B', '#F7C531', '#F5A03C'],
    })
  }

  async function commit(direction: 'left' | 'right') {
    if (phaseRef.current !== 'judging' || busy.current || !current) return
    busy.current = true
    try {
      await runCommit(direction, current)
    } finally {
      // playWord() can no longer hang (audio.ts's playWithFallback always resolves), but
      // this is the backstop regardless: nothing here should be able to leave the card
      // permanently unresponsive.
      busy.current = false
    }
  }

  async function runCommit(direction: 'left' | 'right', current: Word) {
    const correct = direction === 'right'
    const pile: PileKey = correct ? 'goed' : 'nogEven'
    // The read time, captured when the word was revealed — not the time she then took to
    // judge it. Those are different things, and only the first one measures her reading.
    const ms = readMs.current
    // Split across the klanken rather than charging each one the whole-word time: a
    // 10-letter word was writing ten ~6000ms samples into soundStats, which put masteryOf's
    // 2000ms "goud" gate out of reach. Whole-word timing lives in wordStats.ewmaMs.
    const msPerKlank = ms / current.klanken.length
    for (const klank of current.klanken) {
      answers.current.push({ soundId: klank, correct, ms: msPerKlank })
    }
    wordResults.current.push({
      wordId: current.id,
      correct,
      ms,
      withinWindow: revealedEarly.current,
    })

    setNudge(false)
    setFlight(measureFlight(pile, direction))
    goPhase('flying')
    playEffect(correct ? 'ding' : 'fart')
    haptic(correct ? 12 : [10, 40, 10])
    setFeedback(
      correct
        ? { expr: 'head-celebrating', text: 'Lekker!' }
        : { expr: 'head-sad', text: 'Bijna! Nog een keer luisteren.' },
    )

    // Fire on *reaching* the streak, not on every multiple of it: a ten-correct round
    // celebrates once instead of three times, which would bury the card she's reading.
    if (correct) {
      streak.current += 1
      if (streak.current === STREAK_FOR_BURST) setBurst((b) => b + 1)
    } else {
      streak.current = 0
    }

    await wait(FLY_MS)
    if (cancelled.current) return
    setPiles((p) => ({ ...p, [pile]: [...p[pile], current.id] }))
    setBumped(pile)
    if (correct) confettiPuff(pile)

    await wait(LAND_MS)
    if (cancelled.current) return
    setBumped(null)
    if (!correct) {
      // reinforce the right pronunciation before moving on
      await playWord(current.id, current.text)
      if (cancelled.current) return
      await wait(250)
      if (cancelled.current) return
    }

    // plain call, not inside setQueue's updater — calling onComplete (which updates
    // GameScreen's state) from inside a functional setState update triggers React's
    // "Cannot update a component while rendering a different component" warning
    const next = queue.slice(1)
    if (next.length === 0) {
      // Deliberately *not* clearing the queue here. An empty queue renders nothing, so
      // emptying it before the closing beat blanked the screen for END_PAUSE_MS between the
      // last card landing and the reward screen. Leaving the board up means she sees both
      // piles at their final counts for that beat instead.
      await wait(END_PAUSE_MS)
      if (cancelled.current) return
      onComplete({ answers: answers.current, wordResults: wordResults.current })
      return
    }
    setQueue(next)
  }

  if (ready && total === 0) {
    return (
      <div className="game-screen">
        <div className="game-header">
          <button className="quit" aria-label="Stoppen" onClick={quit}>
            ✕
          </button>
        </div>
        <div className="game-stage">
          <h2>Nog geen woorden om te lezen</h2>
          <button className="btn-primary" onClick={quit}>
            Terug naar het pad
          </button>
        </div>
      </div>
    )
  }

  if (!current) return null

  // Cards that have actually landed on a pile, rather than `total - queue.length`: a card
  // counts as done when it lands, and the queue is deliberately left un-emptied for the
  // closing beat, which would otherwise show 9 of 10 with the round already over.
  const doneCount = piles.goed.length + piles.nogEven.length
  const rotate = dragX / 18
  const rightOpacity = Math.max(0, Math.min(1, dragX / SWIPE_THRESHOLD))
  const leftOpacity = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD))
  const targeted: PileKey | null =
    dragging && Math.abs(dragX) > TARGET_THRESHOLD ? (dragX > 0 ? 'goed' : 'nogEven') : null
  const coach = (phase === 'flying' && feedback) || COACH[phase]
  const revealLabel =
    phase === 'listening'
      ? 'Luister…'
      : phase === 'reading' || phase === 'dealing'
        ? 'Laat horen'
        : 'Nog eens'

  const cardStyle: CSSProperties =
    phase === 'flying' && flight
      ? ({
          '--fly-x': `${flight.dx}px`,
          '--fly-y': `${flight.dy}px`,
          '--fly-rot': `${flight.rot}deg`,
          '--fly-from-x': `${dragX}px`,
          '--fly-from-rot': `${rotate}deg`,
        } as CSSProperties)
      : {
          transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
          transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(.2,1.4,.4,1)',
        }

  return (
    <div className="game-screen hardop-screen" data-phase={phase} onPointerDown={resumeAudio}>
      <div className="game-header">
        <button className="quit" aria-label="Stoppen" onClick={quit}>
          ✕
        </button>
        <div
          className="round-pips"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={doneCount}
          aria-label="Kaarten gedaan"
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`pip${i < doneCount ? ' pip-done' : i === doneCount ? ' pip-now' : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="game-stage hardop-stage">
        <div className="coach">
          <Frida expression={coach.expr} className="coach-frida" alt="" />
          <p className="coach-bubble">{coach.text}</p>
        </div>

        <div className={`swipe-arena${queue.length <= 2 ? ' last-cards' : ''}`}>
          <span className="swipe-stamp swipe-stamp-left" style={{ opacity: leftOpacity }}>
            NOG EVEN
          </span>
          <span className="swipe-stamp swipe-stamp-right" style={{ opacity: rightOpacity }}>
            GOED!
          </span>
          <div
            ref={cardRef}
            className={[
              'word-card',
              phase === 'dealing' ? 'dealing' : '',
              phase === 'reading' ? 'reading' : '',
              phase === 'judging' ? 'liftable' : '',
              phase === 'flying' ? 'flying' : '',
              nudge ? 'nudging' : '',
              // the idle drift animates transform, so it has to stand down whenever
              // something else owns it: her finger, or the nudge
              phase === 'judging' && !dragging && !nudge ? 'floating' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={cardStyle}
            onClick={onCardClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <span className="word-text">{current.text}</span>
            {phase === 'reading' && (
              <span
                className="fuse"
                aria-hidden="true"
                style={
                  {
                    // the glow's three 800ms pulses land in the final stretch of the fuse
                    '--fuse-urgent-delay': `${Math.max(0, windowMs - 2400)}ms`,
                  } as CSSProperties
                }
              >
                <span
                  className="fuse-fill"
                  key={currentId}
                  style={{ animationDuration: `${windowMs}ms` }}
                />
              </span>
            )}
            {phase === 'listening' && (
              <span className="listen-strip" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
        </div>

        <button
          className="btn-primary reveal-btn"
          onClick={() => (phase === 'reading' ? revealRef.current(true) : void replay())}
          disabled={phase === 'dealing' || phase === 'listening' || phase === 'flying'}
        >
          🔊 {revealLabel}
        </button>

        <div className="pile-row">
          {(['nogEven', 'goed'] as const).map((key) => (
            <button
              key={key}
              ref={pileRefs[key]}
              className={[
                'pile',
                key === 'goed' ? 'pile-goed' : 'pile-nog-even',
                phase === 'judging' ? 'ready' : '',
                targeted === key ? 'targeted' : '',
                bumped === key ? 'bumped' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => void commit(key === 'goed' ? 'right' : 'left')}
              disabled={phase !== 'judging'}
            >
              <span className="pile-tray">
                {piles[key].slice(-5).map((id, i) => (
                  <span
                    key={`${id}-${i}`}
                    className="pile-mini"
                    style={{
                      transform: `translate(${i * 3}px, ${-i * 3}px) rotate(${(i % 2 ? 1 : -1) * 3}deg)`,
                    }}
                  />
                ))}
                {piles[key].length > 0 && <span className="pile-count">{piles[key].length}</span>}
              </span>
              <span className="pile-label">{PILE_LABEL[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {burst > 0 && <Bliksemsprint key={burst} onDone={() => setBurst(0)} />}
    </div>
  )
}
