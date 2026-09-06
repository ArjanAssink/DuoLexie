import { describe, it, expect } from 'vitest'
import type { Lesson } from '@shared/src/types'
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
