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
import { resolveSwipe, SWIPE_DISTANCE_PX, type SwipeSample } from './swipe'
import { prefersReducedMotion } from '../motion'

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

/** How the card was sorted. Only a real swipe teaches her anything — see SWIPES_TO_LEARN. */
type Via = 'swipe' | 'tap' | 'key'

/** Drag distance at which a pile starts visibly reaching for the card. */
const TARGET_THRESHOLD = 24
/** Card deal-in, matching the .word-card.dealing animation in theme.css. */
const DEAL_MS = 260
/** Card flight to the pile, matching @keyframes cardFlyUp / cardFlyDown. */
const FLY_MS = 420
/** Landing squash + count bump. */
const LAND_MS = 220
/** Beat after the last card lands, so the final landing reads before the reward screen. */
const END_PAUSE_MS = 600
/**
 * Silence before the card demonstrates the swipe on itself. Short, because on a card she
 * does not yet know how to sort, the demonstration *is* the instruction — waiting longer
 * just leaves her looking at a card that does nothing.
 */
const HINT_AFTER_MS = 1200
/** @keyframes cardGhostSwipe — the up-then-down demonstration, end to end. */
const GHOST_MS = 1700
/**
 * The taught tap: the card performs the swipe she could have made before it flies.
 * Press 200 + travel 600 + the finger lifting 150, matching @keyframes demoSwipe*.
 */
const DEMO_MS = 950
/** How far the taught tap carries the card before the flight takes over. */
const DEMO_TRAVEL_PX = 120
/**
 * Swipes she has made *herself* before the teaching switches off. Taps and arrow keys
 * deliberately do not count: a child who only ever taps has not learned the gesture, and
 * counting her taps would take the lesson away before she had it.
 */
const SWIPES_TO_LEARN = 5
/** Consecutive "goed" cards that earn a Bliksemsprint — same rule as Tijdrit. */
const STREAK_FOR_BURST = 3
/**
 * Pointer samples kept per gesture. Enough tail for the flick velocity (a few hundred ms at
 * any realistic pointer rate) without letting a long, slow, thoughtful drag grow unbounded.
 */
const MAX_SAMPLES = 20

const COACH: Record<Phase, { expr: FridaExpression; text: string }> = {
  dealing: { expr: 'head-grumpy', text: 'Klaar?' },
  reading: { expr: 'head-grumpy', text: 'Lees maar!' },
  listening: { expr: 'head-sleepy', text: 'Luister…' },
  judging: { expr: 'head-grumpy', text: 'Was het goed?' },
  // replaced by `feedback` for the whole of this phase; only a fallback
  flying: { expr: 'head-grumpy', text: '' },
}

const PILE_LABEL: Record<PileKey, string> = { goed: 'Goed!', nogEven: 'Nog even' }

