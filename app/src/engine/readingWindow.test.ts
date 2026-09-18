import { describe, it, expect } from 'vitest'
import type { WordBox, WordStats } from '@shared/src/types'
import { WINDOW_MS_BY_BOX, windowForBox, windowForWord } from './readingWindow'

const BOXES: WordBox[] = [1, 2, 3, 4, 5]

function stats(box: WordBox): WordStats {
  return {
    attempts: 1,
    correct: 1,
    ewmaMs: 1000,
    box,
    dueAt: '2026-01-01',
    lastSeenAt: '2026-01-01T12:00:00.000Z',
  }
}

describe('windowForBox', () => {
  it('starts at ten seconds for a new word', () => {
    expect(windowForBox(1)).toBe(10_000)
  })

  it('gets strictly shorter as the word climbs the boxes', () => {
    for (let i = 1; i < BOXES.length; i++) {
      expect(WINDOW_MS_BY_BOX[BOXES[i]]).toBeLessThan(WINDOW_MS_BY_BOX[BOXES[i - 1]])
    }
  })

  it('never drops below the floor a 9-year-old needs to perceive and say a word', () => {
    // docs/reading-mechanics.md §2: below ~1.8s this stops being a reading exercise
    for (const box of BOXES) expect(windowForBox(box)).toBeGreaterThanOrEqual(1_800)
  })

  it('treats a word with no stats yet as box 1', () => {
    expect(windowForBox(undefined)).toBe(windowForBox(1))
    expect(windowForWord(undefined)).toBe(10_000)
  })

  it('reads the box straight off a word’s stats', () => {
    expect(windowForWord(stats(3))).toBe(WINDOW_MS_BY_BOX[3])
    expect(windowForWord(stats(5))).toBe(WINDOW_MS_BY_BOX[5])
  })
})
