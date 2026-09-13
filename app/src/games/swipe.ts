/**
 * What a finished drag on a Hardop lezen card means.
 *
 * Kept out of the component deliberately: the decision is the part with the interesting
 * edges (a flick that barely moves, a diagonal that is really a sideways drag, a tap that
 * registered two identical samples) and none of them need a DOM to test. The component
 * only has to collect samples and hand them over — see docs/hardop-lezen-swipe-v2.md §3.
 *
 * Up is goed and down is nog even, which is the whole reason the axis changed: left and
 * right mean nothing to a nine-year-old, while a good word going *up* to Frida and a word
 * that needs another go being put *down* into the tray are directions she already has
 * feelings about.
 */

export type SwipeVerdict = 'goed' | 'nogEven' | null

export interface SwipeSample {
  t: number
  x: number
  y: number
}

/** A deliberate drag this far commits, at any speed. */
export const SWIPE_DISTANCE_PX = 80
/** px/ms over the last ~80ms: a fast flick commits well before it reaches the distance. */
export const FLICK_VELOCITY = 0.6
/** ...but a flick still has to be a movement, not a tremble under a lifting finger. */
export const FLICK_MIN_PX = 24
/** |dx| beyond this multiple of |dy| is a sideways drag, and sideways means nothing here. */
export const AXIS_LOCK_RATIO = 1.0
/** The window the flick velocity is measured over. */
const VELOCITY_WINDOW_MS = 80

/**
 * What a completed gesture means. Up (negative dy) is goed, down is nogEven; anything
 * short, slow or mostly sideways is `null`, which the caller springs back from.
 */
export function resolveSwipe(samples: SwipeSample[]): SwipeVerdict {
  if (samples.length < 2) return null

  const first = samples[0]
  const last = samples[samples.length - 1]
  const dx = last.x - first.x
  const dy = last.y - first.y

  // Axis lock. A sloppy diagonal is common at nine years old; rather than round it to
  // whichever pile is nearer — and sometimes grade the opposite of what she meant — a
  // mostly-sideways gesture springs back and she simply tries again.
  if (Math.abs(dx) > Math.abs(dy) * AXIS_LOCK_RATIO) return null

  // Velocity over the tail of the gesture, not over all of it: she often drags slowly to
  // think and then flicks, and it is the flick that says she has decided.
  const recent = samples.filter((s) => last.t - s.t <= VELOCITY_WINDOW_MS)
  const [from, to] =
    recent.length >= 2 ? [recent[0], last] : [samples[samples.length - 2], last]
  const elapsed = to.t - from.t
  const velocity = elapsed > 0 ? (to.y - from.y) / elapsed : 0

  const farEnough = Math.abs(dy) >= SWIPE_DISTANCE_PX
  const flicked = Math.abs(velocity) >= FLICK_VELOCITY && Math.abs(dy) >= FLICK_MIN_PX
  if (!farEnough && !flicked) return null

  return dy < 0 ? 'goed' : 'nogEven'
}
