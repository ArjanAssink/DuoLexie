/**
 * What a finished drag on a card means.
 *
 * Kept out of the components deliberately: the decision is the part with the interesting
 * edges (a flick that barely moves, a diagonal that is really a sideways drag, a tap that
 * registered two identical samples) and none of them need a DOM to test. A component only
 * has to collect samples and hand them over — see docs/hardop-lezen-swipe-v2.md §3.
 *
 * Two games read a verdict out of this. Hardop lezen (and Weetjes) sort a card **vertically**:
 * up is goed and down is nog even, which is the whole reason that axis was chosen — left and
 * right mean nothing to a nine-year-old, while a good word going *up* to Frida and a word
 * that needs another go being put *down* into the tray are directions she already has
 * feelings about. Flitsen carries a card **horizontally** from the deck to the discard pile
 * (docs/flitsen-swipe.md §3.1). Same rules, different axis, so the axis is a parameter.
 */

export type SwipeVerdict = 'goed' | 'nogEven' | null

export type DragAxis = 'x' | 'y'

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
/** Travel on the other axis beyond this multiple of the drag axis is a sideways drag, and sideways means nothing. */
export const AXIS_LOCK_RATIO = 1.0
/** The window the flick velocity is measured over. */
const VELOCITY_WINDOW_MS = 80

/**
 * The sign of a completed drag along `axis`: `1` towards the positive end (right, or down),
 * `-1` towards the negative end (left, or up), `0` for anything short, slow or mostly on the
 * other axis — which the caller springs back from.
 *
 * `distancePx` is the drag length that commits at any speed. Hardop lezen uses the default;
 * Flitsen passes half the gap between its two stacks, so the rule scales with the layout.
 */
export function resolveDrag(
  samples: SwipeSample[],
  axis: DragAxis,
  distancePx: number = SWIPE_DISTANCE_PX,
): -1 | 0 | 1 {
  if (samples.length < 2) return 0

  const along = (s: SwipeSample) => (axis === 'y' ? s.y : s.x)
  const across = (s: SwipeSample) => (axis === 'y' ? s.x : s.y)

  const first = samples[0]
  const last = samples[samples.length - 1]
  const d = along(last) - along(first)
  const dAcross = across(last) - across(first)

  // Axis lock. A sloppy diagonal is common at nine years old; rather than round it to
  // whichever pile is nearer — and sometimes grade the opposite of what she meant — a
  // mostly-sideways gesture springs back and she simply tries again.
  if (Math.abs(dAcross) > Math.abs(d) * AXIS_LOCK_RATIO) return 0

  // Velocity over the tail of the gesture, not over all of it: she often drags slowly to
  // think and then flicks, and it is the flick that says she has decided.
  const recent = samples.filter((s) => last.t - s.t <= VELOCITY_WINDOW_MS)
  const [from, to] =
    recent.length >= 2 ? [recent[0], last] : [samples[samples.length - 2], last]
  const elapsed = to.t - from.t
  const velocity = elapsed > 0 ? (along(to) - along(from)) / elapsed : 0

  const farEnough = Math.abs(d) >= distancePx
  const flicked = Math.abs(velocity) >= FLICK_VELOCITY && Math.abs(d) >= FLICK_MIN_PX
  if (!farEnough && !flicked) return 0

  return d < 0 ? -1 : 1
}

/**
 * What a completed vertical gesture means. Up (negative dy) is goed, down is nogEven;
 * anything short, slow or mostly sideways is `null`, which the caller springs back from.
 */
export function resolveSwipe(samples: SwipeSample[]): SwipeVerdict {
  const sign = resolveDrag(samples, 'y')
  return sign < 0 ? 'goed' : sign > 0 ? 'nogEven' : null
}
