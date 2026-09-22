import spellingJson from '@shared/curriculum/spelling.json'
import type {
  SpellingCurriculum,
  SpellingPair,
  SpellingWord,
} from '@shared/src/types'
import { getWord } from './words'

/** Everything in the file, including the words that are not cleared to be dealt. */
const curriculum = spellingJson as SpellingCurriculum

export const spellingPairs: SpellingPair[] = curriculum.pairs
export const allSpellingWords: SpellingWord[] = curriculum.words

const pairById = new Map(spellingPairs.map((p) => [p.id, p]))
const wordByIdAndPair = new Map(allSpellingWords.map((w) => [`${w.pair}/${w.wordId}`, w]))

export function getSpellingPair(id: string): SpellingPair | undefined {
  return pairById.get(id)
}

export function getSpellingWord(pairId: string, wordId: string): SpellingWord | undefined {
  return wordByIdAndPair.get(`${pairId}/${wordId}`)
}

/**
 * The words that may actually be dealt — exactly the Weetjes rule (docs/weetjes.md §3,
 * docs/maak-het-woord-af.md §6 rule 5). A misspelling shown to a child with dyslexia as if
 * it were right is worse than no card at all, and a `langer` form that turns out to be
 * wrong teaches the strategy wrong. Arjan flips the flag per word.
 */
export const dealableSpellingWords: SpellingWord[] = allSpellingWords.filter((w) => w.reviewed)

/**
 * The pair's dealable words she can actually read: every klank of the word is in the pool.
 *
 * The same readability test `wordsForPool` applies, deliberately — a spelling card shows
 * the word's stem, so a word she cannot read is a word she cannot spell from a stem either.
 *
 * `words` lets a test (and the path builder, which needs the *draft* words to be visible in
 * its own unit test) ask the question of a different set than the dealable one.
 */
export function spellingWordsForPool(
  pairId: string,
  pool: string[],
  words: SpellingWord[] = dealableSpellingWords,
): SpellingWord[] {
  const known = new Set(pool)
  return words.filter(
    (w) => w.pair === pairId && getWord(w.wordId).klanken.every((k) => known.has(k)),
  )
}

/**
 * The `langer` badge's first step: Frida asks, and then waits. The move RID teaches is that
 * *she* produces the longer word, so the badge asks before it tells (§4). A `regel` pair
 * has no first step — there is nothing for her to produce — and goes straight to the rule.
 */
export const LANGER_PROMPT = 'Maak het woord langer. Zeg het maar.'

/**
 * What the badge actually says out loud when she taps it, and what one `<pairId>-regel.mp3`
 * has to contain (§10).
 *
 * One clip id for both strategies rather than two: a pair only ever speaks one of these —
 * a `langer` pair asks, a `regel` pair tells — so a second id would be a clip that is
 * recorded and never played. The pair's own `rule` is still shown in the bubble for a
 * `langer` pair; it is the written reminder behind the question, not a second thing said.
 */
export function strategyLine(pair: SpellingPair): string {
  return pair.strategy === 'langer' ? LANGER_PROMPT : pair.rule
}

/** `<wordId>-langer` — the clip that speaks a word's longer form (§10). */
export function langerClipId(wordId: string): string {
  return `${wordId}-langer`
}

/** `<pairId>-regel` — the clip that speaks a pair's rule (§10). */
export function regelClipId(pairId: string): string {
  return `${pairId}-regel`
}
