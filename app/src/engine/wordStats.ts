import type { WordBox, WordResult, WordStats } from '@shared/src/types'
import { addDays, localDay } from '../date'

/**
 * Per-word statistics reducer — the word-level counterpart to engine/stats.ts.
 * Implements the Leitner promotion rules in docs/reading-mechanics.md §3.
 *
 * Nothing reads `box`/`dueAt` yet; they are recorded now because `withinWindow`
 * is per-attempt information that cannot be reconstructed after the fact.
 */

/** EWMA smoothing for reading time — more responsive than the 0.2 used for sounds. */
export const ALPHA = 0.3

/**
 * Ceiling on a single sample. Without it one card she wandered off from drags
 * the average up for roughly the next ten reads.
 */
export const MAX_SAMPLE_MS = 15_000

/** Days until a word in each box comes back (docs/reading-mechanics.md §3). */
export const BOX_INTERVAL_DAYS: Record<WordBox, number> = { 1: 0, 2: 2, 3: 4, 4: 9, 5: 21 }

export function emptyWordStats(today: string): WordStats {
  return {
    attempts: 0,
    correct: 0,
    ewmaMs: null,
    box: 1,
    dueAt: today,
    lastSeenAt: new Date(0).toISOString(),
  }
}

function nextBox(current: WordBox, r: WordResult): WordBox {
  if (!r.correct) return 1
  // Correct but over the window: fluent-but-slow is not mastery, so it holds
  // position rather than advancing. This is what makes speed the promotion gate.
  if (!r.withinWindow) return current
  return Math.min(5, current + 1) as WordBox
}

/**
 * Fold one read into a word's stats. `now` is injectable so the day arithmetic
 * is testable — engine/stats.ts calls `new Date()` inline and can't be.
 */
export function applyWordResult(
  stats: WordStats,
  r: WordResult,
  now: Date = new Date(),
): WordStats {
  const box = nextBox(stats.box, r)
  const sample = Math.min(r.ms, MAX_SAMPLE_MS)

  return {
    attempts: stats.attempts + 1,
    correct: stats.correct + (r.correct ? 1 : 0),
    // successes only: a failed read times how long she struggled, not how
    // fluently she reads it, and blending that in would relax the window
    // exactly where it should stay tight
    ewmaMs: r.correct
      ? stats.ewmaMs === null
        ? sample
        : stats.ewmaMs * (1 - ALPHA) + sample * ALPHA
      : stats.ewmaMs,
    box,
    // rescheduled on every outcome, including a hold — she just saw it
    dueAt: addDays(localDay(now), BOX_INTERVAL_DAYS[box]),
    lastSeenAt: now.toISOString(),
  }
}
