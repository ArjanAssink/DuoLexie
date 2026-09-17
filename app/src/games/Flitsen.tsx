import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { Lesson } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { buildFlitsDeck } from '../engine/exerciseSelector'
import { categoryOf } from '../curriculum'
import { haptic } from '../audio/audio'
import { resolveDrag, type SwipeSample } from './swipe'
import { prefersReducedMotion } from '../motion'

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

/** The tap flight, matching @keyframes kkFly. */
const FLY_MS = 420
/** A released card travelling the rest of the way to the discard pile (.kk-landing). */
const LAND_MS = 260
/** A released card sliding back onto the deck (.kk-returning). */
const RETURN_MS = 320
/** Movement under this is still a tap; past it the card lifts off the deck. */
const LIFT_SLOP_PX = 8
/**
 * Pointer samples kept per gesture. Enough tail for the flick velocity without letting a
 * long, slow carry grow unbounded — same figure and same eviction rule as Hardop lezen.
 */
const MAX_SAMPLES = 20

/**
 * A card that is not on either stack. `flying` is the tap flight (CSS keyframes); the
 * other three are the drag: `held` under her finger, then `landing` on the discard pile or
 * `returning` to the deck. `x`/`y` are the offset from the deck, in px — for `held` that is
 * her finger's travel, for `landing` the gap between the stacks, for `returning` zero.
 */
