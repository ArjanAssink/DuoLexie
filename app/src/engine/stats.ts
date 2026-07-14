import type { AnswerRecord, Mastery, SoundStats } from '@shared/src/types'

export function emptyStats(): SoundStats {
  return {
    attempts: 0,
    correct: 0,
    ewmaAccuracy: 0.5,
    ewmaResponseMs: 4000,
    lastSeenAt: null,
    confusions: {},
  }
}

const ALPHA = 0.2 // EWMA smoothing: last ~10 exposures dominate

export function applyAnswer(stats: SoundStats, answer: AnswerRecord): SoundStats {
  const next: SoundStats = {
    ...stats,
    attempts: stats.attempts + 1,
    correct: stats.correct + (answer.correct ? 1 : 0),
    ewmaAccuracy: stats.ewmaAccuracy * (1 - ALPHA) + (answer.correct ? 1 : 0) * ALPHA,
    ewmaResponseMs: stats.ewmaResponseMs * (1 - ALPHA) + answer.ms * ALPHA,
    lastSeenAt: new Date().toISOString(),
    confusions: { ...stats.confusions },
  }
  if (!answer.correct && answer.confusedWith) {
    next.confusions[answer.confusedWith] = (next.confusions[answer.confusedWith] ?? 0) + 1
  }
  return next
}

export function masteryOf(stats: SoundStats | undefined): Mastery {
  if (!stats || stats.attempts === 0) return 'nieuw'
  if (stats.attempts < 5 || stats.ewmaAccuracy < 0.9) return 'leren'
  if (stats.ewmaResponseMs < 2000) return 'goud'
  return 'geleerd'
}

/**
 * Review weight per the plan: 1 + 3·(1−accuracy) + 2·slowness + staleness.
 * Higher weight = more likely to be picked for review.
 */
export function reviewWeight(stats: SoundStats | undefined): number {
  if (!stats || stats.attempts === 0) return 2 // unseen sounds deserve attention too
  const slowness = Math.min(1, Math.max(0, (stats.ewmaResponseMs - 1500) / 4000))
  const daysAgo = stats.lastSeenAt
    ? (Date.now() - new Date(stats.lastSeenAt).getTime()) / 86400000
    : 7
  const staleness = Math.min(1, daysAgo / 7)
  return 1 + 3 * (1 - stats.ewmaAccuracy) + 2 * slowness + staleness
}
