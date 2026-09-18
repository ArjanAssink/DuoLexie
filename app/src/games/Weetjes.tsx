import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import confetti from 'canvas-confetti'
import type { Lesson, Weetje } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { boldSegments, dealWeetjes, narrationLines, type WeetjePart } from '../weetjes'
import { useProgress } from '../state/progress'
import { haptic, playEffect, playWeetje, resumeAudio, stopNarration, utter } from '../audio/audio'
import { Frida, type FridaExpression } from '../components/Frida'
import { BookIcon } from '../components/Icons'
import { resolveSwipe, type SwipeSample } from './swipe'

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

/** The three beats every card runs through, whatever its type (docs/weetjes.md §2). */
type Beat = 'luister' | 'doe' | 'bewaar'

/** Which way a waar-niet-waar card went — games/swipe.ts's up/down, in this game's words. */
type Verdict = 'waar' | 'nietWaar'

/**
 * What a miss is answered with, on screen and out loud (§6).
 *
 * The whole line, not a decoration on one: there is no wrong answer in this game that costs
 * anything, so the beat opens by saying so and then simply states the fact. No "helaas", no
 * "jammer", and never a failure sound behind it.
 */
const GOED_GEPROBEERD = 'Goed geprobeerd!'

/**
 * How long *Verder* waits when nothing is being read aloud — auto-read off, or a browser
 * with no Dutch voice at all. Long enough that the beat is not over before she has looked at
 * it, short enough not to feel like a lock (§2, §7).
 */
const SILENT_BEAT_MS = 1500
/** Between the question and each of its options, and between the options (§6). */
const OPTION_GAP_MS = 400
/** The taught tap: the card travels the way her finger would have, before it commits. */
const DEMO_MS = 700
/** The card shrinking into the book, matching @keyframes weetjeFly. */
const FLY_MS = 450
/** The book's bounce after it catches one. */
const BUMP_MS = 260
/** Drag distance at which a label starts visibly reaching for the card. */
const TARGET_THRESHOLD = 24
/** Pointer samples kept per gesture — same bound, and same reason, as Hardop lezen. */
const MAX_SAMPLES = 20

const VERDICT_LABEL: Record<Verdict, string> = { waar: 'Waar', nietWaar: 'Niet waar' }

/** Which beat reads which part of the card aloud. */
const BEAT_PART: Record<Beat, WeetjePart> = { luister: 'fact', doe: 'doe', bewaar: 'reveal' }

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Copy with its `*asterisks*` turned into the one bold key word per sentence that §6 asks
 * for. The markup never reaches the DOM, and a sentence without a marker simply renders
 * plain — nothing here can fail loudly on a card that forgot one.
 */
function Marked({ text }: { text: string }) {
  return (
    <>
      {boldSegments(text).map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>,
      )}
    </>
  )
}

/**
 * Weetjes — hear one true thing about dyslexia, do one small thing with it, keep it.
 *
 * Not reading practice, and never scored: the node pays the same eight gems however she
 * answers (engine/reward.ts `WEETJE_GEMS`), a miss plays `pop` and opens with "Goed
 * geprobeerd!", and there is no failure sound anywhere in this game. What it is for is the
 * other half of living with dyslexia — that she is one of many, that her brain is different
 * and not worse, that people she admires have the same thing, and that she has rights and
 * tricks (docs/weetjes.md §1).
 *
 * Every card runs Luister → Doe → Bewaar and differs only in the middle beat: swipe a
 * statement up for *Waar* or down for *Niet waar* — the gesture she already knows from
 * Hardop lezen, deciding through games/swipe.ts unchanged — or tap one of three answers.
 * Each beat reads itself aloud, so the whole card is playable without reading a word.
 */
