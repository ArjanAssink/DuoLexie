import type { Lesson, SoundStats } from '@shared/src/types'
import { confusablesOf, categoryOf } from '../curriculum'
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

/** Flitsen deck: the whole pool shuffled, weak sounds appearing twice */
export function buildFlitsDeck(lesson: Lesson, statsMap: Record<string, SoundStats>): string[] {
  const deck = [...lesson.soundPool]
  for (const s of lesson.soundPool) {
    if (reviewWeight(statsMap[s]) > 3) deck.push(s)
  }
  return shuffle(deck)
}
