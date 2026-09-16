import { describe, it, expect } from 'vitest'
import type { Lesson, Weetje } from '@shared/src/types'
import { allWeetjes, boldSegments, dealableWeetjes, dealWeetjes, narrationLines } from '../../src/weetjes'
import { computeReward, WEETJE_GEMS, WEETJE_XP } from '../../src/engine/reward'
import { allLessons, WEETJE_CARD_COUNT } from '../../src/data/path'

/*
 * The content file is the part of this feature that a person edits by hand, months from now,
 * without reading the spec again — so the limits and the shape of a card are checked here
 * rather than trusted. docs/weetjes.md §10.1.
 *
 * Two of the numbers deliberately differ from §3, because §4's copy is final and §3's limits
 * were written before it: `fact` runs to 18 words rather than 12 (`grote-geheel`, whose
 * "vertellen dat" hedge is mandatory and costs words), and a `reveal` may be three sentences
 * rather than two, because almost every reveal opens with "Niet waar!" as a sentence of its
 * own. Both are recorded as deviations in docs/weetjes.md.
 */
const MAX_FACT_WORDS = 18
const MAX_PROMPT_WORDS = 10
const MAX_OPTION_WORDS = 3
const MAX_REVEAL_WORDS = 20
const MAX_REVEAL_SENTENCES = 3

function words(text: string): string[] {
  return plain(text).split(/\s+/).filter(Boolean)
}

function plain(text: string): string {
  return text.replace(/\*/g, '')
}

function sentences(text: string): string[] {
  return plain(text)
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
}

/** Cards with copy in them. The nl-1/nl-2 placeholders are checked separately, below. */
const written: Weetje[] = allWeetjes.filter((w) => w.fact !== '')

function weetjeLesson(): Lesson {
  const lesson = allLessons.find((l) => l.kind === 'weetje')
  if (!lesson) throw new Error('the path has no Weetje node')
  return lesson
}

