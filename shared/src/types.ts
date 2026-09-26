export type CategoryId = 'kort' | 'lang' | 'twee' | 'drie' | 'vier' | 'mede'

export interface Category {
  id: CategoryId
  name: string
  abbr: string
  color1: string
  color2: string
  sounds: string[]
}

export interface Curriculum {
  categories: Category[]
  confusionPairs: [string, string][]
}

export interface Word {
  id: string
  text: string
  category: CategoryId
  /** klanken this word is built from — a word is eligible once all of these are in the pool */
  klanken: string[]
  /** false = heuristically segmented (e.g. tools/import-hangman-words.mjs), not yet human-checked */
  reviewed?: boolean
}

export interface WordCurriculum {
  words: Word[]
}

export type GameType =
  | 'flitsen'
  | 'tijdrit'
  | 'welke-klank'
  | 'woordbouwer'
  | 'hardop-lezen'
  | 'weetjes'
  | 'maak-het-woord-af'

export type LessonKind = 'les' | 'tijdrit-uitdaging' | 'herhaling' | 'eindbaas' | 'weetje'

export interface Lesson {
  id: string
  unitId: string
  kind: LessonKind
  title: string
  gameType: GameType
  /** Sounds introduced in this lesson (subset of pool) */
  newSounds: string[]
  /** All sounds this lesson may draw from */
  soundPool: string[]
  exerciseCount: number
  /**
   * Maak het woord af only — which spelling pair this node drills
   * (`shared/curriculum/spelling.json`, docs/maak-het-woord-af.md §7). One node per pair
   * per unit, so the pair is what tells two nodes on the same unit apart.
   */
  spellingPair?: string
}

export interface Unit {
  id: string
  faseId: string
  title: string
  /** Sounds this unit introduces */
  sounds: string[]
  /** All sounds available once this unit starts (cumulative) */
  cumulativeSounds: string[]
  lessons: Lesson[]
}

export interface Fase {
  id: string
  title: string
  categoryId: CategoryId
  color1: string
  color2: string
  units: Unit[]
}

/** Per-sound learning statistics (the adaptivity core) */
export interface SoundStats {
  attempts: number
  correct: number
  /** Exponentially weighted moving average of accuracy, 0..1 */
  ewmaAccuracy: number
  /** EWMA of response time in ms */
  ewmaResponseMs: number
  lastSeenAt: string | null
  /** graphemeId -> times confused with this sound */
  confusions: Record<string, number>
}

export type Mastery = 'nieuw' | 'leren' | 'geleerd' | 'goud'

/** Leitner box, 1 = just missed or brand new, 5 = effectively retired */
export type WordBox = 1 | 2 | 3 | 4 | 5

/**
 * Per-word learning statistics — drives the adaptive reading window and the
 * spaced-repetition schedule (docs/reading-mechanics.md §2, §3).
 */
export interface WordStats {
  attempts: number
  correct: number
  /**
   * EWMA of how long she took to read it, successful reads only. Null until the
   * first success: seeding it with a guess would poison the global average that
   * the adaptive window falls back on for unfamiliar words.
   */
  ewmaMs: number | null
  box: WordBox
  /** Local calendar day (YYYY-MM-DD) — day arithmetic only, never an instant */
  dueAt: string
  /** Full ISO instant — for ordering only, never day arithmetic */
  lastSeenAt: string
}

/** One graded read of one word, as reported by Hardop lezen. */
export interface WordResult {
  wordId: string
  correct: boolean
  ms: number
  /** She answered before the reading window ran out — the promotion gate */
  withinWindow: boolean
}

export interface AnswerRecord {
  soundId: string
  correct: boolean
  ms: number
  /** what was tapped instead, when wrong */
  confusedWith?: string
}

export interface SessionResult {
  id: string
  lessonId: string
  completedAt: string
  answers: AnswerRecord[]
  /** Hardop lezen only — one entry per word she graded */
  wordResults?: WordResult[]
  /**
   * Maak het woord af only — one entry per distinct word she spelled.
   *
   * Deliberately *not* folded into `wordResults`: `applySession` feeds those into the
   * reading-speed Leitner boxes (`wordStats`), and how she spells a word says nothing about
   * how fast she reads it (docs/maak-het-woord-af.md §5).
   */
  spellingResults?: SpellingResult[]
  xpEarned: number
  gemsEarned: number
  /** klanken per minuut, for Tijdrit rounds */
  score?: number
  newRecord?: boolean
}

/**
 * Every kapsel in the picker, in two groups (see app/src/components/hair.tsx for the art and
 * the group each one is listed under). The first four ids are the original set and are kept
 * verbatim: a saved avatar from before the catalogue grew still resolves to its own hair.
 */
export type HairStyle =
  // jongens
  | 'kort'
  | 'millimeter'
  | 'stekels'
  | 'kuif'
  | 'zijscheiding'
  | 'bol'
  | 'krullen-kort'
  | 'afro'
  | 'dreads'
  | 'matje'
  | 'kaal'
  // meisjes
  | 'krullen'
  | 'staart'
  | 'lang'
  | 'bob'
  | 'pixie'
  | 'pony'
  | 'vlechten'
  | 'knot'
  | 'staartjes'
  | 'golven'
  | 'hoge-staart'