/** What Frida says while the card shows her the swipe she could have made. */
const DEMO_COACH: Record<PileKey, string> = {
  goed: 'Zo! Veeg omhoog.',
  nogEven: 'Zo! Veeg omlaag.',
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** A small chevron, pointing at the pile the card belongs on. */
function Chevron() {
  return (
    <svg viewBox="0 0 24 14" aria-hidden="true">
      <path
        d="M2 12 L12 3 L22 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Hardop lezen — read the word, hear it, sort it onto a pile.
 *
 * A card deals in and a fuse drains along its bottom edge (10s for a new word, shorter as
 * the word becomes automatic — engine/readingWindow.ts). She reads it aloud, then either
 * taps the speaker badge on the card or lets the fuse run out; either way the word is then
 * pronounced. Only after hearing it can she grade herself, by flicking the card **up** into
 * Frida's *Goed!* pocket or **down** into the *Nog even* tray.
 *
 * Up and down rather than left and right because direction has to mean something: a word
 * that went well goes up to Frida, a word that needs another go is put down in the tray.
 * Left and right meant nothing, and on a phone a horizontal drag fights the edge gestures.
 *
 * Tapping a pile keeps working and is never the lesser option — until she has swiped five
 * cards herself, a tap makes the card *perform* the swipe before it flies, so the gesture
 * is shown to her every time she takes the obvious route (§4 of the spec).
 *
 * The read → listen → grade ordering is the point: the audio is a check on an attempt she
 * has already made, never a prompt that hands her the word. Full design in
 * docs/hardop-lezen-rework.md and docs/hardop-lezen-swipe-v2.md.
 */
export function HardopLezen({ lesson, onComplete, onQuit }: Props) {
  const wordStats = useProgress((s) => s.wordStats)
  const noteSelfSwipe = useProgress((s) => s.noteSelfSwipe)

  const [queue, setQueue] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('dealing')
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flight, setFlight] = useState<{
    dx: number
    dy: number
    rot: number
    pile: PileKey
    fromY: number
    taught: boolean
  } | null>(null)
  const [piles, setPiles] = useState<Record<PileKey, string[]>>({ goed: [], nogEven: [] })
  const [feedback, setFeedback] = useState<{ expr: FridaExpression; text: string } | null>(null)
  const [bumped, setBumped] = useState<PileKey | null>(null)
  /** The card is demonstrating the swipe on itself, unprompted (§4.1). */
  const [ghosting, setGhosting] = useState(false)
  /** A tap is being answered by showing her the swipe first (§4.3); which pile it is aimed at. */
  const [demo, setDemo] = useState<PileKey | null>(null)
  /** 0 = idle; any other value keys a running Bliksemsprint so a re-trigger restarts it */
  const [burst, setBurst] = useState(0)

  /**
   * Swipes she has made herself. Subscribed rather than read once at mount, which covers
   * both directions this has to be right in: the fifth swipe of her very first round
   * switches the teaching off for the sixth card, and a profile that is still rehydrating
   * from IndexedDB when this mounts — which is what a deep link straight into a lesson
   * looks like — switches it off the moment her saved count arrives, instead of teaching
   * the gesture all over again to a child who learned it last week.
   */
  const selfSwipes = useProgress((s) => s.settings.selfSwipes)
  const learned = selfSwipes >= SWIPES_TO_LEARN

  /**
   * Read once: the teaching layers are all motion, and under reduced motion the taught tap
   * is simply the quick flight (§6). Read at mount rather than per render because it also
   * decides a JS branch, not only which CSS applies.
   */
  const [reducedMotion] = useState(prefersReducedMotion)

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
  /** She tapped the speaker badge rather than letting the fuse run out — the promotion gate. */
  const revealedEarly = useRef(false)
  const startY = useRef(0)
  /**
   * The gesture so far, for games/swipe.ts to read a verdict out of. Points, not just a
   * start and an end, because a flick is a fact about the *last* few of them.
   */
  const samples = useRef<SwipeSample[]>([])
  /**
   * The one pointer this drag belongs to. Without it, a second finger merely resting on the
   * card overwrites the gesture and either finger lifting could commit a grade neither
   * gesture intended — reachable for a 9-year-old resting a hand on a tablet.
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
  const commitRef = useRef<(pile: PileKey, via: Via) => void>(() => {})

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
    setDragY(0)
    setFlight(null)
    setFeedback(null)
    setGhosting(false)
    setDemo(null)
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

  // Layer one of the teaching (§4.1): if she hasn't picked the card up, it swipes itself,
  // once, with a finger-shaped dot riding along. Runs per card while she is still learning.
  useEffect(() => {
    if (phase !== 'judging' || learned || reducedMotion) return
    const start = window.setTimeout(() => setGhosting(true), HINT_AFTER_MS)
    // Cleared again afterwards so the card's idle float can resume; the demonstration is a
    // one-off per card, never a loop she has to wait out.
    const end = window.setTimeout(() => setGhosting(false), HINT_AFTER_MS + GHOST_MS)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(end)
    }
  }, [phase, currentId, learned, reducedMotion])

  useLayoutEffect(() => {
    revealRef.current = (early) => void reveal(early)
    commitRef.current = (pile, via) => void commit(pile, via)
  })

  // Keyboard play, for building and reviewing on a desktop: space reveals, up/down sort —
  // the same directions as the gesture, so the two never disagree about which is which.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current === 'reading' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        revealRef.current(true)
      } else if (phaseRef.current === 'judging') {
        if (e.key === 'ArrowUp') commitRef.current('goed', 'key')
        if (e.key === 'ArrowDown') commitRef.current('nogEven', 'key')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * Reveal the word: stop the fuse, remember how long the read took, and play it. `early`
   * means she tapped the speaker badge instead of letting the fuse run out — that is the
   * speed signal that promotes the word to a shorter window next time
   * (WordResult.withinWindow).
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
    // a stray finger) must not steal it and reset the gesture.
    if (phaseRef.current !== 'judging' || busy.current || activePointerId.current !== null) return
    activePointerId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    startY.current = e.clientY
    samples.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }]
    setDragging(true)
    // her finger is on the card; the demonstration has served its purpose and must not
    // fight her for the transform
    setGhosting(false)
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || e.pointerId !== activePointerId.current) return
    const s = samples.current
    s.push({ t: performance.now(), x: e.clientX, y: e.clientY })
    // Cap the buffer, but drop from the *second* slot: resolveSwipe measures total distance
    // from the first sample, so evicting the origin would make a long slow drag read as a
    // short one. The tail is what the flick velocity needs, and that is what survives.
    if (s.length > MAX_SAMPLES) s.splice(1, 1)
    setDragY(e.clientY - startY.current)
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setDragging(false)
    const verdict = resolveSwipe(samples.current)
    samples.current = []
    if (verdict) {
      void commit(verdict, 'swipe')
    } else {
      setDragY(0)
    }
  }
  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    // A gesture the browser cancels (edge back-swipe, scroll takeover, an incoming call) is
    // not a completed swipe — reset rather than grade whatever dragY happened to reach.
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setDragging(false)
    samples.current = []
    setDragY(0)
  }

  function onCardClick() {
    if (phaseRef.current === 'reading') revealRef.current(true)
  }

  /**
   * Where the card has to travel to land on its pile, measured against the real elements so
   * it is right on every viewport. The card's rect already includes the drag translation, so
   * `dragY` comes back off it — otherwise a long drag counts its distance twice. The flight
   * then starts from `--fly-from-y`, which is where the card actually is.
   */
  function measureFlight(pile: PileKey) {
    const cardEl = cardRef.current
    const pileEl = pileRefs[pile].current
    // ±4°, not the old ±6: a card travelling straight up or down reads as thrown, not
    // tumbled, and a big rotation on a short vertical hop just looks like a glitch.
    const rot = Math.round(Math.random() * 8 - 4)
    if (!cardEl || !pileEl) return { dx: 0, dy: pile === 'goed' ? -400 : 400, rot }
    const c = cardEl.getBoundingClientRect()
    const p = pileEl.getBoundingClientRect()
    return {
      dx: Math.round(p.left + p.width / 2 - (c.left + c.width / 2)),
      dy: Math.round(p.top + p.height / 2 - (c.top + c.height / 2 - dragY)),
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

  async function commit(pile: PileKey, via: Via) {
    if (phaseRef.current !== 'judging' || busy.current || !current) return
    busy.current = true
    try {
      await runCommit(pile, via, current)
    } finally {
      // playWord() can no longer hang (audio.ts's playWithFallback always resolves), but
      // this is the backstop regardless: nothing here should be able to leave the card
      // permanently unresponsive.
      busy.current = false
    }
  }

  async function runCommit(pile: PileKey, via: Via, current: Word) {
    const correct = pile === 'goed'
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

    // Only a swipe she made herself counts towards no longer being taught the swipe.
    if (via === 'swipe') noteSelfSwipe()

    // A tap, while she is still learning, is answered by showing her the gesture: the card
    // travels the way her finger would have, and only then flies. Read straight out of the
    // store rather than from this render's closure, which can be a step behind the swipe
    // that just crossed the threshold.
    const taught =
      via === 'tap' &&
      useProgress.getState().settings.selfSwipes < SWIPES_TO_LEARN &&
      !reducedMotion

    setGhosting(false)
    setFlight({
      ...measureFlight(pile),
      pile,
      // Where the flight starts from: her finger's last position after a swipe, or the far
      // end of the demonstration after a taught tap.
      fromY: taught ? (pile === 'goed' ? -DEMO_TRAVEL_PX : DEMO_TRAVEL_PX) : dragY,
      taught,
    })
    goPhase('flying')

    if (taught) {
      // The whole visual sequence — demonstration then flight — is one CSS animation chain
      // set up by the class above, deliberately not a chain of JS timers:
      // quit-mid-animation.spec.ts freezes the page's clock at exactly this point, and CSS
      // keeps running under a fake clock where setTimeout does not. What is timed here is
      // only *state*: when Frida switches from teaching to reacting, and when the card
      // lands on the pile.
      setDemo(pile)
      setFeedback({ expr: 'head-grumpy', text: DEMO_COACH[pile] })
      await wait(DEMO_MS)
      if (cancelled.current) return
      setDemo(null)
    }

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
  // Rising = bigger and lighter, dropping = smaller and dimmer. The asymmetry is the point:
  // up should feel like a lift, down like putting something away.
  const scale = reducedMotion
    ? 1
    : dragY < 0
      ? 1 + clamp(-dragY / 600, 0, 0.06)
      : 1 - clamp(dragY / 1200, 0, 0.05)
  const dragOpacity = dragY > 0 ? 1 - clamp(dragY / SWIPE_DISTANCE_PX, 0, 1) * 0.15 : 1
  const goedOpacity = clamp(-dragY / SWIPE_DISTANCE_PX, 0, 1)
  const nogEvenOpacity = clamp(dragY / SWIPE_DISTANCE_PX, 0, 1)
  const targeted: PileKey | null =
    demo ??
    (dragging && Math.abs(dragY) > TARGET_THRESHOLD ? (dragY < 0 ? 'goed' : 'nogEven') : null)
  const coach = (phase === 'flying' && feedback) || COACH[phase]
  // The chevrons are the piles' labels turned into directions, so they are only worth the
  // room while she still needs telling — and never while her finger is already on the card.
  const pointing = phase === 'judging' && !learned && !dragging
  const canReplay = phase === 'judging' || phase === 'flying'

  const cardStyle: CSSProperties =
    phase === 'flying' && flight
      ? ({
          '--fly-x': `${flight.dx}px`,
          '--fly-y': `${flight.dy}px`,
          '--fly-rot': `${flight.rot}deg`,
          '--fly-from-y': `${flight.fromY}px`,
        } as CSSProperties)
      : {
          transform: `translateY(${dragY}px) scale(${scale})`,
          opacity: dragOpacity,
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
        {/* Frida and the pocket share the top row: a good word goes up to her, and she is
            standing right next to where it lands. */}
        <div className="top-row">
          <div className="coach">
            <Frida expression={coach.expr} className="coach-frida" alt="" />
            <p className="coach-bubble">{coach.text}</p>
          </div>

          <button
            ref={pileRefs.goed}
            className={[
              'pile',
              'pocket',
              'pile-goed',
              phase === 'judging' ? 'ready' : '',
              targeted === 'goed' ? 'targeted' : '',
              bumped === 'goed' ? 'bumped' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => void commit('goed', 'tap')}
            disabled={phase !== 'judging'}
          >
            <span className="pile-tray">
              {piles.goed.slice(-5).map((id, i) => (
                <span
                  key={`${id}-${i}`}
                  className="pile-mini"
                  style={{
                    transform: `translate(${i * 3}px, ${-i * 3}px) rotate(${(i % 2 ? 1 : -1) * 3}deg)`,
                  }}
                />
              ))}
              {piles.goed.length > 0 && <span className="pile-count">{piles.goed.length}</span>}
            </span>
            <span className="pile-label">{PILE_LABEL.goed}</span>
          </button>
        </div>

        {/* Always in the layout, faded rather than unmounted: appearing and disappearing
            chevrons would shift the card under her finger at the worst possible moment. */}
        <div className={`chevrons chevrons-up${pointing ? ' pointing' : ''}`} aria-hidden="true">
          <Chevron />
          <Chevron />
        </div>

        <div className={`swipe-arena${queue.length <= 2 ? ' last-cards' : ''}`}>
          <div
            ref={cardRef}
            className={[
              'word-card',
              phase === 'dealing' ? 'dealing' : '',
              phase === 'reading' ? 'reading' : '',
              phase === 'judging' ? 'liftable' : '',
              phase === 'flying' ? 'flying' : '',
              phase === 'flying' && flight ? (flight.pile === 'goed' ? 'fly-up' : 'fly-down') : '',
              phase === 'flying' && flight?.taught ? 'taught' : '',
              ghosting ? 'ghosting' : '',
              // the idle drift animates transform, so it has to stand down whenever
              // something else owns it: her finger, or either demonstration
              phase === 'judging' && !dragging && !ghosting ? 'floating' : '',
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
            {/* Inside the card so they travel with it — a stamp that stayed behind while
                the card left would read as part of the board, not part of the verdict. */}
            <span
              className={`swipe-stamp swipe-stamp-goed${demo === 'goed' ? ' stamp-demo' : ''}`}
              style={demo ? undefined : { opacity: goedOpacity }}
            >
              GOED!
            </span>
            <span className="word-text">{current.text}</span>
            <span
              className={`swipe-stamp swipe-stamp-nog-even${demo === 'nogEven' ? ' stamp-demo' : ''}`}
              style={demo ? undefined : { opacity: nogEvenOpacity }}
            >
              NOG EVEN
            </span>

            {/* On the card rather than under it: the tray below needs that vertical room on
                an iPhone, and the control belongs to the word anyway. */}
            <button
              className={`reveal-btn${canReplay ? ' replay' : ''}`}
              aria-label={canReplay ? 'Nog eens' : 'Laat horen'}
              onClick={(e) => {
                e.stopPropagation()
                if (phase === 'reading') revealRef.current(true)
                else void replay()
              }}
              // The badge sits inside the draggable card, so a press on it must not also
              // start a drag. resumeAudio is called explicitly because stopping propagation
              // also stops it reaching the screen-level handler that normally unlocks audio.
              onPointerDown={(e) => {
                resumeAudio()
                e.stopPropagation()
              }}
              disabled={phase === 'dealing' || phase === 'listening'}
            >
              🔊{canReplay && <span className="reveal-label"> Nog eens</span>}
            </button>

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

          {/* "A finger is here." Mounted only while something is actually being shown, so
              its absence is what the tests can assert once she has learned the gesture. */}
          {(ghosting || demo) && (
            <span
              className={`touch-dot${demo ? ` dot-demo dot-demo-${demo === 'goed' ? 'up' : 'down'}` : ' dot-ghost'}`}
              aria-hidden="true"
            />
          )}
        </div>

        <div className={`chevrons chevrons-down${pointing ? ' pointing' : ''}`} aria-hidden="true">
          <Chevron />
          <Chevron />
        </div>

        {/* The oefenbakje: wide and low, so putting a word down into it is a small drop
            rather than a throw. */}
        <button
          ref={pileRefs.nogEven}
          className={[
            'pile',
            'tray',
            'pile-nog-even',
            phase === 'judging' ? 'ready' : '',
            targeted === 'nogEven' ? 'targeted' : '',
            bumped === 'nogEven' ? 'bumped' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => void commit('nogEven', 'tap')}
          disabled={phase !== 'judging'}
        >
          <span className="pile-tray">
            {piles.nogEven.slice(-5).map((id, i) => (
              <span
                key={`${id}-${i}`}
                className="pile-mini"
                style={{
                  transform: `translate(${i * 3}px, ${-i * 3}px) rotate(${(i % 2 ? 1 : -1) * 3}deg)`,
                }}
              />
            ))}
            {piles.nogEven.length > 0 && <span className="pile-count">{piles.nogEven.length}</span>}
          </span>
          <span className="pile-label">{PILE_LABEL.nogEven}</span>
        </button>
      </div>

      {burst > 0 && <Bliksemsprint key={burst} onDone={() => setBurst(0)} />}
    </div>
  )
}
