import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from './idbStorage'
import type { AnswerRecord, SoundStats, WordResult, WordStats } from '@shared/src/types'
import { applyAnswer, emptyStats } from '../engine/stats'
import { applyWordResult, emptyWordStats } from '../engine/wordStats'
import { localDay } from '../date'

const idbStateStorage: StateStorage = {
  getItem: (name) => idbGet(name),
  setItem: (name, value) => idbSet(name, value),
  removeItem: (name) => idbDel(name),
}

export interface LessonCompletion {
  timesCompleted: number
  bestScore?: number
}

interface ProgressState {
  gems: number
  xp: number
  completedLessons: Record<string, LessonCompletion>
  soundStats: Record<string, SoundStats>
  /** Per-word reading history — see docs/reading-mechanics.md */
  wordStats: Record<string, WordStats>
  /** klanken-per-minuut records, keyed by lesson id */
  records: Record<string, number>
  /** ISO dates (yyyy-mm-dd) with at least one completed lesson */
  practiceDays: string[]
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
      gems: 0,
      xp: 0,
      completedLessons: {},
      soundStats: {},
      wordStats: {},
      records: {},
      practiceDays: [],
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

        const soundStats = { ...s.soundStats }
        for (const answer of answers) {
          soundStats[answer.soundId] = applyAnswer(
            soundStats[answer.soundId] ?? emptyStats(),
            answer,
          )
        }

        const wordStats = { ...s.wordStats }
        for (const result of wordResults ?? []) {
          wordStats[result.wordId] = applyWordResult(
            wordStats[result.wordId] ?? emptyWordStats(localDay()),
            result,
          )
        }

        const prev = s.completedLessons[lessonId]
        const prevRecord = s.records[lessonId] ?? 0
        const newRecord = score !== undefined && score > prevRecord

        set({
          gems: s.gems + gems + (newRecord ? 10 : 0),
          xp: s.xp + xp,
          soundStats,
          wordStats,
          completedLessons: {
            ...s.completedLessons,
            [lessonId]: {
              timesCompleted: (prev?.timesCompleted ?? 0) + 1,
              bestScore: Math.max(prev?.bestScore ?? 0, score ?? 0) || undefined,
            },
          },
          records: newRecord ? { ...s.records, [lessonId]: score! } : s.records,
          practiceDays: s.practiceDays.includes(localDay())
            ? s.practiceDays
            : [...s.practiceDays, localDay()],
        })
        return { newRecord }
      },
    }),
    {
      name: 'duolexie-progress',
      storage: createJSONStorage(() => idbStateStorage),
      version: 1,
      // v0 profiles predate wordStats. Without this they rehydrate with the key
      // missing while TypeScript insists it's there.
      migrate: (persisted, version) =>
        version === 0 ? { ...(persisted as object), wordStats: {} } : persisted,
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
