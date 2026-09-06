import type { SessionResult, SoundStats, WordStats } from '@shared/src/types'
import { applyAnswer, emptyStats } from './stats'
import { applyWordResult, emptyWordStats } from './wordStats'
import { localDay } from '../date'

/** docs/backend-readiness.md A2 — the derived-cache shape completeLesson used to build by hand. */

export interface LessonCompletion {
  timesCompleted: number
  bestScore?: number
}

export interface Aggregates {
  gems: number
  xp: number
  completedLessons: Record<string, LessonCompletion>
  soundStats: Record<string, SoundStats>
  wordStats: Record<string, WordStats>
  records: Record<string, number>
  practiceDays: string[]
}

export function emptyAggregates(): Aggregates {
  return {
    gems: 0,
    xp: 0,
    completedLessons: {},
    soundStats: {},
    wordStats: {},
    records: {},
    practiceDays: [],
  }
}

/**
 * Folds one session into an aggregate snapshot. This is the *only* place that logic lives —
 * completeLesson (one session, incrementally) and recomputeFrom (every session, from scratch)
 * both call it, so the two paths can't drift apart the way the same formula duplicated across
 * files already has elsewhere (see code-review-backlog.md's "+10 written twice" item).
 *
 * `session.newRecord` is trusted as-recorded rather than re-derived from `score` here: it's a
 * fact about what happened, decided once by whoever built the session, and replaying should
 * reproduce recorded history, not re-judge it against a replay-order-dependent comparison.
 */
export function applySession(agg: Aggregates, session: SessionResult): Aggregates {
  const now = new Date(session.completedAt)
  const day = localDay(now)

  const soundStats = { ...agg.soundStats }
  for (const answer of session.answers) {
    soundStats[answer.soundId] = applyAnswer(soundStats[answer.soundId] ?? emptyStats(), answer, now)
  }

  const wordStats = { ...agg.wordStats }
  for (const result of session.wordResults ?? []) {
    wordStats[result.wordId] = applyWordResult(
      wordStats[result.wordId] ?? emptyWordStats(day),
      result,
      now,
    )
  }

  const prev = agg.completedLessons[session.lessonId]

  return {
    gems: agg.gems + session.gemsEarned,
    xp: agg.xp + session.xpEarned,
    soundStats,
    wordStats,
    completedLessons: {
      ...agg.completedLessons,
      [session.lessonId]: {
        timesCompleted: (prev?.timesCompleted ?? 0) + 1,
        bestScore: Math.max(prev?.bestScore ?? 0, session.score ?? 0) || undefined,
      },
    },
    records: session.newRecord ? { ...agg.records, [session.lessonId]: session.score! } : agg.records,
    practiceDays: agg.practiceDays.includes(day) ? agg.practiceDays : [...agg.practiceDays, day],
  }
}

/**
 * Rebuilds every aggregate from scratch by replaying the session log in `completedAt` order.
 * Order of the input array doesn't matter — this is what makes multi-device sync safe: union
 * two devices' logs by `id` in any order, recompute, get the same answer either way.
 */
export function recomputeFrom(sessions: SessionResult[]): Aggregates {
  const ordered = [...sessions].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  )
  return ordered.reduce(applySession, emptyAggregates())
}
