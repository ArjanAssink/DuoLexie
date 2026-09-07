import type { WordBox, WordStats } from '@shared/src/types'

/**
 * The reading window: how long she gets to read a word herself before it is
 * revealed (docs/hardop-lezen-rework.md §3).
 *
 * The window is keyed to the word's Leitner box, not to how often she has *seen*
 * it. A box only rises on a read graded "goed" inside the window and drops back
 * to 1 on "nog even", so the fuse gets shorter as a word becomes automatic for
 * her — and a word she just missed gets its full ten seconds back instead of
 * getting harder right after the miss.
 */
export const WINDOW_MS_BY_BOX: Record<WordBox, number> = {
  1: 10_000, // new, or last read was "nog even"
  2: 7_000,
  3: 5_000,
  4: 3_500,
  5: 2_500, // effectively automatic
}

/** Milliseconds for a word in the given box; an unseen word (no stats) gets box 1. */
export function windowForBox(box: WordBox | undefined): number {
  return WINDOW_MS_BY_BOX[box ?? 1]
}

/** Convenience: the window for a word, straight from its persisted stats (may be absent). */
export function windowForWord(stats: WordStats | undefined): number {
  return windowForBox(stats?.box)
}