export function Weetjes({ lesson, onComplete, onQuit }: Props) {
  const collectedWeetjes = useProgress((s) => s.collectedWeetjes)
  const collectWeetje = useProgress((s) => s.collectWeetje)
  const autoRead = useProgress((s) => s.settings.autoRead)

  /**
   * The deck, dealt once at mount. Read straight out of the store rather than from the
   * subscribed value, because `collectWeetje` fires *during* the round: a deck that
   * recomputed would re-deal itself the moment she kept the first card and hand her a
   * different second one.
   */
  const [deck] = useState<Weetje[]>(() =>
    dealWeetjes(useProgress.getState().collectedWeetjes, lesson.exerciseCount),
  )
  const [index, setIndex] = useState(0)
  const [beat, setBeat] = useState<Beat>('luister')
  /** This beat has finished being read aloud (or never started) — the gate on *Verder* (§2). */
  const [beatRead, setBeatRead] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [chosen, setChosen] = useState<number | null>(null)
  const [correct, setCorrect] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  /** A tapped label is answered by showing her the swipe first; which way it is aimed. */
  const [demo, setDemo] = useState<Verdict | null>(null)
  const [flying, setFlying] = useState(false)
  const [bumped, setBumped] = useState(false)
  /** Cards kept this round, so the book's count is right the instant one lands in it. */
  const [kept, setKept] = useState<string[]>([])

  /**
   * Read once at mount: reduced motion decides JS branches here — no flight, no confetti, no
   * taught tap — not only which CSS applies (§9).
   */
  const [reducedMotion] = useState(prefersReducedMotion)

  const current: Weetje | undefined = deck[index]

  /**
   * She has left. Checked after every await: a beat is a chain of narration and timers, and
   * tapping ✕ halfway through one must not credit the round, keep a card, or go on reading
   * to a screen she is no longer looking at.
   */
  const cancelled = useRef(false)
  /** The beat, readable synchronously — the guard `phaseRef` is in Hardop lezen. */
  const beatRef = useRef<Beat>('luister')
  const startY = useRef(0)
  const samples = useRef<SwipeSample[]>([])
  const activePointerId = useRef<number | null>(null)
  /** Every timer this component starts, so unmount clears all of them at once (§9). */
  const timers = useRef<number[]>([])
  const cardRef = useRef<HTMLDivElement>(null)
  /**
   * Which narration run is the current one. A run that was interrupted — by a 🔊 tap, or by
   * the next beat — must not come back and open *Verder* for the beat that replaced it.
   */
  const narrationSeq = useRef(0)
  /** The answer, readable from inside the Bewaar chain without waiting on a re-render. */
  const correctRef = useRef(false)

  function later(ms: number, fn: () => void): void {
    timers.current.push(window.setTimeout(fn, ms))
  }

  function clearTimers(): void {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    // Reset on mount as well as set on unmount: StrictMode's mount → cleanup → remount in
    // dev would otherwise latch this true and freeze the card on its first beat.
    cancelled.current = false
    return () => {
      cancelled.current = true
      stopNarration()
      clearTimers()
    }
  }, [])

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

  /**
   * Read one beat aloud, and resolve true when it finished as the current narration.
   *
   * Never two at once: `stopNarration()` first, and a sequence number so an interrupted run
   * cannot mark the beat that replaced it as read. With auto-read off nothing plays and the
   * beat opens after SILENT_BEAT_MS instead — except when she asked for it with 🔊, which is
   * exactly what that button is for (§7).
   */
  async function narrate(part: WeetjePart, weetje: Weetje, asked = false): Promise<boolean> {
    const seq = ++narrationSeq.current
    stopNarration()
    setSpeaking(false)

    if (!autoRead && !asked) {
      await new Promise<void>((resolve) => later(SILENT_BEAT_MS, resolve))
      if (cancelled.current || narrationSeq.current !== seq) return false
      setBeatRead(true)
      return true
    }

    setSpeaking(true)
    // A miss is answered out loud before the fact is, so a child who never reads a word of
    // the card still hears that she is fine. It is spoken rather than recorded because the
    // one `<id>-reveal.mp3` clip is shared by both outcomes.
    if (part === 'reveal' && !correctRef.current) {
      await utter(GOED_GEPROBEERD, 0.9)
      if (cancelled.current || narrationSeq.current !== seq) return false
    }
    await playWeetje(`${weetje.id}-${part}`, narrationLines(weetje, part), OPTION_GAP_MS)
    if (cancelled.current || narrationSeq.current !== seq) return false
    setSpeaking(false)
    setBeatRead(true)
    return true
  }

  /** One beat: reset what belongs to it, and read it aloud. */
  useEffect(() => {
    if (!current) return
    beatRef.current = beat
    setBeatRead(false)
    setDragY(0)
    setDemo(null)
    if (beat === 'luister') {
      playEffect('swish')
      setChosen(null)
    }
    void narrate(BEAT_PART[beat], current)
    // `narrate` closes over autoRead, which cannot change mid-beat (its toggle lives on the
    // profile screen); re-running this on anything else would read the beat a second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, current?.id])

  /**
   * Once the reveal has been read, the card is hers: it shrinks into the book, the book
   * bounces, and its count goes up.
   *
   * Keyed on the beat having been *read* rather than chained onto the narration promise,
   * because that promise gives up whenever a newer narration replaces it — and tapping 🔊 to
   * hear the reveal again is exactly that. Chaining meant a card she asked to hear twice was
   * never collected at all.
   *
   * Nothing reaches her profile before this point, which is what makes quitting
   * mid-narration cost her nothing (§10.10).
   */
  const keptId = useRef<string | null>(null)
  useEffect(() => {
    if (beat !== 'bewaar' || !beatRead || !current) return
    if (keptId.current === current.id) return
    keptId.current = current.id

    collectWeetje(current.id)
    setKept((k) => (k.includes(current.id) ? k : [...k, current.id]))
    if (reducedMotion) return

    let alive = true
    void (async () => {
      setFlying(true)
      await wait(FLY_MS)
      if (!alive || cancelled.current) return
      setFlying(false)
      setBumped(true)
      await wait(BUMP_MS)
      if (!alive || cancelled.current) return
      setBumped(false)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, beatRead, current?.id])

  /** Hear this beat again. Plays even with auto-read off — that is what the button is for. */
  function replay(): void {
    if (!current) return
    resumeAudio()
    void narrate(BEAT_PART[beat], current, true)
  }

  function goBeat(next: Beat): void {
    beatRef.current = next
    setBeat(next)
  }

  /**
   * The Doe beat is answered.
   *
   * `pop` on a miss, never `bad` or `fart` — this game has no failure sound (§9). What she
   * gets either way is the reveal, and the card, and the same eight gems.
   */
  function commit(right: boolean): void {
    if (beatRef.current !== 'doe' || !current) return
    correctRef.current = right
    setCorrect(right)
    stopNarration()
    playEffect(right ? 'ding' : 'pop')
    haptic(right ? [15, 60, 15] : 12)
    if (right && !reducedMotion) confettiPuff()
    // Synchronous, so every guard that reads beatRef — the pointer handlers, the labels,
    // a second tap on an option — sees the card as answered from this instant on.
    goBeat('bewaar')
  }

  function confettiPuff(): void {
    const el = cardRef.current
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

  /** *Verder*: on to the next beat, the next card, or the reward screen after the last one. */
  function advance(): void {
    if (!beatRead) return
    if (beat === 'luister') return goBeat('doe')
    if (beat !== 'bewaar') return
    if (index >= deck.length - 1) {
      stopNarration()
      // No answers: a Weetje round is never scored, and computeReward's `weetje` branch pays
      // a flat rate off lesson.kind alone (engine/reward.ts).
      onComplete({ answers: [] })
      return
    }
    setIndex((i) => i + 1)
    goBeat('luister')
  }

  // ---- the swipe, for waar-niet-waar cards ----

  function answerVerdict(verdict: Verdict): void {
    if (!current) return
    commit((verdict === 'waar') === (current.answer === true))
  }

  /** A tapped label performs the swipe she could have made, visibly, and then commits (§2). */
  function tapVerdict(verdict: Verdict): void {
    if (beatRef.current !== 'doe' || demo) return
    if (reducedMotion) return answerVerdict(verdict)
    setDemo(verdict)
    later(DEMO_MS, () => {
      if (cancelled.current) return
      setDemo(null)
      answerVerdict(verdict)
    })
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    // A pointer is already driving this drag — an incidental second touch (a resting palm on
    // a tablet) must not steal it and reset the gesture.
    if (beatRef.current !== 'doe' || demo || activePointerId.current !== null) return
    activePointerId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    startY.current = e.clientY
    samples.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }]
    setDragging(true)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging || e.pointerId !== activePointerId.current) return
    const s = samples.current
    s.push({ t: performance.now(), x: e.clientX, y: e.clientY })
    // Drop from the second slot, never the first: resolveSwipe measures total distance from
    // sample zero, so evicting the origin would make a long slow drag read as a short one.
    if (s.length > MAX_SAMPLES) s.splice(1, 1)
    setDragY(e.clientY - startY.current)
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging || e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setDragging(false)
    const pile = resolveSwipe(samples.current)
    samples.current = []
    if (pile) answerVerdict(pile === 'goed' ? 'waar' : 'nietWaar')
    else setDragY(0)
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>): void {
    // A gesture the browser cancels (an edge back-swipe, a scroll takeover) is not a
    // completed swipe — reset rather than answer with whatever dragY happened to reach.
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null
    setDragging(false)
    samples.current = []
    setDragY(0)
  }

  // Keyboard play, for building and reviewing on a desktop — the same directions as the
  // gesture, so the two can never disagree about which way *Waar* is.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (beatRef.current !== 'doe' || current?.type !== 'waar-niet-waar') return
      if (e.key === 'ArrowUp') tapVerdict('waar')
      if (e.key === 'ArrowDown') tapVerdict('nietWaar')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  // ---- rendering ----

  if (deck.length === 0) {
    // Nothing has been reviewed yet (§3, §4). An honest screen, rather than a card with no
    // copy on it — the reviewed gate is allowed to leave this node with nothing to deal.
    return (
      <div className="game-screen">
        <div className="game-header">
          <button className="quit" aria-label="Stoppen" onClick={quit}>
            ✕
          </button>
        </div>
        <div className="game-stage">
          <h2>Nog geen weetjes</h2>
          <button className="btn-primary" onClick={quit}>
            Terug naar het pad
          </button>
        </div>
      </div>
    )
  }

  if (!current) return null

  const bookCount = new Set([...collectedWeetjes, ...kept]).size
  // Rising = bigger, dropping = smaller. The asymmetry is the same one Hardop lezen uses:
  // up should feel like a lift, down like putting something away.
  const scale = reducedMotion
    ? 1
    : dragY < 0
      ? 1 + clamp(-dragY / 600, 0, 0.06)
      : 1 - clamp(dragY / 1200, 0, 0.05)
  const targeted: Verdict | null =
    demo ??
    (dragging && Math.abs(dragY) > TARGET_THRESHOLD ? (dragY < 0 ? 'waar' : 'nietWaar') : null)
  const swipeable = beat === 'doe' && current.type === 'waar-niet-waar'
  const picking = beat === 'doe' && current.type !== 'waar-niet-waar'

  const cardStyle: CSSProperties = swipeable
    ? {
        transform: `translateY(${dragY}px) scale(${scale})`,
        transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(.2,1.4,.4,1)',
      }
    : {}

  const fridaExpression: FridaExpression =
    beat === 'bewaar' && correct ? 'head-celebrating' : 'happy'

  return (
    <div className="game-screen weetje-screen" data-beat={beat} onPointerDown={resumeAudio}>
      <div className="game-header">
        <button className="quit" aria-label="Stoppen" onClick={quit}>
          ✕
        </button>
        <div
          className="round-pips"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={deck.length}
          aria-valuenow={index}
          aria-label="Weetjes gedaan"
        >
          {deck.map((w, i) => (
            <span
              key={w.id}
              className={`pip${i < index ? ' pip-done' : i === index ? ' pip-now' : ''}`}
            />
          ))}
        </div>
        {/* Where the cards fly to. Deliberately *not* a link to the Weetjesboek while a round
            is running: opening it would abandon the node halfway, and a nine-year-old
            tapping the thing that just bounced should not lose her place. */}
        <span className={`weetje-book${bumped ? ' bumped' : ''}`} aria-label="Weetjesboek">
          <BookIcon fill="var(--gold-icon)" size={22} />
          <span className="weetje-book-count">{bookCount}</span>
        </span>
      </div>

      <div className="game-stage weetje-stage">
        {swipeable && (
          <button
            className={`weetje-label weetje-label-waar${targeted === 'waar' ? ' targeted' : ''}`}
            onClick={() => tapVerdict('waar')}
          >
            <span aria-hidden="true">▲</span> {VERDICT_LABEL.waar}
          </button>
        )}

        <div
          ref={cardRef}
          className={[
            'weetje-card',
            `beat-${beat}`,
            swipeable ? 'swipeable' : '',
            demo ? `demo demo-${demo === 'waar' ? 'up' : 'down'}` : '',
            flying ? 'flying' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={cardStyle}
          onPointerDown={swipeable ? onPointerDown : undefined}
          onPointerMove={swipeable ? onPointerMove : undefined}
          onPointerUp={swipeable ? onPointerUp : undefined}
          onPointerCancel={swipeable ? onPointerCancel : undefined}
        >
          <span className="weetje-tile" aria-hidden="true">
            {beat === 'bewaar' ? (correct ? '✅' : '🙂') : current.tile}
          </span>

          {beat === 'luister' && (
            <p className="weetje-text weetje-fact">
              <Marked text={current.fact} />
            </p>
          )}

          {swipeable && (
            <p className="weetje-text weetje-statement">
              <Marked text={current.statement ?? ''} />
            </p>
          )}

          {picking && (
            <p className="weetje-text weetje-question">
              <Marked text={current.question ?? ''} />
            </p>
          )}

          {beat === 'bewaar' && (
            <p className="weetje-text weetje-reveal">
              {!correct && <strong className="weetje-praise">{GOED_GEPROBEERD} </strong>}
              <Marked text={current.reveal} />
            </p>
          )}

          {/* Bottom centre of the card on every beat, always the same size and the same place
              (§6) — the one control she can rely on being where she left it. */}
          <button
            className={`weetje-speak${speaking ? ' speaking' : ''}`}
            aria-label="Lees voor"
            onClick={(e) => {
              e.stopPropagation()
              replay()
            }}
            // The badge sits inside a card that may be draggable, so a press on it must not
            // also start a swipe. resumeAudio is called explicitly, because stopping
            // propagation also stops it reaching the screen-level handler.
            onPointerDown={(e) => {
              resumeAudio()
              e.stopPropagation()
            }}
          >
            🔊
          </button>
        </div>

        {swipeable && (
          <button
            className={`weetje-label weetje-label-niet${targeted === 'nietWaar' ? ' targeted' : ''}`}
            onClick={() => tapVerdict('nietWaar')}
          >
            <span aria-hidden="true">▼</span> {VERDICT_LABEL.nietWaar}
          </button>
        )}

        {picking && (
          <div className="weetje-options">
            {(current.options ?? []).map((option, i) => (
              <button
                key={option}
                className={`weetje-option${chosen === i ? ' chosen' : ''}`}
                onClick={() => {
                  setChosen(i)
                  commit(i === current.correct)
                }}
                disabled={chosen !== null}
              >
                {/* No photos of real people, ever (§13) — a big first letter in a coloured
                    circle is what stands in for a portrait on a `wie` card. */}
                {current.type === 'wie' && (
                  <span className={`weetje-initial initial-${i}`} aria-hidden="true">
                    {option.slice(0, 1)}
                  </span>
                )}
                <span className="weetje-option-text">{option}</span>
              </button>
            ))}
          </div>
        )}

        {beat !== 'doe' && (
          <div className="weetje-foot">
            <Frida expression={fridaExpression} className="weetje-frida" alt="" />
            <span className="weetje-kept">
              {beat === 'bewaar' && kept.includes(current.id) ? '✦ in je Weetjesboek' : ''}
            </span>
            <button className="btn-primary weetje-verder" onClick={advance} disabled={!beatRead}>
              Verder
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
