import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from './idbStorage'
import type { AnswerRecord, Lesson, SessionResult, WordResult } from '@shared/src/types'
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

interface ProgressState extends Aggregates {
  /**
   * Append-only session log — docs/backend-readiness.md A2. gems/xp/soundStats/wordStats/
   * records/practiceDays above are a derived cache over this log (see engine/recompute.ts),
   * kept as real store fields so reads stay O(1) instead of replaying on every render.
   */
  sessions: SessionResult[]
  settings: { font: 'standaard' | 'dyslexie' }

  toggleFont: () => void
  /** Deducts gems for a shop purchase; returns false (no-op) if the balance is insufficient. */
  spendGems: (amount: number) => boolean
  completeLesson: (args: {
    lesson: Lesson
    answers: AnswerRecord[]
    score?: number
    /** Hardop lezen only — per-word reads, one per swiped card */
    wordResults?: WordResult[]
  }) => Reward
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...emptyAggregates(),
      sessions: [],
      settings: { font: 'standaard' },

      toggleFont: () =>
        set((s) => ({
          settings: { font: s.settings.font === 'standaard' ? 'dyslexie' : 'standaard' },
        })),

      spendGems: (amount) => {
        const s = get()
        if (s.gems < amount) return false
        set({ gems: s.gems - amount })
        return true
      },

      completeLesson: ({ lesson, answers, score, wordResults }) => {
        const s = get()
        const prevRecord = s.records[lesson.id] ?? 0
        // The only formula for what a session is worth (engine/reward.ts) — completeLesson
        // no longer takes gems/xp from the caller, so there's nowhere left for a second,
        // silently-divergent copy of this arithmetic to be written.
        const reward = computeReward(lesson, answers, prevRecord, score)

        const session: SessionResult = {
          id: crypto.randomUUID(),
          lessonId: lesson.id,
          completedAt: new Date().toISOString(),
          answers,
          wordResults,
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
      version: 3,
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
          sessions: p.sessions ?? [],
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
