import type { Lesson, SoundStats } from '@shared/src/types'
import { confusablesOf, categoryOf } from '../curriculum'
import { wordsForPool } from '../words'
import { reviewWeight } from './stats'

export interface Exercise {
  targetSound: string
  options: string[] // includes targetSound, shuffled
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function weightedSample(items: string[], weightOf: (s: string) => number, count: number): string[] {
  const picked: string[] = []
  const pool = [...items]
  while (picked.length < count && pool.length > 0) {
    const weights = pool.map(weightOf)
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < pool.length; idx++) {
      r -= weights[idx]
      if (r <= 0) break
    }
    idx = Math.min(idx, pool.length - 1)
    picked.push(pool[idx])
    pool.splice(idx, 1) // avoid immediate repeats; refill if pool exhausted
    if (pool.length === 0 && picked.length < count) pool.push(...items)
  }
  return picked
}

/**
 * Distractors: prefer the child's own confusion history, then curriculum
 * confusion pairs, then same-category sounds, then anything in the pool.
 */
export function pickDistractors(
  target: string,
  pool: string[],
  statsMap: Record<string, SoundStats>,
  count: number,
): string[] {
  const candidates = new Set(pool.filter((s) => s !== target))
  const chosen: string[] = []

  const personal = Object.entries(statsMap[target]?.confusions ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => candidates.has(id))
  for (const id of personal) {
    if (chosen.length >= count) break
    chosen.push(id)
    candidates.delete(id)
  }

  for (const id of confusablesOf(target)) {
    if (chosen.length >= count) break
    if (candidates.has(id)) {
      chosen.push(id)
      candidates.delete(id)
    }
  }

  const sameCat = shuffle([...candidates].filter((id) => categoryOf(id).id === categoryOf(target).id))
  for (const id of sameCat) {
    if (chosen.length >= count) break
    chosen.push(id)
    candidates.delete(id)
  }

  for (const id of shuffle([...candidates])) {
    if (chosen.length >= count) break
    chosen.push(id)
  }

  return chosen
}

/**
 * Build a lesson's exercise list: ~70% new/current sounds, 30% weighted review.
 * For herhaling lessons everything is weighted review.
 */
export function buildExercises(
  lesson: Lesson,
  statsMap: Record<string, SoundStats>,
  optionCount = 4,
): Exercise[] {
  const count = lesson.exerciseCount || 10
  const isReview = lesson.newSounds.length === 0

  const newCount = isReview ? 0 : Math.round(count * 0.7)
  const reviewCount = count - newCount

  const targets: string[] = []
  if (newCount > 0) {
    const repeated: string[] = []
    while (repeated.length < newCount) repeated.push(...lesson.newSounds)
    targets.push(...shuffle(repeated.slice(0, newCount)))
  }
  targets.push(
    ...weightedSample(lesson.soundPool, (s) => reviewWeight(statsMap[s]), reviewCount),
  )

  return shuffle(targets).map((targetSound) => ({
    targetSound,
    options: shuffle([
      targetSound,
      ...pickDistractors(targetSound, lesson.soundPool, statsMap, optionCount - 1),
    ]),
  }))
}

/**
 * Places one extra copy of a randomly chosen id so the two copies are never adjacent.
 *
 * Inserting a copy of the id at index `idx` at position `p` puts it next to the original
 * exactly when `p` is `idx` or `idx + 1`, so every other slot is fair game. With two or
 * more distinct ids there is always such a slot; with one there isn't, and a single-word
 * round is left alone rather than shown twice in a row.
 */
function withOneDuplicate(ids: string[]): string[] {
  if (ids.length < 2) return ids
  const idx = Math.floor(Math.random() * ids.length)
  const slots: number[] = []
  for (let p = 0; p <= ids.length; p++) {
    if (p !== idx && p !== idx + 1) slots.push(p)
  }
  const out = [...ids]
  out.splice(slots[Math.floor(Math.random() * slots.length)], 0, ids[idx])
  return out
}

/**
 * Hardop lezen deck: `exerciseCount` cards drawn from the words readable with this lesson's
 * sound pool, biased toward shorter words — a beginner's pool can already contain both "kat"
 * and a 10-letter compound like "helikopter" once all their (short-vowel) klanken are known,
 * and mixing those in the same session skips right past the "4-5 letter words first" ramp.
 * Longer/compound words enter the mix naturally once a unit's short-word supply runs thin.
 *
 * **Every card is a different word** (docs/hardop-lezen-rework.md §4). A pool too small to
 * fill the round yields at most *one* repeated word — a short round, never a second pass
 * over the same words. `data/path.ts` widens a Lezen node's pool precisely so this stays a
 * fallback: on the real path every round is 10 distinct words.
 */
export function buildWordExercises(lesson: Lesson): string[] {
  const eligible = wordsForPool(lesson.soundPool)
  if (eligible.length === 0) return []
  // one duplicate at most, so the round is `pool + 1` long when the pool is the binding limit
  const count = Math.min(lesson.exerciseCount || 10, eligible.length + 1)
  const distinctCount = Math.min(count, eligible.length)
  const byLength = [...eligible].sort((a, b) => a.text.length - b.text.length)
  // Twice the round size, not three times. The window has to stay near the round size for
  // "shortest first" to mean anything: fase 1's readable words are 28 three-letter words
  // and then, with nothing in between, 8-to-10-letter compounds (limonade, helikopter), so
  // at 3x a ten-card round starts serving compounds while short words are still unread.
  const candidates = byLength.slice(0, Math.max(distinctCount * 2, 12))
  const distinct = shuffle(candidates)
    .slice(0, distinctCount)
    .map((w) => w.id)
  return distinct.length < count ? withOneDuplicate(distinct) : distinct
}

/** Flitsen deck (card-flip): the whole pool shuffled, once each — pure exposure, no weighting. */
export function buildFlitsDeck(lesson: Lesson): string[] {
  return shuffle(lesson.soundPool)
}

/** Tijdrit deck: the whole pool shuffled, weak sounds appearing twice */
export function buildTijdritDeck(lesson: Lesson, statsMap: Record<string, SoundStats>): string[] {
  const deck = [...lesson.soundPool]
  for (const s of lesson.soundPool) {
    if (reviewWeight(statsMap[s]) > 3) deck.push(s)
  }
  return shuffle(deck)
}