type AirMode = 'flying' | 'held' | 'landing' | 'returning'
interface AirCard {
  id: number
  sound: string
  mode: AirMode
  x: number
  y: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Flitsen — ported from CardFlash (github.com/ArjanAssink/CardFlash): tap the
 * deck, the top card flips over and flies to the discard pile. Pure exposure,
 * no grading, no narration — replaces Klankenjacht's tap-the-right-tile
 * drill, which wasn't landing as fun. Restyled to DuoLexie's palette/tokens;
 * the animation is CSS keyframes instead of a JS rAF loop. (Formerly called
 * "Klankkaarten" — the RID-practice speed drill previously named "Flitsen"
 * is now "Tijdrit".)
 *
 * The card can also be **carried**: pick it up off the deck and it sticks to the finger,
 * turning over in proportion to how far it has travelled towards the discard pile —
 * face-down on the deck, edge-on halfway, face-up over the other stack. Let go past the
 * midpoint (or flick it) and it lands; let go short and it slides back. The tap is
 * untouched: it is the fast route, and the e2e suite drives it. docs/flitsen-swipe.md.
 */
export function Flitsen({ lesson, onComplete, onQuit }: Props) {
  const [deck, setDeck] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [discardTop, setDiscardTop] = useState<string | null>(null)
  const [air, setAir] = useState<AirCard[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [dx, setDx] = useState(0)
  const [timerStarted, setTimerStarted] = useState(false)
  const inFlight = useRef(0)
  const flyId = useRef(0)
  const finished = useRef(false)
  const cancelled = useRef(false)
  const flightTimers = useRef<number[]>([])

  /**
   * The one pointer this drag belongs to. A second finger resting on the deck must not
   * steal the gesture or reset its origin — the same guard Hardop lezen carries.
   */
  const activePointerId = useRef<number | null>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  /** Points, not just a start and an end, because a flick is a fact about the last few. */
  const samples = useRef<SwipeSample[]>([])
  /** The pointer has moved past LIFT_SLOP_PX: this is a drag, not a tap. */
  const lifted = useRef(false)
  /** The air card under her finger, if any. */
  const heldId = useRef<number | null>(null)
  /** Read once at mount, like Hardop lezen: it decides a JS branch, not only which CSS applies. */
  const [reducedMotion] = useState(prefersReducedMotion)

  const arenaRef = useRef<HTMLDivElement>(null)
  const deckRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)

  // Tapping ✕ during a card's flight used to leave the flight's timeout pending: it
  // fired after unmount and still called onComplete, so quitting credited gems/XP,
  // marked the lesson done and (since A2) logged a phantom SessionResult that would
  // sync to the cloud. `quit()` above is the primary fix (cancels synchronously on
  // the click, before navigation even starts); this cleanup is the backstop for any
  // other way the component unmounts (StrictMode's dev remount, a future caller that
  // navigates away without going through `quit()`).
  useEffect(() => {
    // Reset on mount, not just set on unmount: StrictMode runs mount → cleanup →
    // remount in dev, so a cleanup-only flag latches true right after the first mount
    // and no flight ever completes again.
    cancelled.current = false
    return () => {
      cancelled.current = true
      for (const t of flightTimers.current) window.clearTimeout(t)
      flightTimers.current = []
    }
  }, [])

  useEffect(() => {
    setDeck(buildFlitsDeck(lesson))
    setIdx(0)
    setDiscardTop(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id])

  // Re-run when the arena appears, not only at mount: the component renders nothing until
  // the deck is built, so at mount there is no arena to measure and `dx` stayed 0 — the
  // tap flight then flipped in place at its static position between the stacks, and the
  // carry (which divides by the gap) had nothing to work with. Found building the carry.
  const arenaMounted = deck.length > 0
  useLayoutEffect(() => {
    if (!arenaMounted) return
    function measure() {
      const arena = arenaRef.current
      const deckEl = deckRef.current
      const discardEl = discardRef.current
      if (!arena || !deckEl || !discardEl) return
      const a = arena.getBoundingClientRect()
      const d = deckEl.getBoundingClientRect()
      const t = discardEl.getBoundingClientRect()
      // iOS Safari fires `resize` often (its address bar hides/shows on scroll) — skip the
      // state update (and the re-render it triggers, mid-flip-animation) when nothing moved.
      const next = t.left - d.left
      setDx((prev) => (Math.abs(prev - next) < 0.5 ? prev : next))
      arena.style.setProperty('--kk-fly-left', `${d.left - a.left}px`)
      arena.style.setProperty('--kk-fly-top', `${d.top - a.top}px`)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (arenaRef.current) ro.observe(arenaRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [arenaMounted])

  useEffect(() => {
    if (!timerStarted) return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [timerStarted])

  /** A timer `quit()` and the unmount cleanup can cancel, like the flight's always was. */
  function schedule(fn: () => void, ms: number) {
    const timer = window.setTimeout(() => {
      if (cancelled.current) return
      fn()
    }, ms)
    flightTimers.current.push(timer)
  }

  /**
   * A card arrives on the discard pile — from a tap flight or from a carry, the same
   * bookkeeping: it leaves the air, becomes the top of the pile, and if it was the last
   * one and nothing else is still travelling, the round is over.
   */
  function settle(id: number, sound: string, isLast: boolean) {
    setAir((a) => a.filter((c) => c.id !== id))
    setDiscardTop(sound)
    inFlight.current--
    if (isLast && inFlight.current === 0 && !finished.current) {
      finished.current = true
      onComplete({ answers: [] })
    }
  }

  function flip() {
    if (idx >= deck.length) return
    // The card on top of the deck is in her hand; a tap (a second finger, say) must not
    // also send a copy of it flying.
    if (heldId.current !== null) return
    if (!timerStarted) setTimerStarted(true)

    const sound = deck[idx]
    const isLast = idx + 1 >= deck.length
    setIdx((i) => i + 1)
    inFlight.current++
    haptic(10)

    const id = flyId.current++
    setAir((a) => [...a, { id, sound, mode: 'flying', x: 0, y: 0 }])
    schedule(() => settle(id, sound, isLast), FLY_MS)
  }

  /**
   * Keyboard only. A pointer tap is flipped in onPointerUp, and the click that follows it
   * is ignored here: with the pointer captured on the stack, the browser retargets that
   * click to the stack (the common ancestor of where the pointer went down and where it
   * was released), so it does not reliably reach the button anyway — and where it did, it
   * would flip a second card. Enter/Space on the focused button is a click with detail 0.
   */
  function onDeckClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (e.detail === 0) flip()
  }

  // The drag. Handlers and pointer capture live on the deck *stack*, not on the deck
  // button: lifting the last card leaves the deck showing empty, which unmounts the
  // button, and a button that owned the capture would end the gesture halfway across.
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerId.current !== null || idx >= deck.length) return
    activePointerId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    startX.current = e.clientX
    startY.current = e.clientY
    samples.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }]
    lifted.current = false
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerId !== activePointerId.current) return
    const s = samples.current
    s.push({ t: performance.now(), x: e.clientX, y: e.clientY })
    // Cap the buffer, but drop from the *second* slot: resolveDrag measures total distance
    // from the first sample, so evicting the origin would make a long slow carry read as a
    // short one. The tail is what the flick velocity needs, and that is what survives.
    if (s.length > MAX_SAMPLES) s.splice(1, 1)
    const x = e.clientX - startX.current
    const y = e.clientY - startY.current
    if (!lifted.current) {
      // still within a tap's wobble
      if (Math.hypot(x, y) < LIFT_SLOP_PX) return
      lifted.current = true
      if (!timerStarted) setTimerStarted(true)
      const id = flyId.current++
      heldId.current = id
      const sound = deck[idx]
      setAir((a) => [...a, { id, sound, mode: 'held', x, y }])
      haptic(4)
      return
    }
    const id = heldId.current
    setAir((a) => a.map((c) => (c.id === id ? { ...c, x, y } : c)))
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    // A tap: nothing lifted, so the card flips and flies as it always has.
    if (!lifted.current) {
      samples.current = []
      flip()
      return
    }
    // Half the gap between the stacks: the card's centre is past the midpoint, so it is on
    // the other pile now. Towards the discard pile only — a flick the other way slides back.
    const sign = resolveDrag(samples.current, 'x', Math.abs(dx) / 2)
    samples.current = []
    const id = heldId.current
    heldId.current = null
    if (id === null) return
    if (sign !== 0 && sign === Math.sign(dx)) land(id)
    else returnToDeck(id)
  }
  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    // A gesture the browser takes over (scroll, edge swipe, an incoming call) is not a
    // finished carry: the card goes back, whatever distance it had reached.
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    samples.current = []
    const id = heldId.current
    heldId.current = null
    if (!lifted.current || id === null) return
    returnToDeck(id)
  }

  function land(id: number) {
    const card = air.find((c) => c.id === id)
    if (!card) return
    // Read at release, not at lift: the deck is what it is *now*.
    const isLast = idx + 1 >= deck.length
    setIdx((i) => i + 1)
    inFlight.current++
    haptic(10)
    setAir((a) => a.map((c) => (c.id === id ? { ...c, mode: 'landing', x: dx, y: 0 } : c)))
    schedule(() => settle(id, card.sound, isLast), LAND_MS)
  }

  function returnToDeck(id: number) {
    setAir((a) => a.map((c) => (c.id === id ? { ...c, mode: 'returning', x: 0, y: 0 } : c)))
    schedule(() => setAir((a) => a.filter((c) => c.id !== id)), RETURN_MS)
  }

  if (deck.length === 0) return null

  const remaining = deck.length - idx
  const done = idx
  const holding = air.some((c) => c.mode === 'held')
  // The card in her hand is off the deck, so the deck shows one fewer until it either lands
  // or comes back. `idx` itself only moves on a landing.
  const deckShown = remaining - (holding ? 1 : 0)
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const deckGhostShow = Math.min(Math.max(deckShown - 1, 0), 3)
  const discardGhostShow = Math.min(done, 2)

  // Cancel synchronously, on the click itself — not just in the unmount effect's
  // cleanup. That cleanup only runs once react-router's navigate() actually
  // unmounts this component, which is not guaranteed to happen before a flight's
  // setTimeout that's already due; quitting a hair before a flight's natural
  // 420ms deadline could otherwise still race it. This can't lose that race: it's
  // the very first thing that runs on the click that starts the navigation.
  function quit() {
    cancelled.current = true
    for (const t of flightTimers.current) window.clearTimeout(t)
    flightTimers.current = []
    onQuit()
  }

  /**
   * Where an air card is and how far it has turned. The tap flight is all CSS; the drag
   * modes are inline transforms — `held` follows the finger with no transition, `landing`
   * and `returning` set the end state and let the class's transition carry it there from
   * wherever the finger left it.
   */
  function airStyles(c: AirCard): { outer: CSSProperties; inner: CSSProperties } {
    const base: CSSProperties = {
      left: 'var(--kk-fly-left)',
      top: 'var(--kk-fly-top)',
      ['--fly-dx' as string]: `${dx}px`,
    }
    if (c.mode === 'flying') return { outer: base, inner: {} }
    // Face-down on the deck, edge-on at the midpoint, face-up over the discard pile.
    const progress =
      c.mode === 'landing' ? 1 : c.mode === 'returning' || dx === 0 ? 0 : clamp(c.x / dx, 0, 1)
    // A carried card tilts a little with the direction it is being carried and sits a
    // touch larger, so it reads as lifted rather than slid. Not under reduced motion.
    const carried = c.mode === 'held' && !reducedMotion
    const tilt = carried ? clamp(c.x / 40, -6, 6) : 0
    const scale = carried ? 1.04 : 1
    return {
      outer: {
        ...base,
        transform: `translate(${c.x}px, ${c.y}px) rotate(${tilt}deg) scale(${scale})`,
      },
      inner: { transform: `rotateY(${progress * 180}deg)` },
    }
  }

  return (
    <div className="game-screen">
      <div className="game-header">
        <button className="quit" onClick={quit}>
          ✕
        </button>
        <div className="progress-track">
          <div className="progress-fill" style={{ transform: `scaleX(${done / deck.length})` }} />
        </div>
        <div className="timer-big" style={{ color: 'var(--teal)' }}>
          {fmt(elapsed)}
        </div>
      </div>
      <div className="game-stage">
        <h2>
          {done === 0
            ? 'Tik of veeg de kaart!'
            : remaining === 0
              ? `Alle ${deck.length} kaarten omgedraaid!`
              : `${done} van ${deck.length} omgedraaid`}
        </h2>
        <div className="kk-arena" ref={arenaRef}>
          <div className="kk-stack-wrap">
            <div
              className={`kk-stack kk-deck${holding ? ' holding' : ''}`}
              ref={deckRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`kk-ghost kk-ghost-deck kk-g${i + 1}`}
                  style={{ opacity: i < deckGhostShow ? undefined : 0 }}
                />
              ))}
              {deckShown > 0 ? (
                <button className="kk-face kk-face-back" onClick={onDeckClick} aria-label="Draai een kaart om">
                  <span className="kk-star">⭐</span>
                  <span className="kk-brand">Flitsen</span>
                  <span className="kk-count">{deckShown}</span>
                </button>
              ) : (
                <div className="kk-empty">✓ Leeg!</div>
              )}
            </div>
            <span className="kk-stack-label">Stapel ({deckShown})</span>
          </div>

          {air.map((c) => {
            const cat = categoryOf(c.sound)
            const { outer, inner } = airStyles(c)
            return (
              <div key={c.id} className={`kk-fly kk-${c.mode}`} style={outer}>
                <div className="kk-fly-inner" style={inner}>
                  <div className="kk-face kk-face-back">
                    <span className="kk-star">⭐</span>
                    <span className="kk-brand">Flitsen</span>
                  </div>
                  <div
                    className="kk-face kk-face-front"
                    style={{ background: `linear-gradient(148deg, ${cat.color1} 0%, ${cat.color2} 100%)` }}
                  >
                    <span className="kk-sound">{c.sound}</span>
                    <span className="kk-cat">{cat.name}</span>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="kk-stack-wrap">
            <div className="kk-stack" ref={discardRef}>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={`kk-ghost kk-ghost-discard kk-dg${i + 1}`}
                  style={{ opacity: i < discardGhostShow ? undefined : 0 }}
                />
              ))}
              {discardTop ? (
                <div
                  className="kk-face kk-face-front"
                  style={{
                    background: `linear-gradient(148deg, ${categoryOf(discardTop).color1} 0%, ${categoryOf(discardTop).color2} 100%)`,
                  }}
                >
                  <span className="kk-sound">{discardTop}</span>
                  <span className="kk-cat">{categoryOf(discardTop).name}</span>
                </div>
              ) : (
                <div className="kk-empty">Omgedraaid</div>
              )}
            </div>
            <span className="kk-stack-label">Omgedraaid ({done})</span>
          </div>
        </div>
        {remaining > 0 && <p className="kk-tap-hint">👆 Tik, of veeg naar de andere stapel</p>}
      </div>
    </div>
  )
}
