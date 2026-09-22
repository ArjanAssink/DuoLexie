import { describe, it, expect } from 'vitest'
import type { Lesson, SpellingStats } from '@shared/src/types'
import { GAP_SLACK_PX, overGap, requeue, type Box } from './spelling'
import { buildSpellingRound } from './exerciseSelector'
import { allSpellingWords, spellingPairs, spellingWordsForPool } from '../spelling'
import { words } from '../words'

// ---------------------------------------------------------------- §3, the gesture

const GAP: Box = { left: 100, top: 100, width: 40, height: 30 }

/** A tile of the game's real size, placed so its *centre* lands on (cx, cy). */
function tileAt(cx: number, cy: number): Box {
  return { left: cx - 48, top: cy - 40, width: 96, height: 80 }
}

describe('overGap', () => {
  it('is true when the tile centre is inside the gap', () => {
    expect(overGap(tileAt(120, 115), GAP)).toBe(true)
  })

  it('is true right on the slack edge, on every side', () => {
    const slack = GAP_SLACK_PX
    expect(overGap(tileAt(GAP.left - slack, 115), GAP)).toBe(true)
    expect(overGap(tileAt(GAP.left + GAP.width + slack, 115), GAP)).toBe(true)
    expect(overGap(tileAt(120, GAP.top - slack), GAP)).toBe(true)
    expect(overGap(tileAt(120, GAP.top + GAP.height + slack), GAP)).toBe(true)
  })

  it('is false one pixel past the slack', () => {
    const slack = GAP_SLACK_PX
    expect(overGap(tileAt(GAP.left - slack - 1, 115), GAP)).toBe(false)
    expect(overGap(tileAt(120, GAP.top + GAP.height + slack + 1), GAP)).toBe(false)
  })

  it('reads the centre, not an overlap: a tile is wider than the gap', () => {
    // A tile still sitting in its slot 150px below overlaps nothing, but a rectangle-
    // intersection test on a 96×80 tile against a gap grown by 24 would say otherwise.
    expect(overGap(tileAt(120, 265), GAP)).toBe(false)
  })
})

// ---------------------------------------------------------------- §5, the re-queue

describe('requeue', () => {
  const queue = ['a', 'b', 'c', 'd', 'e', 'f']

  it('puts the word back three positions later', () => {
    expect(requeue(queue, 0, 'a')).toEqual(['a', 'b', 'c', 'a', 'd', 'e', 'f'])
  })

  it('works from the middle', () => {
    expect(requeue(queue, 2, 'c')).toEqual(['a', 'b', 'c', 'd', 'e', 'c', 'f'])
  })

  it('appends when there is less than a gap left', () => {
    expect(requeue(queue, 4, 'e')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'e'])
  })

  it('appends when the word is already the last card', () => {
    // A word missed on the last card still gets its second showing — that is the whole
    // point of re-queueing it.
    expect(requeue(queue, 5, 'f')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'f'])
  })

  it('leaves the original queue alone', () => {
    const before = [...queue]
    requeue(queue, 1, 'b')
    expect(queue).toEqual(before)
  })
})

// ---------------------------------------------------------------- §6, the content file

const wordIds = new Set(words.map((w) => w.id))
const wordTextById = new Map(words.map((w) => [w.id, w.text]))
const pairIds = new Set(spellingPairs.map((p) => p.id))

/**
 * Words whose *other* spelling is also a real Dutch word, so the spoken word alone cannot
 * say which is meant (§6 rule 3). None of them may be in the file without a `zin`, and the
 * first release ships no `zin` items — so in practice none of them may be in the file.
 *
 * Written down rather than inferred: there is no Dutch dictionary in this repo, and the
 * check that *can* be mechanical (is the other spelling a word the app itself knows?) would
 * catch none of these — `hard`, `nood` and `liet` are perfectly ordinary words that simply
 * happen not to be on the reading list. The list is the review, and this test is what keeps
 * a later batch from quietly re-adding one.
 *
 * The 13 below were in the spec's own §6.1 draft and were dropped when this was built;
 * `licht`/`ligt` the spec had already excluded for the same reason.
 */
const BOTH_SPELLINGS_REAL: Record<string, string> = {
  hart: 'hard', wind: 'wint', veld: 'velt', held: 'helt', paard: 'paart',
  maand: 'maant', baard: 'baart', lied: 'liet', boot: 'bood', voet: 'voed',
  noot: 'nood', laat: 'laad', band: 'bant', licht: 'ligt', ligt: 'licht',
}

