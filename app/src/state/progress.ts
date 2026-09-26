import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from './idbStorage'
import type { AnswerRecord, Lesson, SessionResult, SpellingResult, WordResult } from '@shared/src/types'
import { emptyAggregates, applySession, type Aggregates, type LessonCompletion } from '../engine/recompute'
import { computeReward, type Reward } from '../engine/reward'
import { LEGACY_UNIT_ID_MAP } from '../data/path'

const idbStateStorage: StateStorage = {
  getItem: (name) => idbGet(name),
  setItem: (name, value) => idbSet(name, value),
  removeItem: (name) => idbDel(name),
}

/**
 * v2 → v3 (docs/backend-readiness.md A3): unit ids stopped being positional. Remaps any
 * lesson id built from a *former* positional unit id (data/path.ts's LEGACY_UNIT_ID_MAP) to
 * its new stable equivalent; leaves anything else — already-stable ids, unrecognised keys —
 * untouched. Safe to run more than once: a key that doesn't match a legacy id is a no-op.
 */
function remappedLegacyId(lessonId: string): string {
  const match = /^(.+)-l(\d+)$/.exec(lessonId)
  if (!match) return lessonId
  const [, unitId, lessonNum] = match
  const newUnitId = LEGACY_UNIT_ID_MAP[unitId]
  return newUnitId ? `${newUnitId}-l${lessonNum}` : lessonId
}

function remapLegacyLessonKeys<T>(dict: Record<string, T> | undefined): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(dict ?? {})) {
    next[remappedLegacyId(key)] = value
  }
  return next
}

function remapLegacySessionIds(sessions: SessionResult[] | undefined): SessionResult[] {
  return (sessions ?? []).map((s) => ({ ...s, lessonId: remappedLegacyId(s.lessonId) }))
}

export type { LessonCompletion }

/**
 * Longest name we store, and the `maxLength` the name inputs use. Twenty characters is
 * comfortably more than a first name and still short enough that "Hoi, {naam}!" cannot
 * wrap out of Frida's bubble on a 390px phone.
 */
export const MAX_PLAYER_NAME = 20

/**
 * The single definition of what a stored name looks like: no leading or trailing space, no
 * runs of whitespace inside, at most MAX_PLAYER_NAME characters. Both name fields (the
 * welkom-flow's step 2 and Profiel -> Over DuoLexie) and the live bubble go through this,
 * so a stray keystroke cannot show up as "Hoi,  Lotte !" in one place and not the other.
 *
 * The trailing trim happens *after* the cap on purpose: cutting a 21-character name at 20
 * can land on a space, and putting that space back into the greeting is exactly the bug
 * this function exists to prevent.
 */
export function normalizePlayerName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAYER_NAME).trimEnd()
}

interface ProgressState extends Aggregates {
  /**
   * Append-only session log — docs/backend-readiness.md A2. gems/xp/soundStats/wordStats/
   * records/practiceDays above are a derived cache over this log (see engine/recompute.ts),
   * kept as real store fields so reads stay O(1) instead of replaying on every render.
   */
  sessions: SessionResult[]
  /**
   * Weetjes cards she has kept, in the order she collected them (docs/weetjes.md §5).
   *
   * Order is load-bearing, not incidental: it is both the Weetjesboek's ordering and the
   * recency that decides which card a node re-deals once she has seen them all, so nothing
   * separate has to be stored to know which one she met longest ago.
   */
  collectedWeetjes: string[]
  settings: {
    font: 'standaard' | 'dyslexie'
    /**
     * Swipes she has made *herself* in Hardop lezen — not cards sorted. Tapping a pile and
     * the desktop arrow keys deliberately do not count, because the whole point of the
     * counter is to decide when she no longer needs to be taught the swipe, and being
     * taught it by tapping is not the same as having done it (docs/hardop-lezen-swipe-v2.md
     * §4.4).
     */
    selfSwipes: number
    /**
     * Her first name, or '' when she has none — the welkom-flow makes it optional and
     * "Liever geen naam" is a first-class answer, so every reader has to cope with ''.
     * Always normalized (normalizePlayerName).
     */
    playerName: string
    /**
     * ISO instant she finished the welkom-flow, or null if she never has. This is the
     * onboarding gate: PathScreen sends her to /welkom while it is null
     * (docs/onboarding-welkom.md ss3). Not a boolean, because "when" is the more useful
     * thing to have once profiles move to the server (plan.md Phase 3) and it costs
     * nothing to record now.
     */
    onboardedAt: string | null
    /**
     * Read the Weetjes cards aloud by themselves (docs/weetjes.md §7). On by default,
     * because the whole game is built so she never has to read a word of it; off is for
     * the classroom, a quiet room, or a child who would rather read it herself.
     */
    autoRead: boolean
  }

  toggleFont: () => void
  toggleAutoRead: () => void
  /** Adds a card to her Weetjesboek. Idempotent — a card she already has stays where it is. */
  collectWeetje: (id: string) => void
  /** One more swipe she made herself; the teaching layers switch off at SWIPES_TO_LEARN. */
  noteSelfSwipe: () => void
  /** Stores her name, normalized; '' clears it. */
  setPlayerName: (name: string) => void
  /** Marks the welkom-flow done. Idempotent: a second call keeps the first timestamp. */
  completeOnboarding: () => void
  /** Deducts gems for a shop purchase; returns false (no-op) if the balance is insufficient. */
  spendGems: (amount: number) => boolean
  completeLesson: (args: {
    lesson: Lesson
    answers: AnswerRecord[]
    score?: number
    /** Hardop lezen only — per-word reads, one per swiped card */
    wordResults?: WordResult[]
    /** Maak het woord af only — one entry per distinct word she spelled */
    spellingResults?: SpellingResult[]
  }) => Reward
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...emptyAggregates(),
      sessions: [],
      collectedWeetjes: [],
      settings: {
        font: 'standaard',
        selfSwipes: 0,
        playerName: '',
        onboardedAt: null,
        autoRead: true,
      },

