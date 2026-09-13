import { describe, it, expect } from 'vitest'
import { resolveSwipe, FLICK_MIN_PX, SWIPE_DISTANCE_PX, type SwipeSample } from './swipe'

/**
 * A gesture as a list of samples, `steps` of them, spread evenly over `ms` and travelling
 * `dx`/`dy` in total — the shape HardopLezen's pointermove handler actually records.
 */
function drag({
  dx = 0,
  dy = 0,
  ms,
  steps = 10,
}: {
  dx?: number
  dy?: number
  ms: number
  steps?: number
}): SwipeSample[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    t: (ms / steps) * i,
    x: (dx / steps) * i,
    y: (dy / steps) * i,
  }))
}

describe('resolveSwipe', () => {
  it('reads a slow drag up as goed', () => {
    expect(resolveSwipe(drag({ dy: -100, ms: 900 }))).toBe('goed')
  })

  it('reads a slow drag down as nog even', () => {
    expect(resolveSwipe(drag({ dy: 100, ms: 900 }))).toBe('nogEven')
  })

  it('commits a short fast flick, which is how she will swipe once she knows the gesture', () => {
    // 30px in 30ms is 1 px/ms — nowhere near SWIPE_DISTANCE_PX, clearly a decision
    expect(resolveSwipe(drag({ dy: -30, ms: 30 }))).toBe('goed')
  })

  it('leaves a short slow drag undecided, so a hesitant nudge springs back', () => {
    expect(resolveSwipe(drag({ dy: -30, ms: 900 }))).toBe(null)
  })

  it('ignores a drag that is more sideways than vertical, however long', () => {
    // 200px down would commit on its own; 250px sideways says she was not aiming at a pile
    expect(resolveSwipe(drag({ dx: 250, dy: 200, ms: 900 }))).toBe(null)
  })

  it('cannot decide anything from a single sample', () => {
    expect(resolveSwipe([{ t: 0, x: 0, y: 0 }])).toBe(null)
    expect(resolveSwipe([])).toBe(null)
  })

  it('keeps a diagonal that is mostly vertical, since nobody swipes in a straight line', () => {
    expect(resolveSwipe(drag({ dx: 60, dy: -100, ms: 900 }))).toBe('goed')
  })

  it('will not turn a tremble under a lifting finger into a flick', () => {
    // fast enough on its own terms, but under FLICK_MIN_PX of actual travel
    const tremble = drag({ dy: -(FLICK_MIN_PX - 4), ms: 10 })
    expect(resolveSwipe(tremble)).toBe(null)
  })

  it('commits exactly at the distance threshold', () => {
    expect(resolveSwipe(drag({ dy: -SWIPE_DISTANCE_PX, ms: 2000 }))).toBe('goed')
    expect(resolveSwipe(drag({ dy: SWIPE_DISTANCE_PX, ms: 2000 }))).toBe('nogEven')
  })

  it('measures the flick over the end of the gesture, not the whole of it', () => {
    // She holds the card still for a second, then flicks it up: the average speed over the
    // whole gesture is far too slow, but she has plainly decided.
    const samples: SwipeSample[] = [
      { t: 0, x: 0, y: 0 },
      { t: 500, x: 0, y: -2 },
      { t: 1000, x: 0, y: -4 },
      { t: 1030, x: 0, y: -20 },
      { t: 1060, x: 0, y: -40 },
    ]
    expect(resolveSwipe(samples)).toBe('goed')
  })
})
