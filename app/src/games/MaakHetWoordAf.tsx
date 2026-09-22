import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import confetti from 'canvas-confetti'
import type { Lesson, SpellingPair, SpellingResult, SpellingWord } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { buildSpellingRound } from '../engine/exerciseSelector'
import { TRY_UNIT_ID } from '../data/path'
import { GAP_SLACK_PX, overGap, requeue, type Box } from '../engine/spelling'
import {
  allSpellingWords,
  getSpellingPair,
  getSpellingWord,
  langerClipId,
  regelClipId,
  strategyLine,
} from '../spelling'
import { getWord } from '../words'
import { useProgress } from '../state/progress'
import {
  haptic,
  playEffect,
  playSpelling,
  playWord,
  resumeAudio,
  stopNarration,
} from '../audio/audio'
import { Frida, type FridaExpression } from '../components/Frida'
import { Bliksemsprint } from '../components/Bliksemsprint'
import { resolveDrag, type SwipeSample } from './swipe'
import { prefersReducedMotion } from '../motion'

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

/**
 * Where one card is. The card is only answerable in `choose`; `right` and `wrong` are the
 * verdict playing out, and nothing she does during them counts.
 */
type Beat = 'deal' | 'choose' | 'right' | 'wrong'

/** Which step the strategy bubble is on. `null` is closed (§4). */
type Strategy = null | 'prompt' | 'reveal'

/** Card deal-in, matching the .spel-card.dealing animation in theme.css. */
const DEAL_MS = 260
/** Movement under this is still a tap; past it the tile lifts out of its slot. */
const LIFT_SLOP_PX = 8
/** A tapped tile sliding itself into the gap — matching .spel-tile.sliding's transition. */
const SLIDE_MS = 260
/** A released tile springing back to its slot — matching .spel-tile.returning. */
const RETURN_MS = 320
/** The wrong tile bumping the gap and coming back — @keyframes tileBump. */
const BUMP_MS = 420
/** How long the card's border stays orange after a miss (§8). */
const FLASH_MS = 600
/** After a right answer, before the next card deals in. */
const NEXT_RIGHT_MS = 900
/** After a wrong one. Longer: she has to see the correction, not catch a glimpse of it. */
const NEXT_WRONG_MS = 1600
/** Beat after the last card, so the final landing reads before the reward screen. */
const END_PAUSE_MS = 600
/** The `langer` badge reveals by itself this long after the prompt, if she does not tap (§4). */
const LANGER_REVEAL_MS = 2000
/** Consecutive first-time-right cards that earn a Bliksemsprint — the rule Tijdrit set. */
const STREAK_FOR_BURST = 3
/** Pointer samples kept per gesture — same bound, and same reason, as Hardop lezen. */
const MAX_SAMPLES = 20

