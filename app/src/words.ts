import wordsJson from '@shared/curriculum/words.json'
import type { Word, WordCurriculum } from '@shared/src/types'

export const words: Word[] = (wordsJson as WordCurriculum).words

const wordById = new Map(words.map((w) => [w.id, w]))

export function getWord(id: string): Word {
  const word = wordById.get(id)
  if (!word) throw new Error(`Unknown word id: ${id}`)
  return word
}

/** Words readable once every klank they contain is in the given (cumulative) sound pool. */
export function wordsForPool(pool: string[]): Word[] {
  const known = new Set(pool)
  return words.filter((w) => w.klanken.every((k) => known.has(k)))
}

/**
 * Word ids that have a real recorded clip, as of this build (see vite.config.ts). Everything
 * else falls back to browser speech synthesis in `playWord`.
 */
const recorded = new Set(__RECORDED_WORDS__)

export function hasWordRecording(id: string): boolean {
  return recorded.has(id)
}

/** How many of the given words are recorded — for the studio's progress line. */
export function recordedCount(ids: string[]): number {
  return ids.filter((id) => recorded.has(id)).length
}
