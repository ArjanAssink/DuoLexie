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

export type GameType = 'flitsen' | 'tijdrit' | 'welke-klank' | 'woordbouwer' | 'hardop-lezen'

export type LessonKind = 'les' | 'tijdrit-uitdaging' | 'herhaling' | 'eindbaas'

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
  xpEarned: number
  gemsEarned: number
  /** klanken per minuut, for Flitsen rounds */
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