      // Both of these spread the existing settings rather than rebuilding the object: with
      // more than one key in here, writing a fresh literal silently resets the other.
      toggleFont: () =>
        set((s) => ({
          settings: {
            ...s.settings,
            font: s.settings.font === 'standaard' ? 'dyslexie' : 'standaard',
          },
        })),

      toggleAutoRead: () =>
        set((s) => ({ settings: { ...s.settings, autoRead: !s.settings.autoRead } })),

      // Idempotent, and it keeps the *first* position: the order is her collection order and
      // the recency the re-deal reads (§5), so re-collecting a card she already has must not
      // move it to the front and make the oldest card look like the newest.
      collectWeetje: (id) =>
        set((s) =>
          s.collectedWeetjes.includes(id)
            ? s
            : { collectedWeetjes: [...s.collectedWeetjes, id] },
        ),

      noteSelfSwipe: () =>
        set((s) => ({ settings: { ...s.settings, selfSwipes: s.settings.selfSwipes + 1 } })),

      setPlayerName: (name) =>
        set((s) => ({ settings: { ...s.settings, playerName: normalizePlayerName(name) } })),

      // Idempotent by design: Profiel can send her back through the intro any number of
      // times (docs/onboarding-welkom.md ss2.5), and each finish must not rewrite when she
      // first arrived.
      completeOnboarding: () =>
        set((s) =>
          s.settings.onboardedAt
            ? s
            : { settings: { ...s.settings, onboardedAt: new Date().toISOString() } },
        ),

      spendGems: (amount) => {
        const s = get()
        if (s.gems < amount) return false
        set({ gems: s.gems - amount })
        return true
      },

      completeLesson: ({ lesson, answers, score, wordResults, spellingResults }) => {
        const s = get()
        const prevRecord = s.records[lesson.id] ?? 0
        // The only formula for what a session is worth (engine/reward.ts) — completeLesson
        // no longer takes gems/xp from the caller, so there's nowhere left for a second,
        // silently-divergent copy of this arithmetic to be written.
        const reward = computeReward(
          lesson,
          answers,
          prevRecord,
          score,
          wordResults,
          spellingResults,
        )

        const session: SessionResult = {
          id: crypto.randomUUID(),
          lessonId: lesson.id,
          completedAt: new Date().toISOString(),
          answers,
          wordResults,
          spellingResults,
          xpEarned: reward.xp,
          gemsEarned: reward.gems,
          score,
          newRecord: reward.newRecord,
        }

        // applySession is the same fold recomputeFrom uses in bulk (engine/recompute.ts) —
        // one implementation, so the incremental and replay paths can't drift apart.
        const next = applySession(s, session)
        set({ ...next, sessions: [...s.sessions, session] })
        return reward
      },
    }),
    {
      name: 'duolexie-progress',
      storage: createJSONStorage(() => idbStateStorage),
      version: 5,
      // Cascading, not else-if: an old-enough profile needs every fixup below it applied
      // in order, not just the one matching its exact stored version.
      migrate: (persisted, version) => {
        let p = persisted as Record<string, unknown>
        if (version < 1) p = { ...p, wordStats: {} } // v0 predates wordStats
        if (version < 2) p = { ...p, sessions: [] } // v0/v1 predate the session log
        if (version < 3) {
          // v0-v2 predate stable unit ids (A3) — remap completedLessons/records keys and
          // session lessonIds built from the old positional scheme.
          p = {
            ...p,
            completedLessons: remapLegacyLessonKeys(
              p.completedLessons as Record<string, LessonCompletion> | undefined,
            ),
            records: remapLegacyLessonKeys(p.records as Record<string, number> | undefined),
            sessions: remapLegacySessionIds(p.sessions as SessionResult[] | undefined),
          }
        }
        if (version < 4) {
          // v0-v3 predate the Weetjesboek (docs/weetjes.md §5). An empty collection is the
          // truthful starting point for an existing profile: she has not seen a card yet.
          p = { ...p, collectedWeetjes: [] }
        }
        if (version < 5) {
          // v0-v4 predate Maak het woord af (docs/maak-het-woord-af.md §5). Empty is the
          // truthful start: she has not spelled a word yet. It could equally be replayed
          // out of `sessions` (recomputeFrom does exactly that), but no session before
          // this version carries a spellingResults field, so the replay would produce {}
          // and cost a fold over her whole history to say so.
          p = { ...p, spellingStats: {} }
        }
        return p
      },
      // zustand's default merge is shallow, so a nested object gained later would
      // arrive half-formed for anyone with saved state. `current` spreads first so
      // persisted data can never clobber the action functions.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProgressState>
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...p.settings },
          wordStats: p.wordStats ?? {},
          spellingStats: p.spellingStats ?? {},
          sessions: p.sessions ?? [],
          collectedWeetjes: p.collectedWeetjes ?? [],
        }
      },
    },
  ),
)

/** Days practiced in the current Mon-Sun week (weekdoel: 5 van de 7) */
export function daysThisWeek(practiceDays: string[]): number {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(now)
  monday.setDate(now.getDate() - day)
  monday.setHours(0, 0, 0, 0)
  return practiceDays.filter((d) => new Date(d + 'T12:00:00') >= monday).length
}