describe('weetjes.json', () => {
  it('has unique ids and unique deal orders', () => {
    expect(new Set(allWeetjes.map((w) => w.id)).size).toBe(allWeetjes.length)
    expect(new Set(allWeetjes.map((w) => w.order)).size).toBe(allWeetjes.length)
  })

  it('keeps every sentence inside the length it can be read at', () => {
    for (const w of written) {
      expect(words(w.fact).length, `${w.id} fact`).toBeLessThanOrEqual(MAX_FACT_WORDS)
      expect(words(w.reveal).length, `${w.id} reveal`).toBeLessThanOrEqual(MAX_REVEAL_WORDS)
      expect(sentences(w.reveal).length, `${w.id} reveal`).toBeLessThanOrEqual(MAX_REVEAL_SENTENCES)
      const prompt = w.statement ?? w.question ?? ''
      expect(words(prompt).length, `${w.id} prompt`).toBeLessThanOrEqual(MAX_PROMPT_WORDS)
      for (const option of w.options ?? []) {
        expect(words(option).length, `${w.id} option "${option}"`).toBeLessThanOrEqual(MAX_OPTION_WORDS)
      }
    }
  })

  it('carries the fields its type actually uses, and nothing it does not', () => {
    for (const w of written) {
      if (w.type === 'waar-niet-waar') {
        expect(w.statement, w.id).toBeTruthy()
        expect(typeof w.answer, w.id).toBe('boolean')
        expect(w.question, w.id).toBeNull()
        expect(w.options, w.id).toBeNull()
        expect(w.correct, w.id).toBeNull()
      } else {
        expect(w.question, w.id).toBeTruthy()
        expect(w.options, w.id).toHaveLength(3)
        expect(w.correct, w.id).toBeGreaterThanOrEqual(0)
        expect(w.correct, w.id).toBeLessThanOrEqual(2)
        expect(w.statement, w.id).toBeNull()
        expect(w.answer, w.id).toBeNull()
      }
      expect(w.reveal, w.id).toBeTruthy()
      expect(w.tile, w.id).toBeTruthy()
    }
  })

  it('never ships a card without a source a parent could open', () => {
    for (const w of written) expect(w.source, w.id).toMatch(/^https:\/\//)
    // A placeholder has no copy and no source, and must never be dealt either.
    for (const w of allWeetjes) if (w.fact === '') expect(w.reviewed, w.id).toBe(false)
  })

  it('balances every bold marker, at most one per sentence', () => {
    for (const w of written) {
      for (const field of [w.fact, w.statement ?? '', w.question ?? '', w.reveal]) {
        const stars = (field.match(/\*/g) ?? []).length
        expect(stars % 2, `${w.id}: "${field}"`).toBe(0)
        // round-trips: the segments joined back together are the original text
        expect(boldSegments(field).map((s) => s.text).join('')).toBe(plain(field))
        for (const sentence of field.split(/(?<=[.!?])\s+/)) {
          const bold = (sentence.match(/\*[^*]+\*/g) ?? []).length
          expect(bold, `${w.id}: "${sentence}"`).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is never shown copy that was not reviewed', () => {
    for (const w of dealableWeetjes) {
      expect(w.reviewed, w.id).toBe(true)
      expect(w.fact, w.id).not.toBe('')
    }
  })

  it('narrates every part of every dealable card, so it plays without reading', () => {
    for (const w of dealableWeetjes) {
      for (const part of ['fact', 'doe', 'reveal'] as const) {
        const lines = narrationLines(w, part)
        expect(lines.length, `${w.id} ${part}`).toBeGreaterThan(0)
        for (const line of lines) expect(line.trim(), `${w.id} ${part}`).not.toBe('')
        // the markers are markup, not speech
        for (const line of lines) expect(line).not.toContain('*')
      }
    }
    // a kies card is read as question + its three options, in order (§6)
    const kies = dealableWeetjes.find((w) => w.type !== 'waar-niet-waar')!
    expect(narrationLines(kies, 'doe')).toEqual([
      kies.question!.replace(/\*/g, ''),
      ...kies.options!,
    ])
  })
})

describe('dealing', () => {
  it('deals the lowest-order cards she has not collected yet', () => {
    const deck = dealWeetjes([], 2)
    expect(deck.map((w) => w.id)).toEqual(dealableWeetjes.slice(0, 2).map((w) => w.id))
  })

  it('skips cards that have not been reviewed', () => {
    const unreviewed = allWeetjes.filter((w) => !w.reviewed).map((w) => w.id)
    const everything = dealWeetjes([], allWeetjes.length)
    for (const id of unreviewed) expect(everything.map((w) => w.id)).not.toContain(id)
  })

  it('moves on past what she already has', () => {
    const first = dealableWeetjes[0].id
    const deck = dealWeetjes([first], 2)
    expect(deck.map((w) => w.id)).toEqual(dealableWeetjes.slice(1, 3).map((w) => w.id))
  })

  it('re-deals the ones she met longest ago once she has them all', () => {
    // collected in reverse order: the *last* card of the set is the one she saw first
    const collected = [...dealableWeetjes].reverse().map((w) => w.id)
    const deck = dealWeetjes(collected, 2)
    expect(deck).toHaveLength(2)
    expect(deck.map((w) => w.id)).toEqual(collected.slice(0, 2))
  })

  it('never comes back empty while a reviewed card exists', () => {
    expect(dealableWeetjes.length).toBeGreaterThan(0)
    const collected = dealableWeetjes.map((w) => w.id)
    expect(dealWeetjes(collected, WEETJE_CARD_COUNT)).toHaveLength(WEETJE_CARD_COUNT)
    expect(dealWeetjes([], WEETJE_CARD_COUNT)).toHaveLength(WEETJE_CARD_COUNT)
  })
})

describe('the path', () => {
  it('gives every unit one Weetje node, last, after the Lezen node', () => {
    const units = new Map<string, typeof allLessons>()
    for (const lesson of allLessons) {
      units.set(lesson.unitId, [...(units.get(lesson.unitId) ?? []), lesson])
    }
    expect(units.size).toBeGreaterThan(0)
    for (const [unitId, lessons] of units) {
      const weetjes = lessons.filter((l) => l.kind === 'weetje')
      expect(weetjes, unitId).toHaveLength(1)
      expect(lessons[lessons.length - 1].kind, unitId).toBe('weetje')
      expect(weetjes[0].gameType, unitId).toBe('weetjes')
      expect(weetjes[0].exerciseCount, unitId).toBe(WEETJE_CARD_COUNT)
    }
  })
})

describe('computeReward for a weetje node', () => {
  it('pays a flat rate, whatever she answered', () => {
    const lesson = weetjeLesson()
    const nothing = computeReward(lesson, [], 0)
    const everythingRight = computeReward(
      lesson,
      [{ soundId: 'a', correct: true, ms: 100 }],
      0,
    )
    const everythingWrong = computeReward(
      lesson,
      [{ soundId: 'a', correct: false, ms: 100 }],
      0,
    )
    for (const reward of [nothing, everythingRight, everythingWrong]) {
      expect(reward).toEqual({
        gems: WEETJE_GEMS,
        xp: WEETJE_XP,
        perfect: false,
        newRecord: false,
      })
    }
  })

  it('is never scored, even if a score somehow reaches it', () => {
    const reward = computeReward(weetjeLesson(), [], 0, 120)
    expect(reward.newRecord).toBe(false)
    expect(reward.gems).toBe(WEETJE_GEMS)
  })
})
