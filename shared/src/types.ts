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
  xpEarned: number
  gemsEarned: number
  /** klanken per minuut, for Tijdrit rounds */
  score?: number
  newRecord?: boolean
}

export type HairStyle = 'kort' | 'krullen' | 'staart' | 'lang'

export type AccessorySlot = 'oorbellen' | 'bril' | 'hoed'

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