/**
 * One wearable per slot. 'jas' swaps the torso's own colours rather than laying something
 * over it, and 'sjaal' sits between the neck and the chin; the rest are overlays.
 */
export type AccessorySlot = 'oorbellen' | 'bril' | 'hoed' | 'sjaal' | 'jas'

export interface AvatarConfig {
  skinColor: string
  eyeColor: string
  hairColor: string
  hairstyle: HairStyle
  equipped: Partial<Record<AccessorySlot, string>>
}

export interface ShopItem {
  id: string
  slot: AccessorySlot
  name: string
  price: number
}

/** Which shelf of the Weetjesboek a card belongs on — docs/weetjes.md §3. */
export type WeetjeCategory = 'samen' | 'brein' | 'mensen' | 'rechten' | 'trucs' | 'taal'

/**
 * The one thing she *does* with a card, which is the whole point of the beat:
 * - `waar-niet-waar` — swipe a statement up (waar) or down (niet waar)
 * - `kies` — a question and three answers
 * - `wie` — a `kies` whose three answers are names, and whose clue is the fact
 */
export type WeetjeType = 'waar-niet-waar' | 'kies' | 'wie'

/** How well the claim is backed — what decides whether a card may ever be `reviewed`. */
export type WeetjeEvidence = 'sterk' | 'redelijk' | 'ervaring'

/**
 * One dyslexia fact, in three beats: Luister (`fact`), Doe (`statement` or
 * `question` + `options`), Bewaar (`reveal`). docs/weetjes.md §3.
 *
 * `*asterisks*` in the copy mark the one bold key word per sentence (§6); nothing else in
 * the text is markup. The per-type fields are null on the types that don't use them rather
 * than absent, so a hand-edited card that forgets one fails the unit test instead of
 * silently rendering an empty beat.
 */
export interface Weetje {
  id: string
  category: WeetjeCategory
  type: WeetjeType
  /** Deal order across the whole path — unique, lowest first (§5) */
  order: number
  fact: string
  /** waar-niet-waar only */
  statement: string | null
  /** waar-niet-waar only: is the statement true? */
  answer: boolean | null
  /** kies / wie only */
  question: string | null
  /** kies / wie only: exactly three */
  options: string[] | null
  /** kies / wie only: index into `options` */
  correct: number | null
  reveal: string
  /** an emoji standing in for a picture — never a photo of a real person (§13) */
  tile: string
  evidence: WeetjeEvidence
  /** a page a parent could open; empty only on a placeholder that has no copy yet */
  source: string
  /** Arjan has read the fact *and* the source. Only reviewed cards are ever dealt (§3). */
  reviewed: boolean
}

export interface WeetjeCurriculum {
  weetjes: Weetje[]
}

/**
 * How a pair's strategy badge behaves (docs/maak-het-woord-af.md §4).
 *
 * - `langer` — two steps: Frida asks her to say the longer word herself, and only then is
 *   it shown and spoken. RID's move is that *she* produces it.
 * - `regel` — one step: the pair's `rule` is spoken. There is nothing for her to produce.
 */
export type SpellingStrategy = 'langer' | 'regel'

/**
 * One confusable spelling pair — `d`/`t`, `cht`/`gt`, and later `ei`/`ij` and `au`/`ou`
 * without any new code. A pair is data, which is the whole point of the file.
 */
export interface SpellingPair {
  id: string
  title: string
  /** Tile order, fixed: left, right. ArrowLeft/ArrowRight follow it (§6). */
  options: string[]
  strategy: SpellingStrategy
  /** What the badge says out loud, and what the bubble shows. */
  rule: string
  /** klanken that must all be taught before a node for this pair appears (§7). */
  needs: string[]
}

/**
 * One word she spells, as the game needs it: the stem that is shown, the ending that is
 * missing, and the strategy's raw material.
 *
 * `wordId` is a word in `words.json` — a spelling word is a word, with `klanken` for the
 * pool filter and a place in the recording order (§6 rule 1).
 */
export interface SpellingWord {
  wordId: string
  /** `SpellingPair.id` */
  pair: string
  /** What stays on the card. `stem + ending` is the word's own text (§6 rule 2). */
  stem: string
  /** One of the pair's `options`. */
  ending: string
  /**
   * The longer form the `langer` strategy reveals — a plural or inflected form for a `d-t`
   * word, the `ik`-form for a `gt` verb, and null for a `cht` word, which has no longer
   * form to make (§6 rule 4).
   */
  langer: string | null
  /**
   * A short context sentence, for the case where *both* spellings are real words and the
   * spoken word alone cannot say which is meant (§6 rule 3). Null on every word in the
   * first release: the words that would need one are simply left out instead.
   */
  zin: string | null
  /** Arjan has checked the word and its longer form. Only reviewed words are ever dealt. */
  reviewed: boolean
}

export interface SpellingCurriculum {
  pairs: SpellingPair[]
  words: SpellingWord[]
}

/**
 * One graded spelling, as reported by Maak het woord af. `correct` is the *first* attempt
 * only — a word she missed is shown the right answer and comes back later in the round,
 * and that second pass is teaching, not a second chance at the score (§5).
 */
export interface SpellingResult {
  wordId: string
  correct: boolean
}

/** How she has done on one word's spelling. The selector prefers what she has missed. */
export interface SpellingStats {
  seen: number
  missed: number
}