describe('shared/curriculum/spelling.json', () => {
  it('has at least the two pairs the first release is about', () => {
    expect(pairIds).toContain('d-t')
    expect(pairIds).toContain('cht-gt')
  })

  it('gives every pair two options, a strategy and something it needs taught first', () => {
    for (const pair of spellingPairs) {
      expect(pair.options, pair.id).toHaveLength(2)
      expect(new Set(pair.options).size, pair.id).toBe(2)
      expect(['langer', 'regel'], pair.id).toContain(pair.strategy)
      expect(pair.rule.length, pair.id).toBeGreaterThan(10)
      expect(pair.needs.length, pair.id).toBeGreaterThan(0)
    }
  })

  it('has unique pair ids and never the same word twice in a pair', () => {
    expect(pairIds.size).toBe(spellingPairs.length)
    const keys = allSpellingWords.map((w) => `${w.pair}/${w.wordId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  // rule 1
  it('only names words that are in words.json', () => {
    for (const word of allSpellingWords) {
      expect(wordIds.has(word.wordId), `${word.wordId} is not in words.json`).toBe(true)
      expect(pairIds.has(word.pair), `${word.wordId} has no pair`).toBe(true)
    }
  })

  // rule 2
  it('spells each word as stem + ending, with the ending one of the pair options', () => {
    for (const word of allSpellingWords) {
      const pair = spellingPairs.find((p) => p.id === word.pair)!
      expect(word.stem + word.ending, word.wordId).toBe(wordTextById.get(word.wordId))
      expect(pair.options, word.wordId).toContain(word.ending)
      expect(word.stem.length, word.wordId).toBeGreaterThan(0)
    }
  })

  // rule 3
  it('never offers two spellings that are both real words, unless the item has a zin', () => {
    for (const word of allSpellingWords) {
      if (word.zin) continue
      expect(
        BOTH_SPELLINGS_REAL[word.wordId],
        `${word.wordId}/${BOTH_SPELLINGS_REAL[word.wordId]} are homophones — it needs a zin`,
      ).toBeUndefined()
      const pair = spellingPairs.find((p) => p.id === word.pair)!
      for (const option of pair.options) {
        if (option === word.ending) continue
        const other = word.stem + option
        // The mechanical half: the wrong spelling must not be a word the app itself
        // teaches. It catches the case the hand-written list above cannot — a word added
        // to words.json later that turns an existing item into a homophone pair.
        expect(wordIds.has(other), `${word.wordId}: "${other}" is also in words.json`).toBe(false)
      }
    }
  })

  // rule 4
  it('gives a longer form to every word that has one, and none to the ones that do not', () => {
    for (const word of allSpellingWords) {
      if (word.ending === 'cht') {
        expect(word.langer, word.wordId).toBeNull()
      } else {
        expect(word.langer, `${word.wordId} needs a langer`).toBeTruthy()
        expect(word.langer, word.wordId).not.toBe(wordTextById.get(word.wordId))
      }
    }
  })

  // rule 5
  it('carries an explicit reviewed flag on every word', () => {
    // Deliberately *not* asserting that they are all still false. Reviewing the seed list
    // is Arjan's next move (§12.1), and a test that went red the day he did it would be a
    // tripwire across the one path this feature is waiting on.
    for (const word of allSpellingWords) {
      expect(typeof word.reviewed, word.wordId).toBe('boolean')
    }
  })

  it('ships no zin items in the first release (§6 rule 3)', () => {
    expect(allSpellingWords.every((w) => w.zin === null)).toBe(true)
  })
})

// ---------------------------------------------------------------- §5, the round

/** Every klank, so the pool is never what limits a round in these tests. */
const ALL_KLANKEN = [...new Set(words.flatMap((w) => w.klanken))]

function spellingLesson(pair: string, pool = ALL_KLANKEN, exerciseCount = 10): Lesson {
  return {
    id: `test-spel-${pair}`,
    unitId: 'test',
    kind: 'les',
    title: 'Maak het woord af',
    gameType: 'maak-het-woord-af',
    newSounds: [],
    soundPool: pool,
    exerciseCount,
    spellingPair: pair,
  }
}

const none = () => false

describe('buildSpellingRound', () => {
  it('deals ten distinct words', () => {
    const ids = buildSpellingRound(spellingLesson('d-t'), {}, none, allSpellingWords)
    expect(ids).toHaveLength(10)
    expect(new Set(ids).size).toBe(10)
  })

  it('deals only words of the node\'s own pair', () => {
    const ids = buildSpellingRound(spellingLesson('cht-gt'), {}, none, allSpellingWords)
    const byId = new Map(allSpellingWords.map((w) => [w.wordId, w]))
    expect(ids.every((id) => byId.get(id)?.pair === 'cht-gt')).toBe(true)
  })

  it('deals only words she can read with this pool', () => {
    // fase 1 up to the unit that introduces `d`: no l, no h, no long vowels.
    const pool = ['a', 'e', 'o', 'u', 'i', 'm', 's', 'k', 'r', 't', 'n', 'p', 'b', 'd', 'f']
    const readable = new Set(
      spellingWordsForPool('d-t', pool, allSpellingWords).map((w) => w.wordId),
    )
    const ids = buildSpellingRound(spellingLesson('d-t', pool), {}, none, allSpellingWords)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => readable.has(id))).toBe(true)
  })

  it('gives a shorter round rather than a repeat when the pool is small', () => {
    const pool = ['a', 'e', 'o', 'u', 'i', 'm', 's', 'k', 'r', 't', 'n', 'p', 'b', 'd', 'f']
    const available = spellingWordsForPool('d-t', pool, allSpellingWords).length
    const ids = buildSpellingRound(
      spellingLesson('d-t', pool, available + 5),
      {},
      none,
      allSpellingWords,
    )
    expect(ids).toHaveLength(available)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('deals nothing for a lesson with no pair', () => {
    const noPair: Lesson = { ...spellingLesson('d-t'), spellingPair: undefined }
    expect(buildSpellingRound(noPair, {}, none, allSpellingWords)).toEqual([])
  })

  it('deals only reviewed words by default', () => {
    // The default word set is `dealableSpellingWords`, which is empty while the whole seed
    // list is still drafts — so today this reads "nothing at all". Written as a subset
    // check rather than as `toEqual([])` so that it keeps meaning the same thing, rather
    // than going red, on the day Arjan reviews some of them (§12.1).
    const reviewed = new Set(allSpellingWords.filter((w) => w.reviewed).map((w) => w.wordId))
    const ids = buildSpellingRound(spellingLesson('d-t'), {}, none)
    expect(ids.every((id) => reviewed.has(id))).toBe(true)
    expect(ids.length).toBeLessThanOrEqual(reviewed.size)
  })

  it('puts recorded words ahead of un-recorded ones', () => {
    const pool = ['a', 'e', 'o', 'u', 'i', 'm', 's', 'k', 'r', 't', 'n', 'p', 'b', 'd', 'f']
    const readable = spellingWordsForPool('d-t', pool, allSpellingWords).map((w) => w.wordId)
    const recorded = new Set(readable.slice(0, 3))
    const ids = buildSpellingRound(
      spellingLesson('d-t', pool),
      {},
      (id) => recorded.has(id),
      allSpellingWords,
    )
    expect(ids.slice(0, 3).every((id) => recorded.has(id))).toBe(true)
  })

  it('prefers a word she has missed before', () => {
    /*
     * Statistical rather than exact: the ordering is a weighted shuffle, and what is worth
     * pinning is that the weight has an effect, not which draw it produced. The two words
     * compared are both inside the candidate window — twenty words for a ten-card round —
     * so each is roughly a coin flip on its own; weighting one of them 11 against a field
     * of 1s should make it the near-certain pick over two hundred rounds.
     */
    const readable = spellingWordsForPool('d-t', ALL_KLANKEN, allSpellingWords)
    expect(readable.length, 'the pair needs more words than a round').toBeGreaterThan(20)
    // the same window buildSpellingRound draws from: the twenty shortest, file order
    // breaking ties, which is what both sorts being stable guarantees
    const window = [...readable].sort((a, b) => a.wordId.length - b.wordId.length).slice(0, 20)
    const missedId = window[window.length - 1].wordId
    const plainId = window[window.length - 2].wordId
    const stats: Record<string, SpellingStats> = { [missedId]: { seen: 3, missed: 10 } }

    let withMissed = 0
    let withPlain = 0
    for (let i = 0; i < 200; i++) {
      const ids = buildSpellingRound(spellingLesson('d-t'), stats, none, allSpellingWords)
      if (ids.includes(missedId)) withMissed++
      if (ids.includes(plainId)) withPlain++
    }
    expect(withMissed).toBeGreaterThan(withPlain)
  })
})
