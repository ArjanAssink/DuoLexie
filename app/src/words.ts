import wordsJson from '@shared/curriculum/words.json'
import type { Word, WordCurriculum } from '@shared/src/types'
import { recordedWords } from 'virtual:recorded-audio'

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
 * Word ids that have a real recorded clip. Everything else falls back to browser speech
 * synthesis in `playWord`.
 *
 * The Set comes from `virtual:recorded-audio`, which the studio plugin generates by reading
 * `public/audio/words/` — and, in dev, refills in place the moment a clip is written there
 * (docs/recording-studio-v3.md §3.2). It used to be a build-time constant, which meant a word
 * recorded during a session was ignored until the dev server was restarted: the last step of
 * the recording loop was "and now restart Vite", which is exactly the kind of step that
 * stops a loop being run three times in an evening. In a production build it is a constant
 * again, read when the bundle is made.
 */
export function hasWordRecording(id: string): boolean {
  return recordedWords.has(id)
}

/** How many of the given words are recorded — for the studio's progress line. */
export function recordedCount(ids: string[]): number {
  return ids.filter((id) => recordedWords.has(id)).length
}
