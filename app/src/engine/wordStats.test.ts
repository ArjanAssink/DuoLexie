import { describe, it, expect } from 'vitest'
import type { WordResult, WordStats } from '@shared/src/types'
import {
  ALPHA,
  BOX_INTERVAL_DAYS,
  MAX_SAMPLE_MS,
  applyWordResult,
  emptyWordStats,
} from './wordStats'

const NOW = new Date(2026, 8, 6, 14, 30) // 6 Sep 2026, local
const TODAY = '2026-09-06'

const fast: WordResult = { wordId: 'kat', correct: true, ms: 2000, withinWindow: true }
const slow: WordResult = { wordId: 'kat', correct: true, ms: 6200, withinWindow: false }
const missed: WordResult = { wordId: 'kat', correct: false, ms: 7000, withinWindow: false }

/** Apply a sequence of reads to a fresh word. */
function fold(results: WordResult[], now = NOW): WordStats {
  return results.reduce((s, r) => applyWordResult(s, r, now), emptyWordStats(TODAY))
}

describe('emptyWordStats', () => {
  it('starts in box 1, due today, with no timing yet', () => {
    const s = emptyWordStats(TODAY)
    expect(s).toMatchObject({ attempts: 0, correct: 0, ewmaMs: null, box: 1, dueAt: TODAY })
  })
})

describe('box transitions', () => {
  it('promotes one box per fast correct read, capping at 5', () => {
    const boxes = [1, 2, 3, 4, 5, 6].map((n) => fold(Array(n).fill(fast)).box)
    expect(boxes).toEqual([2, 3, 4, 5, 5, 5])
  })

  it('holds the box when correct but over the window', () => {
    // the rule that makes speed the promotion gate, not mere correctness
    const promoted = fold([fast, fast]) // box 3
    const held = applyWordResult(promoted, slow, NOW)
    expect(promoted.box).toBe(3)
    expect(held.box).toBe(3)
  })

  it('demotes to box 1 on a miss, from any height', () => {
    const high = fold([fast, fast, fast, fast]) // box 5
    expect(high.box).toBe(5)
    expect(applyWordResult(high, missed, NOW).box).toBe(1)
  })
})

describe('reading-time EWMA', () => {
  it('stays null while she has never read it correctly', () => {
    expect(fold([missed, missed]).ewmaMs).toBeNull()
  })

  it('takes the first successful read outright rather than blending a seed', () => {
    expect(fold([fast]).ewmaMs).toBe(2000)
  })

  it('blends later successes at ALPHA', () => {
    const s = fold([fast, { ...fast, ms: 3000 }])
    expect(s.ewmaMs).toBeCloseTo(2000 * (1 - ALPHA) + 3000 * ALPHA, 6)
  })

  it('ignores failed reads — they time her struggling, not her fluency', () => {
    const after = fold([fast, missed])
    expect(after.ewmaMs).toBe(2000)
  })

  it('still records timing for a correct-but-slow read', () => {
    const after = fold([slow])
    expect(after.ewmaMs).toBe(6200)
    expect(after.box).toBe(1)
  })

  it('clamps an abandoned card to MAX_SAMPLE_MS', () => {
    expect(fold([{ ...fast, ms: 90_000 }]).ewmaMs).toBe(MAX_SAMPLE_MS)
  })
})

describe('counters', () => {
  it('counts every attempt but only correct ones as correct', () => {
    const s = fold([fast, missed, slow])
    expect(s).toMatchObject({ attempts: 3, correct: 2 })
  })

  it('records lastSeenAt as an instant, not a day', () => {
    expect(fold([fast]).lastSeenAt).toBe(NOW.toISOString())
  })
})

describe('scheduling', () => {
  it('schedules each box by its interval', () => {
    expect(fold([fast]).dueAt).toBe('2026-09-08') // box 2 → +2
    expect(fold([fast, fast]).dueAt).toBe('2026-09-10') // box 3 → +4
    expect(fold([fast, fast, fast]).dueAt).toBe('2026-09-15') // box 4 → +9
    expect(fold([fast, fast, fast, fast]).dueAt).toBe('2026-09-27') // box 5 → +21
  })

  it('brings a missed word back the same or next session', () => {
    expect(BOX_INTERVAL_DAYS[1]).toBe(0)
    expect(fold([fast, fast, missed]).dueAt).toBe(TODAY)
  })

  it('reschedules even when the box holds', () => {
    // she just saw it, so it must not stay due from an earlier session
    const promoted = applyWordResult(emptyWordStats(TODAY), fast, new Date(2026, 8, 1, 10))
    expect(promoted.dueAt).toBe('2026-09-03')
    const held = applyWordResult(promoted, slow, NOW)
    expect(held.box).toBe(2)
    expect(held.dueAt).toBe('2026-09-08')
  })

  it('uses the local day even just after midnight', () => {
    // the UTC-vs-local trap: 00:30 local is still the previous day in UTC
    const justAfterMidnight = new Date(2026, 6, 15, 0, 30)
    expect(fold([fast], justAfterMidnight).dueAt).toBe('2026-07-17')
  })
})
