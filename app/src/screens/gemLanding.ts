import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { prefersReducedMotion } from '../motion'

/**
 * The handoff from the reward screen's chest to the gem count on the leerpad
 * (docs/kist-openen.md §4).
 *
 * **Why it has to exist at all.** `completeLesson` credits the gems the moment the round
 * ends, a beat before the reward screen even mounts — so by the time she taps Verder the
 * counter in the statbar is *already* at the new total, and the gems she just watched come
 * out of a chest arrive nowhere. The two screens each told the truth and the story between
 * them was missing. This carries "she is owed a landing of N gems" across the navigation so
 * the leerpad can hold the counter back for nine hundred milliseconds and let them arrive.
 *
 * **Why router state rather than the store.** Nothing here is worth persisting, and
 * `useProgress` has no `partialize` — a field added to it is a field written to IndexedDB
 * and read back on the next launch, which for this would mean gems flying into the jar on a
 * cold start days later. Router state dies with the history entry, which is exactly the
 * lifetime this has.
 */
export interface GemLandingState {
  /** gems earned by the round she has just left. Absent for any other way onto the leerpad. */
  gemsLanded: number
}

/**
 * The landing owed by a navigation, or 0. Total, and deliberately suspicious of its input:
 * `location.state` is whatever the last `navigate` put there, and after a reload or a
 * hand-typed URL that is `null`.
 */
export function gemsLandedFrom(state: unknown): number {
  if (!state || typeof state !== 'object') return 0
  const raw = (state as Partial<GemLandingState>).gemsLanded
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  return Math.floor(raw)
}

/** How long the gems are in the air before the counter takes them. */
export const GEM_FLIGHT_MS = 900

/**
 * How long the counter stays flagged as having just been paid.
 *
 * It exists because the pop has to fire when the gems *arrive*, and "the flight ended" is
 * the removal of a state rather than the arrival of one — there is no CSS for animating on
 * an attribute going away. A short-lived flag of its own is the honest way to say it.
 */
export const GEM_POP_MS = 600

export interface GemLanding {
  /** what the counter should read *now* — the held-back total until the gems land */
  shown: number
  /** gems currently in the air, or 0. Drives the sprites; 0 means render nothing. */
  flying: number
  /** the gems have just landed — the counter's pop. False when there was no flight. */
  landed: boolean
}

/**
 * Holds the gem counter back while the gems she just earned fly into it.
 *
 * The count-up itself is not repeated here: she has already watched these gems counted, one
 * tick at a time, on the reward screen. Doing it twice makes the second one a wait rather
 * than a reward. The counter sits at the old total, the gems arrive, and it takes them in
 * one step with a pop.
 *
 * Under reduced motion there is no flight and no holding back — the counter reads the true
 * total from the first frame, which is what it did before any of this existed.
 */
export function useGemLanding(total: number): GemLanding {
  const location = useLocation()
  const navigate = useNavigate()
  const owed = gemsLandedFrom(location.state)

  const [reduced] = useState(prefersReducedMotion)
  /*
   * Captured once, at mount. The history entry is stripped of its state in the effect below
   * and `total` climbs when the gems land, so re-reading either later would restart a flight
   * that has already happened. `useState`'s initialiser is the only read of `owed` that
   * decides anything.
   */
  const [pending] = useState(() => (reduced ? 0 : Math.min(owed, total)))
  const [flying, setFlying] = useState(pending)
  const [landed, setLanded] = useState(false)

  const done = useRef(false)

  useEffect(() => {
    if (!owed) return
    /*
     * Strip the landing off this history entry. Without it, leaving for the avatar screen and
     * coming back replays the flight — and worse, shows her a counter that has gone *down*
     * by the gems she earned, for as long as they are in the air.
     */
    navigate(location.pathname, { replace: true, state: null })
  }, [owed, navigate, location.pathname])

  useEffect(() => {
    if (pending <= 0 || done.current) return
    const timers = [
      setTimeout(() => {
        done.current = true
        setFlying(0)
        setLanded(true)
      }, GEM_FLIGHT_MS),
      setTimeout(() => setLanded(false), GEM_FLIGHT_MS + GEM_POP_MS),
    ]
    return () => {
      for (const t of timers) clearTimeout(t)
    }
  }, [pending])

  // Never below zero: `total` is the live store value, and a second profile's store
  // hydrating under a flight is not worth showing a negative number for.
  return { shown: Math.max(0, flying > 0 ? total - pending : total), flying, landed }
}
