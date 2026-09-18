import { describe, it, expect } from 'vitest'
import type { Lesson, WordResult } from '@shared/src/types'
import { computeReward } from './reward'

function lesson(kind: Lesson['kind']): Lesson {
  return {
    id: 'l1',
    unitId: 'u1',
    kind,
    title: 'test',
    gameType: 'flitsen',
    newSounds: [],
    soundPool: [],
    exerciseCount: 0,
  }
}

describe('computeReward', () => {
  it('all-correct is "perfect" and earns the +5 bonus on top of the base 10', () => {
    const r = computeReward(lesson('les'), [{ soundId: 'a', correct: true, ms: 1 }], 0)
    expect(r.gems).toBe(10 + 5)
    expect(r.xp).toBe(11)
    expect(r.perfect).toBe(true)
    expect(r.newRecord).toBe(false)
  })

  it('a wrong answer breaks perfect and does not add to xp', () => {
    const r = computeReward(
      lesson('les'),
      [
        { soundId: 'a', correct: true, ms: 1 },
        { soundId: 'a', correct: false, ms: 1 },
      ],
      0,
    )
    expect(r.perfect).toBe(false)
    expect(r.xp).toBe(11) // 10 + 1 correct, the wrong one doesn't count
    expect(r.gems).toBe(10) // no perfect bonus
  })

  it('eindbaas adds its own bonus on top of perfect', () => {
    const r = computeReward(lesson('eindbaas'), [{ soundId: 'a', correct: true, ms: 1 }], 0)
    expect(r.gems).toBe(10 + 5 + 10) // base + perfect + eindbaas
  })

  it('beating the previous score is the only thing that sets newRecord and its +10', () => {
    const beaten = computeReward(lesson('les'), [], 10, 15)
    const tied = computeReward(lesson('les'), [], 15, 15)
    const noScore = computeReward(lesson('les'), [], 10, undefined)

    expect(beaten.newRecord).toBe(true)
    expect(beaten.gems).toBe(10 + 10) // base + record bonus (no answers, so no perfect bonus)
    expect(tied.newRecord).toBe(false) // equal, not greater, is not a new record
    expect(noScore.newRecord).toBe(false)
  })
})

/** A reading round: `n` words graded, `correct` of them on the "goed" pile. */
function reads(n: number, correct: number): WordResult[] {
  return Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    correct: i < correct,
    ms: 2000,
    withinWindow: true,
  }))
}

describe('computeReward for a reading round', () => {
  const lezen = lesson('les')
  // one record per klank, as Hardop lezen reports them — deliberately inconsistent with the
  // word results below, to prove the word branch is what the numbers come from
  const klanken = [
    { soundId: 'k', correct: true, ms: 700 },
    { soundId: 'a', correct: true, ms: 700 },
    { soundId: 't', correct: true, ms: 700 },
  ]

  it('pays for finishing even when every word went on the "nog even" pile', () => {
    const r = computeReward(lezen, klanken, 0, undefined, reads(10, 0))
    expect(r.gems).toBe(5) // finishing alone — never zero
    expect(r.perfect).toBe(false)
    expect(r.xp).toBe(10)
  })

  it('adds a gem per correct word', () => {
    expect(computeReward(lezen, klanken, 0, undefined, reads(10, 7)).gems).toBe(5 + 7)
  })

  it('tops a perfect round with its bonus, for 18 on ten words', () => {
    const r = computeReward(lezen, klanken, 0, undefined, reads(10, 10))
    expect(r.gems).toBe(5 + 10 + 3)
    expect(r.perfect).toBe(true)
    expect(r.xp).toBe(20)
  })

  it('counts words, not klanken: a round of long words is worth no more than short ones', () => {
    const longWords = [
      { soundId: 'h', correct: true, ms: 900 },
      { soundId: 'e', correct: true, ms: 900 },
      { soundId: 'l', correct: true, ms: 900 },
      { soundId: 'i', correct: true, ms: 900 },
      { soundId: 'k', correct: true, ms: 900 },
      { soundId: 'o', correct: true, ms: 900 },
      { soundId: 'p', correct: true, ms: 900 },
      { soundId: 't', correct: true, ms: 900 },
      { soundId: 'e', correct: true, ms: 900 },
      { soundId: 'r', correct: true, ms: 900 },
    ]
    const short = computeReward(lezen, klanken, 0, undefined, reads(10, 8))
    const long = computeReward(lezen, longWords, 0, undefined, reads(10, 8))
    expect(long.gems).toBe(short.gems)
    expect(long.xp).toBe(short.xp)
  })

  it('is never a new record — a reading round is untimed', () => {
    expect(computeReward(lezen, klanken, 0, 99, reads(10, 10)).newRecord).toBe(false)
  })

  it('leaves the other games on the per-answer formula', () => {
    const r = computeReward(lezen, klanken, 0, undefined, [])
    expect(r.gems).toBe(10 + 5) // empty wordResults is not a reading round
  })
})
