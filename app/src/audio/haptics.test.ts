import { describe, it, expect } from 'vitest'
import { tickOffsets, MAX_TICKS, TICK_SPACING_MS } from './haptics'

/**
 * How a vibrate pattern is played through the iOS switch tick (docs/haptics.md): one tick
 * per short "on", a rattle across a long one, silence for the "off"s.
 */
describe('tickOffsets', () => {
  it('turns a short single buzz into one tick, at once', () => {
    expect(tickOffsets(8)).toEqual([0])
    expect(tickOffsets(12)).toEqual([0])
  })

  it('keeps the gaps of a pattern, one tick per short on-segment', () => {
    // GameScreen's round-end tap: on 15, off 60, on 15
    expect(tickOffsets([15, 60, 15])).toEqual([0, 75])
  })

  it('rattles across a long on-segment, one tick per spacing', () => {
    // the reward screen's hero buzz: 40 · 50 · 60 · 50 · 240
    expect(tickOffsets([40, 50, 60, 50, 240])).toEqual([0, 90, 200, 260, 320, 380])
    expect(tickOffsets(240)).toEqual([0, 60, 120, 180])
  })

  it('never ticks for nothing', () => {
    expect(tickOffsets(0)).toEqual([])
    expect(tickOffsets([])).toEqual([])
    // a leading zero "on" is a delay, not a tick — vibrate treats it the same way
    expect(tickOffsets([0, 100, 20])).toEqual([100])
  })

  it('caps a very long buzz rather than rattling for seconds', () => {
    const offsets = tickOffsets(5000)
    expect(offsets).toHaveLength(MAX_TICKS)
    expect(offsets[MAX_TICKS - 1]).toBe((MAX_TICKS - 1) * TICK_SPACING_MS)
  })
})
