import { describe, it, expect } from 'vitest'
import type { SessionResult } from '@shared/src/types'
import { applySession, emptyAggregates, recomputeFrom } from './recompute'

function session(id: string, overrides: Partial<SessionResult>): SessionResult {
  return {
    id,
    lessonId: 'fase1-u1-l1',
    completedAt: '2026-01-01T10:00:00.000Z',
    answers: [],
    xpEarned: 10,
    gemsEarned: 10,
    ...overrides,
  }
}

// Three sessions touching two different lessons, an EWMA-sensitive sound seen twice, a
// record set then beaten, and a word read — enough surface to catch a real divergence.
const sessions: SessionResult[] = [
  session('s1', {
    completedAt: '2026-01-01T10:00:00.000Z',
    lessonId: 'fase1-u1-l1',
    answers: [{ soundId: 'a', correct: true, ms: 800 }],
    xpEarned: 11,
    gemsEarned: 10,
  }),
  session('s2', {
    completedAt: '2026-01-02T10:00:00.000Z',
    lessonId: 'fase1-u1-l2',
    answers: [{ soundId: 'a', correct: false, ms: 1200, confusedWith: 'e' }],
    score: 20,
    newRecord: true,
    xpEarned: 10,
    gemsEarned: 20, // includes the +10 new-record bonus, as completeLesson computes it
  }),
  session('s3', {
    completedAt: '2026-01-03T10:00:00.000Z',
    lessonId: 'fase1-u1-l2',
    answers: [{ soundId: 'a', correct: true, ms: 900 }],
    wordResults: [{ wordId: 'kat', correct: true, ms: 2000, withinWindow: true }],
    spellingResults: [
      { wordId: 'hond', correct: false },
      { wordId: 'kast', correct: true },
    ],
    score: 25,
    newRecord: true,
    xpEarned: 11,
    gemsEarned: 20,
  }),
]

describe('recomputeFrom', () => {
  it('reproduces exactly what folding sessions one at a time produces', () => {
    const incremental = sessions.reduce(applySession, emptyAggregates())
    expect(recomputeFrom(sessions)).toEqual(incremental)
  })

  it('does not depend on input order — required for merging two devices logs by id', () => {
    const forward = recomputeFrom(sessions)
    const shuffled = recomputeFrom([sessions[2], sessions[0], sessions[1]])
    expect(shuffled).toEqual(forward)
  })

  it('sums gems/xp, keeps the max score as the record, and counts completions per lesson', () => {
    const result = recomputeFrom(sessions)
    expect(result.gems).toBe(10 + 20 + 20)
    expect(result.xp).toBe(11 + 10 + 11)
    expect(result.records['fase1-u1-l2']).toBe(25)
    expect(result.completedLessons['fase1-u1-l2'].timesCompleted).toBe(2)
    expect(result.completedLessons['fase1-u1-l2'].bestScore).toBe(25)
    expect(result.wordStats['kat'].attempts).toBe(1)
  })
})

/**
 * Spelling history is its own aggregate, deliberately apart from `wordStats`
 * (docs/maak-het-woord-af.md §5): those are the reading-speed Leitner boxes, and how she
 * spells a word says nothing about how fast she reads it.
 */
describe('spellingStats', () => {
  it('counts a sighting and a miss per word', () => {
    const agg = recomputeFrom(sessions)
    expect(agg.spellingStats.hond).toEqual({ seen: 1, missed: 1 })
    expect(agg.spellingStats.kast).toEqual({ seen: 1, missed: 0 })
  })

  it('adds up over sessions', () => {
    const later = session('s4', {
      completedAt: '2026-01-04T10:00:00.000Z',
      spellingResults: [{ wordId: 'hond', correct: true }],
    })
    const agg = recomputeFrom([...sessions, later])
    expect(agg.spellingStats.hond).toEqual({ seen: 2, missed: 1 })
  })

  it('never touches wordStats — spelling a word is not reading it', () => {
    const only = session('s5', {
      spellingResults: [{ wordId: 'hond', correct: false }],
    })
    const agg = applySession(emptyAggregates(), only)
    expect(agg.wordStats).toEqual({})
    expect(agg.spellingStats.hond).toEqual({ seen: 1, missed: 1 })
  })

  it('starts empty and stays empty for a session that spelled nothing', () => {
    expect(emptyAggregates().spellingStats).toEqual({})
    expect(applySession(emptyAggregates(), session('s6', {})).spellingStats).toEqual({})
  })
})
