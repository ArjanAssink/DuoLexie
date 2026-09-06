import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from './idbStorage'
import type { AnswerRecord, SessionResult, WordResult } from '@shared/src/types'
import { emptyAggregates, applySession, type Aggregates, type LessonCompletion } from '../engine/recompute'

const idbStateStorage: StateStorage = {
  getItem: (name) => idbGet(name),
  setItem: (name, value) => idbSet(name, value),
  removeItem: (name) => idbDel(name),
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
    lessonId: string
    answers: AnswerRecord[]
    gems: number
    xp: number
    score?: number
    /** Hardop lezen only — per-word reads, one per swiped card */
    wordResults?: WordResult[]
  }) => { newRecord: boolean }
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

      completeLesson: ({ lessonId, answers, gems, xp, score, wordResults }) => {
        const s = get()
        const prevRecord = s.records[lessonId] ?? 0
        const newRecord = score !== undefined && score > prevRecord

        const session: SessionResult = {
          id: crypto.randomUUID(),
          lessonId,
          completedAt: new Date().toISOString(),
          answers,
          wordResults,
          xpEarned: xp,
          gemsEarned: gems + (newRecord ? 10 : 0),
          score,
          newRecord,
        }

        // applySession is the same fold recomputeFrom uses in bulk (engine/recompute.ts) —
        // one implementation, so the incremental and replay paths can't drift apart.
        const next = applySession(s, session)
        set({ ...next, sessions: [...s.sessions, session] })
        return { newRecord }
      },
    }),
    {
      name: 'duolexie-progress',
      storage: createJSONStorage(() => idbStateStorage),
      version: 2,
      // v0 profiles predate wordStats; v0/v1 predate the session log.
      migrate: (persisted, version) => {
        const p = persisted as Record<string, unknown>
        if (version === 0) return { ...p, wordStats: {}, sessions: [] }
        if (version === 1) return { ...p, sessions: [] }
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
