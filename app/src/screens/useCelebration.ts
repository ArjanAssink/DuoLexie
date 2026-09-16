import { useCallback, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../motion'
import { BEATS, easeBar, tierFor, tierIndex, type Beat } from './rewardTimeline'

interface Options {
  /** the percentage the bar fills to — the count-up and the tier chimes are read off it */
  pct: number
  /** a beat has begun. Not called when `skip()` jumps the queue, and not under reduced motion. */
  onBeat?: (beat: Beat) => void
  /** the filling bar has crossed into a new tier; `step` is 1 for Goed, 2 for Super, 3 for Perfect */
  onTierUp?: (step: number) => void
}

export interface Celebration {
  /** which stage is on screen; the reward screen mirrors it to `data-beat` */
  beat: Beat
  /** eased 0–1 fill progress. Drives both the bar's scaleX and the number beside it. */
  progress: number
  /** true once `skip()` has run, so CSS can suppress every entrance animation at once */
  skipped: boolean
  /** jump to the final state: everything at its final value, nothing left mid-animation */
  skip: () => void
}

/**
 * The celebration's clock (docs/reward-celebration.md §2).
 *
 * Every timer in the sequence lives here — four `setTimeout`s and one `requestAnimationFrame`
 * loop — because the gate that matters most is that *none of them survives the screen*.
 * `tests/e2e/quit-mid-animation.spec.ts` exists because an earlier generation of this app
 * left game timers running after unmount and credited a lesson she had quit; a five-timer
 * celebration scattered across a component's render body is exactly how that comes back. One
 * `clearAll()`, called from the effect's cleanup and from `skip()`, is the whole defence.
 *
 * Under `prefers-reduced-motion` the hook never starts: it mounts in `done` with
 * `progress` already 1, so the screen's first paint *is* the final state. No timers are
 * created, so `onBeat` and `onTierUp` never fire and none of the new sounds play either —
 * the gem count-up, which is numbers changing rather than motion, is the reward screen's own
 * effect and keeps running (§7).
 */
export function useCelebration({ pct, onBeat, onTierUp }: Options): Celebration {
  // Read once at mount. A media query that flips mid-celebration would otherwise strand the
  // sequence halfway, which is worse for the person who asked for less motion than finishing.
  const [reduced] = useState(prefersReducedMotion)
  const [beat, setBeat] = useState<Beat>(reduced ? 'done' : 'hero')
  const [progress, setProgress] = useState(reduced ? 1 : 0)
  const [skipped, setSkipped] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const frame = useRef<number | null>(null)

  // The callbacks are read through refs so the effect below depends on `pct` alone. A parent
  // that re-creates its handlers each render (the reward screen does — they close over the
  // reward) would otherwise tear down and restart the entire timeline on every state change,
  // which is to say on every frame of the count-up.
  const beatRef = useRef(onBeat)
  const tierRef = useRef(onTierUp)
  beatRef.current = onBeat
  tierRef.current = onTierUp

  const clearAll = useCallback(() => {
    for (const t of timers.current) clearTimeout(t)
    timers.current = []
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  const skip = useCallback(() => {
    clearAll()
    setSkipped(true)
    setBeat('done')
    setProgress(1)
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
    at(BEATS.cardAt, () => enter('card'))
    at(BEATS.stripAt, () => enter('strip'))
    at(BEATS.doneAt, () => enter('done'))

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
  }, [pct, reduced, clearAll])

  return { beat, progress, skipped, skip }
}
