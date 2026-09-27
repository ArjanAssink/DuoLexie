import spellingJson from '@shared/curriculum/spelling.json'
import type {
  SpellingCurriculum,
  SpellingPair,
  SpellingStrategy,
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
 * The `korter` badge's first step — RID's cht/gt test, which is the same move in the other
 * direction: take the `t` off, say what is left, and hear whether it is still the word.
 */
export const KORTER_PROMPT = 'Haal de t eraf. Zeg het maar.'

/** Whether a strategy asks her to produce something before it tells (§4). */
export function hasPrompt(strategy: SpellingStrategy): boolean {
  return strategy === 'langer' || strategy === 'korter'
}

/**
 * What the badge actually says out loud when she taps it, and what one `<pairId>-regel.mp3`
 * has to contain (§10).
 *
 * One clip id for all strategies rather than one per: a pair only ever speaks one of these —
 * a `langer` or `korter` pair asks, a `regel` pair tells — so a second id would be a clip
 * that is recorded and never played. The pair's own `rule` is still shown in the bubble for
 * an asking pair; it is the written reminder behind the question, not a second thing said.
 */
export function strategyLine(pair: SpellingPair): string {
  switch (pair.strategy) {
    case 'langer': return LANGER_PROMPT
    case 'korter': return KORTER_PROMPT
    default: return pair.rule
  }
}

/**
 * The word with its `t` taken off — `vliegt → vlieg`, `tocht → toch`. Derived from the
 * card rather than stored per word: it is the same operation for every word in the pair,
 * which is exactly the point of the test (§4).
 */
export function korterForm(word: SpellingWord): string {
  return word.stem + word.ending.replace(/t$/, '')
}

/**
 * What the `korter` reveal says: the shortened word, and the verdict the test gives. For
 * `gt` what is left is still the same word; for `cht` it is not — a different word
 * (*toch*) or no word at all (*luch*). "Nee" covers both: telling a child that *luch* is
 * not a word while *toch* is would be a second lesson on top of the one she asked for.
 */
export function korterLine(word: SpellingWord): string {
  const shorter = korterForm(word)
  return word.ending === 'gt'
    ? `${shorter}. Ja, nog hetzelfde woord, dus gt.`
    : `${shorter}. Nee, dat is een ander woord, dus cht.`
}

/** What the reveal step prints under the stem: the produced form, if the strategy has one. */
export function revealForm(pair: SpellingPair, word: SpellingWord): string | null {
  return pair.strategy === 'korter' ? korterForm(word) : word.langer
}

/**
 * What the reveal step says out loud, and the clip it plays if one is recorded: the longer
 * form for `langer`, the shortened word plus its verdict for `korter`, and for `regel` the
 * word's own `langer` when it has one, else the rule (§4, §10).
 */
export function revealSpeech(
  pair: SpellingPair,
  word: SpellingWord,
): { clipId: string; text: string } {
  if (pair.strategy === 'korter') {
    return { clipId: korterClipId(word.wordId), text: korterLine(word) }
  }
  if (word.langer) return { clipId: langerClipId(word.wordId), text: word.langer }
  return { clipId: regelClipId(pair.id), text: pair.rule }
}

/** `<wordId>-langer` — the clip that speaks a word's longer form (§10). */
export function langerClipId(wordId: string): string {
  return `${wordId}-langer`
}

/** `<wordId>-korter` — the clip that speaks a word without its `t`, and the verdict (§10). */
export function korterClipId(wordId: string): string {
  return `${wordId}-korter`
}

/** `<pairId>-regel` — the clip that speaks a pair's rule (§10). */
export function regelClipId(pairId: string): string {
  return `${pairId}-regel`
}
