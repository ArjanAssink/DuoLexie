import { describe, it, expect } from 'vitest'
import type { Lesson } from '@shared/src/types'
import { buildWordExercises } from './exerciseSelector'

/** The first Lezen node's *strict* pool — exactly five readable words (kat/tas/mat/kok/kus). */
const TINY_POOL = ['a', 'e', 'o', 'u', 'i', 'm', 's', 'k', 'r', 't']
/** All of fase 1 — the Proefronde pool, 38 readable words. */
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
    for (let run = 0; run < 50; run++) {
      const round = buildWordExercises(lezenLesson(TINY_POOL))
      const unique = new Set(round)
      // five readable words -> six cards: every word once, one of them twice
      expect(unique.size).toBe(5)
      expect(round).toHaveLength(6)
      expect(round.length - unique.size).toBe(1)
    }
  })

  it('never places the repeated word back-to-back', () => {
    for (let run = 0; run < 100; run++) {
      expect(adjacentRepeats(buildWordExercises(lezenLesson(TINY_POOL)))).toBe(0)
    }
  })

  it('prefers short words, so a beginner round is never carried by compounds', () => {
    // Fase 1's readable words are 28 three-letter words and then a cliff straight to
    // 8-10-letter compounds (limonade, katapult, helikopter, trampoline) with nothing in
    // between, so "short enough for a beginner round" is a genuinely binary property here.
    // Run it repeatedly: the candidate window is what keeps the compounds out, and a single
    // lucky draw would not prove it.
    for (let run = 0; run < 40; run++) {
      const round = buildWordExercises(lezenLesson(WIDE_POOL))
      const longest = Math.max(...round.map((id) => id.length))
      expect(longest).toBeLessThanOrEqual(5)
    }
  })

  it('returns nothing when no word in the curriculum is readable yet', () => {
    expect(buildWordExercises(lezenLesson(['a', 'e']))).toEqual([])
  })
})