const COACH: Record<Beat, { expr: FridaExpression; text: string }> = {
  deal: { expr: 'head-grumpy', text: 'Klaar?' },
  choose: { expr: 'head-grumpy', text: 'Welke past?' },
  right: { expr: 'head-celebrating', text: 'Lekker!' },
  wrong: { expr: 'head-sad', text: 'Bijna! Kijk:' },
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * Maak het woord af — a word is spoken and shown with its last sound missing (`hon▢`), two
 * tiles offer the two ways it could be spelled (`d` · `t`), and she slides the right one
 * into the gap.
 *
 * It starts with the two pairs where the *sound* gives no help at all — `hond`/`hont` and
 * `lucht`/`lugt` are pronounced the same — so every item comes with a **strategy** she can
 * call on rather than a rule she has to remember: *Maak langer* for d/t, the cht/gt rule for
 * the other. The badge is free, always available, and never affects the score.
 *
 * **The wrong spelling is never formed.** A wrong tile bumps against the gap and bounces
 * back to its slot; it does not enter, so `hont` never appears on the card. That is the one
 * rule the whole design is built around (docs/maak-het-woord-af.md §1): the alternative —
 * two full spellings side by side — puts a misspelled word image in front of a child with
 * dyslexia on every single card.
 *
 * There is deliberately **no hearing gate**: she may choose before the word has finished
 * playing. The stem `hon` is unambiguous to a reader, so the audio confirms rather than
 * reveals, and this is the one place the game differs from Hardop lezen's read → hear →
 * judge order (§4).
 *
 * Full design in docs/maak-het-woord-af.md; the gesture is the Flitsen carry
 * (docs/flitsen-swipe.md §3) with the tile as the carried object.
 */
export function MaakHetWoordAf({ lesson, onComplete, onQuit }: Props) {
  const pair: SpellingPair | undefined = lesson.spellingPair
    ? getSpellingPair(lesson.spellingPair)
    : undefined

  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  /** Distinct words graded so far — the pips. A ref alone would not repaint them. */
  const [done, setDone] = useState(0)
  const [ready, setReady] = useState(false)
  const [beat, setBeat] = useState<Beat>('deal')
  const [strategy, setStrategy] = useState<Strategy>(null)
  /** The tile under her finger: which one, and how far it has travelled. */
  const [carry, setCarry] = useState<{ tile: number; x: number; y: number } | null>(null)
  /** The tile's centre is inside the gap's rect grown by GAP_SLACK_PX — the gap lights up. */
  const [targeted, setTargeted] = useState(false)
  /** A tile travelling into the gap on its own: a tap, or the correction after a miss. */
  const [sliding, setSliding] = useState<{
    tile: number
    x: number
    y: number
    scale: number
  } | null>(null)
  /** A tile springing back to its slot after a release that did not commit. */
  const [returning, setReturning] = useState<number | null>(null)
  /** The wrong tile bumping the gap — CSS only, and the tile never enters. */
  const [bumping, setBumping] = useState<number | null>(null)
  /** The ending is in the gap and the word is whole. Always the *correct* ending. */
  const [landed, setLanded] = useState(false)
  const [flashing, setFlashing] = useState(false)
  /** 0 = idle; any other value keys a running Bliksemsprint so a re-trigger restarts it. */
  const [burst, setBurst] = useState(0)

  /**
   * Read once at mount, like Hardop lezen and Flitsen: reduced motion decides JS branches
   * here — no travel, no confetti, no lift scale — not only which CSS applies (§8).
   */
  const [reducedMotion] = useState(prefersReducedMotion)

  /** One entry per distinct word, recorded on its **first** attempt only (§5). */
  const results = useRef<SpellingResult[]>([])
  /** Words already put back into the queue once. A second miss moves on (§5). */
  const requeued = useRef<Set<string>>(new Set())
  /** The beat, readable synchronously — the guard `phaseRef` is in Hardop lezen. */
  const beatRef = useRef<Beat>('deal')
  const busy = useRef(false)
  const cancelled = useRef(false)
  const streak = useRef(0)
  /** Every timer this component starts, so one unmount clears all of them. */
  const timers = useRef<number[]>([])

  const activePointerId = useRef<number | null>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  /** Points, not just a start and an end, because a flick is a fact about the last few. */
  const samples = useRef<SwipeSample[]>([])
  /** Which tile this gesture picked up, and whether it has left its slot yet. */
  const heldTile = useRef<number | null>(null)
  const lifted = useRef(false)
  /**
   * The gap and the two tiles as they were when she picked one up. Measured once per
   * gesture rather than per move: the card lifts a touch while a tile is over the gap, and
   * re-measuring mid-drag would make the target move under her finger.
   */
  const targets = useRef<{ gap: Box; tiles: Box[] } | null>(null)

  const gapRef = useRef<HTMLSpanElement>(null)
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const cardRef = useRef<HTMLDivElement>(null)
  /** Choosing a tile from the keyboard — the same travel a tap gets, not a shortcut past it. */
  const chooseRef = useRef<(tile: number) => void>(() => {})
  const strategyRef = useRef<() => void>(() => {})
  const replayRef = useRef<() => void>(() => {})

  function later(ms: number, fn: () => void): void {
    timers.current.push(window.setTimeout(fn, ms))
  }

  function clearTimers(): void {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }

  // The commit chain awaits the correction and the word being spoken. Tapping ✕ inside that
  // gap must not credit the lesson afterwards — the same hole Flitsen and Hardop lezen had.
  // `quit()` below is the primary fix (it cancels synchronously on the click, before
  // navigation even starts); this is the backstop for any other unmount (StrictMode's dev
  // remount, a future caller that navigates away without going through `quit()`).
  useEffect(() => {
    // Reset on mount as well as set on unmount — StrictMode's mount → cleanup → remount in
    // dev would otherwise latch this true and freeze the game on its first card.
    cancelled.current = false
    return () => {
      cancelled.current = true
      stopNarration()
      clearTimers()
    }
  }, [])

  useEffect(() => {
    // A `/proberen` try-round deals the **drafts**: a path node waits for `reviewed: true`
    // (§6 rule 5), and until Arjan has been through the seed list this entry is the only
    // way to play the game at all — which is exactly what it is for (§12.1).
    const drafts = lesson.unitId === TRY_UNIT_ID ? allSpellingWords : undefined
    const ids = buildSpellingRound(
      lesson,
      useProgress.getState().spellingStats,
      undefined,
      drafts,
    )
    setQueue(ids)
    setIndex(0)
    setReady(true)
    // The round is dealt once. `spellingStats` is subscribed for the selector's weighting
    // and changes when the round is credited, which must not re-deal the deck under her.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id])

  const currentId: string | undefined = queue[index]
  const current: SpellingWord | undefined =
    pair && currentId ? getSpellingWord(pair.id, currentId) : undefined
  /** The round's length in pips: distinct words, so a re-queued card adds no pip (§5). */
  const total = new Set(queue).size

  function goBeat(next: Beat): void {
    beatRef.current = next
    setBeat(next)
  }

  /**
   * Cancel synchronously, on the click itself — not only in the unmount effect's cleanup,
   * which does not run until react-router actually unmounts this component. Stopping the
   * narration here is what keeps her from still being read to on the path screen.
   */
  function quit(): void {
    cancelled.current = true
    stopNarration()
    clearTimers()
    onQuit()
  }

  // A new card: deal it in, speak the word, and open for an answer. The word is spoken
  // *while* the card is already answerable — there is no hearing gate (§4).
  useEffect(() => {
    if (!currentId || !current) return
    goBeat('deal')
    setStrategy(null)
    setCarry(null)
    setSliding(null)
    setReturning(null)
    setBumping(null)
    setLanded(false)
    setFlashing(false)
    setTargeted(false)
    playEffect('swish')
    const dealTimer = window.setTimeout(() => {
      goBeat('choose')
      void speakWord()
    }, DEAL_MS)
    return () => window.clearTimeout(dealTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, index])

  useLayoutEffect(() => {
    chooseRef.current = (tile) => slideIn(tile)
    strategyRef.current = () => void tapStrategy()
    replayRef.current = () => void speakWord()
  })

  // Keyboard play, for building and reviewing on a desktop. Left/right follow the tiles'
  // fixed order, so the keys and the tiles can never disagree about which is which (§6).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ') {
        e.preventDefault()
        replayRef.current()
        return
      }
      if (e.key === 'l' || e.key === 'L') {
        strategyRef.current()
        return
      }
      if (beatRef.current !== 'choose') return
      // Through the same slide a tap takes: the tile visibly travelling into the gap is
      // the demonstration, and a keyboard round should not be a different game.
      if (e.key === 'ArrowLeft') chooseRef.current(0)
      if (e.key === 'ArrowRight') chooseRef.current(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function speakWord(): Promise<void> {
    if (!current) return
    await playWord(current.wordId, getWord(current.wordId).text)
  }

  /**
   * The strategy badge (§4). Free, and never scored — it may be used before or after
   * choosing, as often as she likes.
   *
   * For a `langer` pair it is two steps: Frida asks her to make the word longer and waits,
   * because RID's move is that *she* produces the longer word; only the second tap (or
   * LANGER_REVEAL_MS of not tapping) shows and speaks it. A `regel` pair has nothing for her
   * to produce, so one tap tells her the rule.
   */
  async function tapStrategy(): Promise<void> {
    if (!pair || !current) return
    playEffect('pop')
    if (pair.strategy === 'regel' || strategy === 'prompt') return void openReveal()
    if (strategy === 'reveal') return void speakReveal()

    setStrategy('prompt')
    stopNarration()
    await playSpelling(regelClipId(pair.id), [strategyLine(pair)])
    if (cancelled.current) return
    // She may have tapped again while it was speaking, which already revealed it.
    later(LANGER_REVEAL_MS, () => {
      if (cancelled.current) return
      setStrategy((s) => (s === 'prompt' ? 'reveal' : s))
    })
  }

  function openReveal(): void {
    setStrategy('reveal')
    void speakReveal()
  }

  /** What the reveal step says out loud: the longer form, or the rule when there is none. */
  async function speakReveal(): Promise<void> {
    if (!pair || !current) return
    stopNarration()
    if (current.langer) await playSpelling(langerClipId(current.wordId), [current.langer])
    else await playSpelling(regelClipId(pair.id), [pair.rule])
  }

  // ---- the gesture: the tile is a carried object (docs/flitsen-swipe.md §3) ----

  /**
   * Handlers live on the tile **row**, not on a tile: a tile re-renders mid-drag (it is
   * carrying an inline transform), and a captured element that re-renders can drop the
   * capture halfway across the card. The row is stable for the whole gesture.
   */
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    if (beatRef.current !== 'choose' || busy.current || sliding) return
    // A pointer is already driving this drag — an incidental second touch (a resting palm
    // on a tablet) must not steal it and reset the gesture.
    if (activePointerId.current !== null) return
    const tileEl = (e.target as Element).closest('.spel-tile')
    if (!tileEl) return
    const tile = tileRefs.current.findIndex((el) => el === tileEl)
    if (tile < 0) return

    activePointerId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    heldTile.current = tile
    lifted.current = false
    startX.current = e.clientX
    startY.current = e.clientY
    samples.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }]
    setReturning(null)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    if (e.pointerId !== activePointerId.current) return
    const tile = heldTile.current
    if (tile === null) return
    const s = samples.current
    s.push({ t: performance.now(), x: e.clientX, y: e.clientY })
    // Cap the buffer, but drop from the *second* slot: resolveDrag measures total distance
    // from the first sample, so evicting the origin would make a long slow carry read as a
    // short one. The tail is what the flick velocity needs, and that is what survives.
    if (s.length > MAX_SAMPLES) s.splice(1, 1)

    const x = e.clientX - startX.current
    const y = e.clientY - startY.current
    if (!lifted.current) {
      if (Math.hypot(x, y) < LIFT_SLOP_PX) return // still within a tap's wobble
      lifted.current = true
      targets.current = measureTargets()
      haptic(4)
    }
    setCarry({ tile, x, y })
    setTargeted(isOverGap(tile, x, y))
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>): void {
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    const tile = heldTile.current
    heldTile.current = null
    const wasLifted = lifted.current
    const drag = samples.current
    samples.current = []
    setCarry(null)
    setTargeted(false)
    if (tile === null) return
    // Measured off the release event, not off `carry`: that is render state, and a fast
    // drag can put the last move and the release in one task, leaving the closure a few
    // pixels behind where her finger actually let go.
    const x = e.clientX - startX.current
    const y = e.clientY - startY.current

    // A tap: the tile slides itself into the gap and commits. Never the lesser option —
    // there is no taught tap here as in Hardop lezen, because the tile visibly travelling
    // *is* the demonstration, and it happens every single time (§3).
    if (!wasLifted) return void slideIn(tile)

    if (isOverGap(tile, x, y)) return void commit(tile)
    // A flick towards the word. Both tiles sit below the card, so "up" can only mean "into
    // the word"; a mostly-sideways flick means nothing here and springs back.
    if (resolveDrag(drag, 'y') === -1) return void slideIn(tile)
    springBack(tile)
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>): void {
    // A gesture the browser takes over (an edge back-swipe, a scroll, an incoming call) is
    // not a finished carry: the tile goes back, whatever distance it had reached.
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    const tile = heldTile.current
    heldTile.current = null
    samples.current = []
    setCarry(null)
    setTargeted(false)
    if (lifted.current && tile !== null) springBack(tile)
  }

  /** The gap and the tiles, as real rects — so the target is right on every viewport. */
  function measureTargets(): { gap: Box; tiles: Box[] } | null {
    const gapEl = gapRef.current
    if (!gapEl) return null
    const tiles = tileRefs.current.map((el) => (el ? boxOf(el) : null))
    if (tiles.some((t) => t === null)) return null
    return { gap: boxOf(gapEl), tiles: tiles as Box[] }
  }

  function isOverGap(tile: number, x: number, y: number): boolean {
    const t = targets.current
    if (!t) return false
    const at = t.tiles[tile]
    return overGap({ ...at, left: at.left + x, top: at.top + y }, t.gap, GAP_SLACK_PX)
  }

  function springBack(tile: number): void {
    setReturning(tile)
    later(RETURN_MS, () => setReturning((r) => (r === tile ? null : r)))
  }

  /**
   * The tile travels into the gap on its own and then commits.
   *
   * The travel is an inline end-state plus a CSS transition, not a JS animation: the
   * quit-mid-animation suite freezes the page's clock right here, and CSS keeps running
   * under a fake clock where `setTimeout` does not. What is timed in JS is only *state*.
   */
  function slideIn(tile: number): void {
    if (reducedMotion) return void commit(tile)
    const t = measureTargets()
    if (!t) return void commit(tile)
    setSliding(flightTo(t.gap, t.tiles[tile], tile))
    later(SLIDE_MS, () => {
      if (cancelled.current) return
      void commit(tile)
    })
  }

  async function commit(tile: number): Promise<void> {
    if (beatRef.current !== 'choose' || busy.current || !pair || !current) return
    busy.current = true
    try {
      await runCommit(tile, pair, current)
    } finally {
      // Nothing in the chain should be able to leave the card permanently unresponsive;
      // playWord and playSpelling always resolve, and this is the backstop regardless.
      busy.current = false
    }
  }

  async function runCommit(
    tile: number,
    pair: SpellingPair,
    current: SpellingWord,
  ): Promise<void> {
    const correct = pair.options[tile] === current.ending
    const first = !results.current.some((r) => r.wordId === current.wordId)
    // Only the first attempt is scored. A word she missed comes back three cards later with
    // the answer already shown; that second pass is the teaching, not a second chance (§5).
    if (first) {
      results.current.push({ wordId: current.wordId, correct })
      setDone(results.current.length)
    }

    goBeat(correct ? 'right' : 'wrong')
    setSliding(null)

    if (correct) {
      setLanded(true)
      playEffect('ding')
      haptic(12)
      if (first) {
        streak.current += 1
        // Fire on *reaching* the streak, not on every multiple of it.
        if (streak.current === STREAK_FOR_BURST) setBurst((b) => b + 1)
      }
      confettiPuff()
      await speakWord()
      if (cancelled.current) return
      await wait(NEXT_RIGHT_MS)
      if (cancelled.current) return
      return advance(queue)
    }

    // ---- the miss (§2) ----
    streak.current = 0
    playEffect('fart')
    haptic([10, 40, 10])
    // The wrong tile bumps the gap and comes back. It never enters, so `hont` is never
    // formed — the one rule the whole design is built around.
    setBumping(tile)
    setFlashing(true)
    later(FLASH_MS, () => setFlashing(false))
    await wait(BUMP_MS)
    if (cancelled.current) return
    setBumping(null)

    // Then the *correct* tile slides in on its own and the word turns green.
    const rightTile = pair.options.indexOf(current.ending)
    if (!reducedMotion && rightTile >= 0) {
      const t = measureTargets()
      if (t) {
        setSliding(flightTo(t.gap, t.tiles[rightTile], rightTile))
        await wait(SLIDE_MS)
        if (cancelled.current) return
      }
    }
    setSliding(null)
    setLanded(true)

    // The strategy opens by itself, straight at the reveal step: a correction is not the
    // moment to quiz her (§4).
    setStrategy('reveal')
    await playWord(current.wordId, getWord(current.wordId).text)
    if (cancelled.current) return
    if (current.langer) {
      await playSpelling(langerClipId(current.wordId), [current.langer])
      if (cancelled.current) return
    }

    // One more go, three cards later — and only ever one (§5).
    let nextQueue = queue
    if (first && !requeued.current.has(current.wordId)) {
      requeued.current.add(current.wordId)
      nextQueue = requeue(queue, index, current.wordId)
      setQueue(nextQueue)
    }

    await wait(NEXT_WRONG_MS)
    if (cancelled.current) return
    // The *grown* queue, not this render's: re-queueing the round's last word appends it,
    // and asking the stale queue whether there is a card left would end the round on the
    // very card the miss just added.
    advance(nextQueue)
  }

  /** The "balloons" of §2: a small puff of round pieces from the card. */
  function confettiPuff(): void {
    if (reducedMotion) return
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    confetti({
      particleCount: 14,
      spread: 55,
      startVelocity: 26,
      gravity: 0.9,
      ticks: 90,
      shapes: ['circle'],
      origin: {
        x: (r.left + r.width / 2) / window.innerWidth,
        y: (r.top + r.height / 2) / window.innerHeight,
      },
      colors: ['#2FA79B', '#F7C531', '#F5A03C'],
    })
  }

  function advance(from: string[]): void {
    // A plain call, not inside setIndex's updater: calling onComplete (which updates
    // GameScreen's state) from inside a functional setState update triggers React's
    // "Cannot update a component while rendering a different component" warning.
    if (index >= from.length - 1) {
      // The board is deliberately left up for the closing beat rather than emptied, so she
      // sees the finished word for a moment instead of a blank screen.
      later(END_PAUSE_MS, () => {
        if (cancelled.current) return
        onComplete({ answers: [], spellingResults: results.current })
      })
      return
    }
    setIndex((i) => i + 1)
  }

  // ---- rendering ----

  if (ready && (!pair || queue.length === 0)) {
    // Nothing reviewed yet, or a node whose pair has gone from the file — the reviewed gate
    // is allowed to leave this node with nothing to deal (§6 rule 5).
    return (
      <div className="game-screen">
        <div className="game-header">
          <button className="quit" aria-label="Stoppen" onClick={quit}>
            ✕
          </button>
        </div>
        <div className="game-stage">
          <h2>Nog geen woorden om te spellen</h2>
          <button className="btn-primary" onClick={quit}>
            Terug naar het pad
          </button>
        </div>
      </div>
    )
  }

  if (!pair || !current) return null

  const coach = COACH[beat]
  const bubble =
    strategy === 'prompt'
      ? strategyLine(pair)
      : strategy === 'reveal'
        ? revealText(pair, current)
        : coach.text

  // Pulled out of the narrowed values above: a hoisted function declaration is treated as
  // callable before the `if (!pair || !current) return null` that narrows them, so it does
  // not see the narrowing.
  const rightEnding = current.ending
  const options = pair.options

  /** Where a tile is drawn, and how it is behaving. */
  function tileStyle(i: number): CSSProperties {
    if (carry?.tile === i) {
      return {
        transform: `translate(${carry.x}px, ${carry.y}px) scale(${reducedMotion ? 1 : 1.08})`,
        transition: 'none',
      }
    }
    if (sliding?.tile === i) {
      return {
        transform: `translate(${sliding.x}px, ${sliding.y}px) scale(${sliding.scale})`,
      }
    }
    return {}
  }

  function tileClass(i: number): string {
    return [
      'spel-tile',
      carry?.tile === i ? 'carrying' : '',
      sliding?.tile === i ? 'sliding' : '',
      returning === i ? 'returning' : '',
      bumping === i ? 'bumping' : '',
      // The tile that landed is spent; it stays out of the row rather than snapping back
      // into it behind the finished word.
      landed && options[i] === rightEnding ? 'spent' : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  return (
    <div className="game-screen spel-screen" data-beat={beat} onPointerDown={resumeAudio}>
      <div className="game-header">
        <button className="quit" aria-label="Stoppen" onClick={quit}>
          ✕
        </button>
        <div
          className="round-pips"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Woorden gedaan"
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`pip${i < done ? ' pip-done' : i === done ? ' pip-now' : ''}`}
            />
          ))}
        </div>
      </div>

      <div className="game-stage spel-stage">
        <div className="coach">
          <Frida expression={coach.expr} className="coach-frida" alt="" />
          <p className="coach-bubble">{bubble}</p>
        </div>

        <div
          ref={cardRef}
          className={[
            'spel-card',
            beat === 'deal' ? 'dealing' : '',
            landed ? 'landed' : '',
            flashing ? 'flashing' : '',
            targeted ? 'lifted' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="word-text">
            <span className="stem">{current.stem}</span>
            {/* The gap is as wide as the pair's widest option, so the word does not jump
                sideways when the tile lands in it (§8). That width is held by a *pseudo*-
                element (`.gap::before`, content from `--gap-ghost`) rather than by a hidden
                span: nothing of it reaches `textContent`, so "the wrong full spelling is
                never on screen" is a property the DOM itself can be asked about. */}
            <span
              ref={gapRef}
              className={`gap${targeted ? ' targeted' : ''}${landed ? ' filled' : ''}`}
              style={{ '--gap-ghost': `'${widestOption(pair)}'` } as CSSProperties}
            >
              <span className="gap-letter">{landed ? current.ending : ''}</span>
            </span>
          </span>

          {/* The langer form appears under the stem at the reveal step (§4). */}
          {strategy === 'reveal' && current.langer && (
            <span className="spel-langer">{current.langer}</span>
          )}

          <button
            className="reveal-btn"
            aria-label="Nog eens"
            onClick={() => void speakWord()}
            onPointerDown={(e) => {
              resumeAudio()
              e.stopPropagation()
            }}
          >
            🔊
          </button>

          <button
            className={`strategy-btn${strategy ? ' open' : ''}`}
            // The label matches what the button says, not the pair's own title: a button
            // reading "Maak langer" that announces itself as "d of t?" is two different
            // controls depending on whether you can see it.
            aria-label={pair.strategy === 'langer' ? 'Maak het woord langer' : pair.title}
            onClick={() => void tapStrategy()}
            onPointerDown={(e) => {
              resumeAudio()
              e.stopPropagation()
            }}
          >
            {pair.strategy === 'langer' ? 'Maak langer' : pair.title} ↗
          </button>
        </div>

        {/* Pointer capture on the row, not on a tile — see onPointerDown. */}
        <div
          className="spel-tiles"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {pair.options.map((option, i) => (
            <button
              key={option}
              ref={(el) => {
                tileRefs.current[i] = el
              }}
              className={tileClass(i)}
              style={tileStyle(i)}
              // The pointer handlers above own the tap. A pointer tap is committed in
              // onPointerUp, and the click that follows it is ignored here: with the
              // pointer captured on the row, the browser retargets that click to the row,
              // and where it did reach the button it would commit a second time. Enter or
              // Space on a focused tile is a click with detail 0 — that one is hers.
              onClick={(e) => {
                if (e.detail === 0) slideIn(i)
              }}
              disabled={beat !== 'choose'}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {burst > 0 && <Bliksemsprint key={burst} onDone={() => setBurst(0)} />}
    </div>
  )
}

/**
 * A tile's journey from its slot into the gap: centre to centre, shrinking to the gap's
 * size on the way.
 *
 * The shrink is not decoration. A tile is 96×80 and the gap is about a letter wide, so a
 * tile that travelled at full size would arrive sitting *over* the word — covering the very
 * thing the journey is meant to complete, and, after a miss, covering the correction she is
 * being shown. Scaling it into the hole is what makes it read as clicking into place.
 */
function flightTo(gap: Box, from: Box, tile: number) {
  return {
    tile,
    x: Math.round(gap.left + gap.width / 2 - (from.left + from.width / 2)),
    y: Math.round(gap.top + gap.height / 2 - (from.top + from.height / 2)),
    scale: Math.min(1, gap.width / from.width, gap.height / from.height),
  }
}

/** The pair's widest option — what the gap has to be as wide as (§8). */
function widestOption(pair: SpellingPair): string {
  return pair.options.reduce((a, b) => (b.length > a.length ? b : a), pair.options[0] ?? '')
}

/**
 * What the bubble says at the reveal step.
 *
 * For a `langer` pair the longer form is already printed under the stem, so the bubble
 * carries the pair's written rule — the reminder behind the question it just asked. For a
 * `regel` pair the rule *is* the reveal, and a `gt` verb adds its own `ik`-form, which is
 * the half of the rule that applies to the word actually on the card (§4).
 */
function revealText(pair: SpellingPair, word: SpellingWord): string {
  if (pair.strategy === 'langer') return pair.rule
  return word.langer ? `${pair.rule} Dit woord: ${word.langer}.` : pair.rule
}
