import { useCallback, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../motion'
import { BEATS, easeBar, tierFor, tierIndex, type Beat } from './rewardTimeline'

interface Options {
  /** the percentage the bar fills to — the count-up and the tier chimes are read off it */
  pct: number
  /**
   * This round has no stat card (a Weetje — docs/weetjes.md §2 — has nothing to grade). The
   * card beat is dropped rather than held open: 1.3 seconds of an empty middle is worse
   * pacing than no middle, and there is no bar to fill or tier to chime either.
   */
  skipCard?: boolean
  /** a beat has begun. Not called when `skip()` jumps the queue, and not under reduced motion. */
  onBeat?: (beat: Beat) => void
  /** the filling bar has crossed into a new tier; `step` is 1 for Goed, 2 for Super, 3 for Perfect */
  onTierUp?: (step: number) => void
  /**
   * The chest has just swung open — she tapped it, or the auto-open fired. Called at most
   * once, and on the same terms as `onBeat`: not for a `skip()`, and never under reduced
   * motion, where the chest is already open on the first frame and nothing has happened for
   * a sound to belong to.
   */
  onChestOpen?: () => void
}

export interface Celebration {
  /** which stage is on screen; the reward screen mirrors it to `data-beat` */
  beat: Beat
  /** eased 0–1 fill progress. Drives both the bar's scaleX and the number beside it. */
  progress: number
  /** true once `skip()` has run, so CSS can suppress every entrance animation at once */
  skipped: boolean
  /**
   * The schatkist is open — the gems are out, and the count-up has started
   * (docs/kist-openen.md). Not a beat: the chest is the one thing on this screen she can
   * make happen early, so its state has to be able to run ahead of the schedule rather than
   * be a position in it.
   */
  chestOpen: boolean
  /** she tapped the chest. Idempotent, and safe to call after the auto-open has fired. */
  openChest: () => void
  /** jump to the final state: everything at its final value, nothing left mid-animation */
  skip: () => void
}

/**
 * The celebration's clock (docs/reward-celebration.md §2).
 *
 * Every timer in the sequence lives here — five `setTimeout`s and one `requestAnimationFrame`
 * loop — because the gate that matters most is that *none of them survives the screen*.
 * `tests/e2e/quit-mid-animation.spec.ts` exists because an earlier generation of this app
 * left game timers running after unmount and credited a lesson she had quit; a five-timer
 * celebration scattered across a component's render body is exactly how that comes back. One
 * `clearAll()`, called from the effect's cleanup and from `skip()`, is the whole defence.
 *
 * `skipCard` is the one shape change the sequence allows: a round with nothing to grade
 * (docs/weetjes.md §2) goes settle -> strip -> done, closing the card's window up instead of
 * holding 1.3 seconds open for a card that is not there.
 *
 * Under `prefers-reduced-motion` the hook never starts: it mounts in `done` with
 * `progress` already 1, so the screen's first paint *is* the final state. No timers are
 * created, so `onBeat` and `onTierUp` never fire and none of the new sounds play either —
 * the gem count-up, which is numbers changing rather than motion, is the reward screen's own
 * effect and keeps running (§7) — the chest it pours from mounts already open, so there is
 * nothing for it to wait on.
 */
export function useCelebration({
  pct,
  skipCard = false,
  onBeat,
  onTierUp,
  onChestOpen,
}: Options): Celebration {
  // Read once at mount. A media query that flips mid-celebration would otherwise strand the
  // sequence halfway, which is worse for the person who asked for less motion than finishing.
  const [reduced] = useState(prefersReducedMotion)
  const [beat, setBeat] = useState<Beat>(reduced ? 'done' : 'hero')
  // With no card there is nothing to fill, so the fill is over before it starts.
  const [progress, setProgress] = useState(reduced || skipCard ? 1 : 0)
  const [skipped, setSkipped] = useState(false)
  // Reduced motion mounts every part of the screen in its final state, and for the chest
  // that is open — there is no hinge swing to watch and no reason to make her tap for a
  // number the screen could simply be showing her.
  const [chestOpen, setChestOpen] = useState(reduced)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const frame = useRef<number | null>(null)

  // The callbacks are read through refs so the effect below depends on `pct` alone. A parent
  // that re-creates its handlers each render (the reward screen does — they close over the
  // reward) would otherwise tear down and restart the entire timeline on every state change,
  // which is to say on every frame of the count-up.
  const beatRef = useRef(onBeat)
  const tierRef = useRef(onTierUp)
  const chestRef = useRef(onChestOpen)
  beatRef.current = onBeat
  tierRef.current = onTierUp
  chestRef.current = onChestOpen

  /**
   * Whether the chest's sound has been spent. A ref rather than reading `chestOpen`, because
   * a tap landing in the same frame as the auto-open timer would see the old state in both
   * handlers and creak twice.
   */
  const chestSounded = useRef(false)

  const clearAll = useCallback(() => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  /**
   * Opening the chest is one-way and idempotent: the auto-open timer, a tap, and a skip all
   * call this, and on a slow frame two of them can land together.
   */
  const openChest = useCallback(() => {
    if (!chestSounded.current) {
      chestSounded.current = true
      chestRef.current?.()
    }
    setChestOpen(true)
  }, [])

  const skip = useCallback(() => {
    clearAll()
    setSkipped(true)
    setBeat('done')
    setProgress(1)
    // A skip means *everything* at its final value, and a closed chest is not one: leaving
    // it shut would make the tap she just made the one thing on the screen that did nothing.
    // It opens without its hinge swing, because `data-skipped` turns every animation off —
    // which is the guarantee, not an oversight.
    setChestOpen(true)
  }, [clearAll])

  useEffect(() => {
    if (reduced) return

    const at = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms))
    }
    const enter = (b: Beat) => {
      setBeat(b)
      beatRef.current?.(b)
    }

    // The hero *beat* is on screen from the first frame (`data-beat="hero"`), but its burst
    // waits out the screen's own 300ms enter fade — the sound and the confetti belong to
    // Frida arriving, not to the cut from the game. CSS delays the visuals by the same
    // `heroAt`, published to it as `--hero-at`.
    at(BEATS.heroAt, () => enter('hero'))
    at(BEATS.settleAt, () => enter('settle'))

    // How much earlier everything after the settle happens when there is no card to pop in.
    const cardGap = BEATS.stripAt - BEATS.cardAt

    if (skipCard) {
      // settle -> strip -> done, with the card's window closed up rather than left empty.
      at(BEATS.cardAt, () => enter('strip'))
      at(BEATS.doneAt - cardGap, () => enter('done'))
      // The chest is timed off the strip, not off the clock, so a Weetje's shorter sequence
      // does not leave it hanging 1.3s longer than every other round's.
      at(BEATS.chestAt - cardGap, openChest)
      return clearAll
    }

    at(BEATS.cardAt, () => enter('card'))
    at(BEATS.stripAt, () => enter('strip'))
    at(BEATS.doneAt, () => enter('done'))
    at(BEATS.chestAt, openChest)

    at(BEATS.cardAt + BEATS.barDelay, () => {
      const started = performance.now()
      // The tier the label has already chimed for. It starts at whatever 0% earns, so a
      // round below 50% never chimes at all — there is no boundary for it to cross.
      let announced = tierIndex(tierFor(0).id)

      const step = () => {
        const elapsed = performance.now() - started
        const t = Math.min(1, elapsed / BEATS.barFillMs)
        const eased = easeBar(t)
        setProgress(eased)

        // Read the tier off the number she can actually see, not off `eased × pct`: the
        // label must swap on the frame the digits reach 50, not a frame either side of it.
        const reachedIndex = tierIndex(tierFor(Math.round(eased * pct)).id)
        while (announced < reachedIndex) {
          announced += 1
          tierRef.current?.(announced)
        }

        if (t < 1) frame.current = requestAnimationFrame(step)
        else frame.current = null
      }
      frame.current = requestAnimationFrame(step)
    })

    return clearAll
  }, [pct, reduced, skipCard, clearAll, openChest])

  return { beat, progress, skipped, chestOpen, openChest, skip }
}
