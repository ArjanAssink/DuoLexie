import { describe, it, expect } from 'vitest'
import type { Lesson } from '@shared/src/types'
import { buildWordExercises } from './exerciseSelector'
import { wordsForPool } from '../words'

/**
 * A deliberately narrow pool, used only to make the round longer than the words available.
 * How many words it yields is read from the curriculum rather than written down here: an
 * earlier version of these tests hard-coded "five readable words", which quietly stopped
 * exercising the duplicate branch at all the moment more words were added to words.json.
 */
const NARROW_POOL = ['a', 'k', 't', 's']
/** All of fase 1 — the Proefronde pool. */
const WIDE_POOL = [
  'a', 'e', 'o', 'u', 'i',
  'b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z',
]

function lezenLesson(soundPool: string[], exerciseCount = 10): Lesson {
  return {
    id: 'test-lezen',
    unitId: 'test',
    kind: 'les',
    title: 'Lezen',
    gameType: 'hardop-lezen',
    newSounds: [],
    soundPool,
    exerciseCount,
  }
}

function adjacentRepeats(ids: string[]): number {
  let n = 0
  for (let i = 1; i < ids.length; i++) if (ids[i] === ids[i - 1]) n++
  return n
}

describe('buildWordExercises', () => {
  it('gives ten different words when the pool can fill a round', () => {
    for (let run = 0; run < 30; run++) {
      const round = buildWordExercises(lezenLesson(WIDE_POOL))
      expect(round).toHaveLength(10)
      expect(new Set(round).size).toBe(10)
    }
  })

  it('repeats at most one word when the pool is too small, never a second pass', () => {
    const available = wordsForPool(NARROW_POOL).length
    expect(available, 'the pool must be smaller than the round for this to test anything')
      .toBeLessThan(10)
    // ask for more cards than there are words, so the pool is what binds
    const lesson = lezenLesson(NARROW_POOL, available + 5)

    for (let run = 0; run < 50; run++) {
      const round = buildWordExercises(lesson)
      const unique = new Set(round)
      // every word once, exactly one of them twice — never a second pass over the pool
      expect(unique.size).toBe(available)
      expect(round).toHaveLength(available + 1)
      expect(round.length - unique.size).toBe(1)
    }
  })

  it('never places the repeated word back-to-back', () => {
    const available = wordsForPool(NARROW_POOL).length
    const lesson = lezenLesson(NARROW_POOL, available + 5)
    for (let run = 0; run < 100; run++) {
      expect(adjacentRepeats(buildWordExercises(lesson))).toBe(0)
    }
  })

  it('prefers short words, so a beginner round is never carried by compounds', () => {
    // Fase 1 reaches from three-letter words up to 10-letter compounds (limonade,
    // helikopter, trampoline). The candidate window is what keeps the long end out of a
    // beginner round; run it repeatedly, since a single lucky draw would not prove it.
    for (let run = 0; run < 40; run++) {
      const round = buildWordExercises(lezenLesson(WIDE_POOL))
      const longest = Math.max(...round.map((id) => id.length))
      expect(longest).toBeLessThanOrEqual(5)
    }
  })

  it('returns nothing when no word in the curriculum is readable yet', () => {
    expect(buildWordExercises(lezenLesson(['a', 'e']))).toEqual([])
  })

  it('fills a round with recorded words first, then falls back to the rest', () => {
    const someRecorded = ['kat', 'tas', 'mat', 'pan', 'bed']
    const round = buildWordExercises(lezenLesson(WIDE_POOL), (id) => someRecorded.includes(id))
    // every recorded word that fits is used before any unrecorded one is reached for
    expect(round.slice(0, 5).sort()).toEqual([...someRecorded].sort())
    expect(round).toHaveLength(10)
    expect(new Set(round).size).toBe(10)
  })

  it('is unchanged when nothing is recorded yet — today\'s state', () => {
    const round = buildWordExercises(lezenLesson(WIDE_POOL), () => false)
    expect(round).toHaveLength(10)
    expect(new Set(round).size).toBe(10)
  })
})
