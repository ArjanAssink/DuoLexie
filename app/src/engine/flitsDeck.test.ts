import { describe, it, expect } from 'vitest'
import type { Lesson } from '@shared/src/types'
import { buildFlitsDeck } from './exerciseSelector'
import { allLessons, FLITS_DECK_SIZE } from '../data/path'

function flitsLesson(soundPool: string[], newSounds: string[] = []): Lesson {
  return {
    id: 'test-flitsen',
    unitId: 'test',
    kind: 'les',
    title: 'Flitsen',
    gameType: 'flitsen',
    newSounds,
    soundPool,
    exerciseCount: FLITS_DECK_SIZE,
  }
}

/** The five vowels — the opening unit, whose pool is far shorter than a round. */
const TINY_POOL = ['a', 'e', 'o', 'u', 'i']
/** All of fase 1 plus the long vowels — a pool longer than a round. */
const WIDE_POOL = [
  'a', 'e', 'o', 'u', 'i',
  'b', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z',
  'aa', 'ee', 'oo', 'uu',
]

function adjacentRepeats(deck: string[]): number {
  let n = 0
  for (let i = 1; i < deck.length; i++) if (deck[i] === deck[i - 1]) n++
  return n
}

function counts(deck: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of deck) out[s] = (out[s] ?? 0) + 1
  return out
}

describe('buildFlitsDeck', () => {
  it('deals a full round whether the pool is shorter or longer than it', () => {
    for (let run = 0; run < 30; run++) {
      expect(buildFlitsDeck(flitsLesson(TINY_POOL))).toHaveLength(FLITS_DECK_SIZE)
      expect(buildFlitsDeck(flitsLesson(WIDE_POOL))).toHaveLength(FLITS_DECK_SIZE)
    }
  })

  it('gives every klank in a short pool the same number of turns', () => {
    // 20 cards over 5 vowels is exactly four each; nothing may be over-represented just
    // because the deck is built from repeats of a pool that doesn't divide the round.
    for (let run = 0; run < 30; run++) {
      const deck = buildFlitsDeck(flitsLesson(TINY_POOL))
      expect(Object.values(counts(deck))).toEqual([4, 4, 4, 4, 4])
    }
  })

  it('spreads an awkward ratio evenly (± 1 turn per klank)', () => {
    const pool = ['a', 'e', 'o', 'u', 'i', 'm', 's'] // 20 / 7 = 2 remainder 6
    for (let run = 0; run < 30; run++) {
      const turns = Object.values(counts(buildFlitsDeck(flitsLesson(pool))))
      expect(turns).toHaveLength(pool.length)
      expect(Math.max(...turns) - Math.min(...turns)).toBeLessThanOrEqual(1)
    }
  })

  it('never shows the same card twice in a row', () => {
    for (let run = 0; run < 50; run++) {
      expect(adjacentRepeats(buildFlitsDeck(flitsLesson(TINY_POOL)))).toBe(0)
      expect(adjacentRepeats(buildFlitsDeck(flitsLesson(WIDE_POOL, ['aa', 'ee'])))).toBe(0)
    }
  })

  it('always deals the klanken the lesson introduces, however big the pool', () => {
    // The point of the node. A plain sample of a 26-klank pool would drop one sooner or later.
    for (let run = 0; run < 50; run++) {
      const deck = buildFlitsDeck(flitsLesson(WIDE_POOL, ['aa', 'ee', 'oo', 'uu']))
      for (const s of ['aa', 'ee', 'oo', 'uu']) expect(deck).toContain(s)
    }
  })

  it('deals only klanken from the pool, and copes with an empty one', () => {
    const deck = buildFlitsDeck(flitsLesson(WIDE_POOL, ['aa']))
    for (const s of deck) expect(WIDE_POOL).toContain(s)
    expect(buildFlitsDeck(flitsLesson([]))).toEqual([])
  })

  it('gives every Flitsen node on the real path a twenty-card round', () => {
    const nodes = allLessons.filter((l) => l.gameType === 'flitsen')
    expect(nodes.length).toBeGreaterThan(0)
    for (const lesson of nodes) {
      expect(buildFlitsDeck(lesson)).toHaveLength(FLITS_DECK_SIZE)
    }
  })
})
