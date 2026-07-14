import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from './idbStorage'
import type { AnswerRecord, SoundStats } from '@shared/src/types'
import { applyAnswer, emptyStats } from '../engine/stats'

const idbStateStorage: StateStorage = {
  getItem: (name) => idbGet(name),
  setItem: (name, value) => idbSet(name, value),
  removeItem: (name) => idbDel(name),
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
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
  /** klanken-per-minuut records, keyed by lesson id */
  records: Record<string, number>
  /** ISO dates (yyyy-mm-dd) with at least one completed lesson */
  practiceDays: string[]
  settings: { font: 'standaard' | 'dyslexie' }

  toggleFont: () => void
  completeLesson: (args: {
    lessonId: string
    answers: AnswerRecord[]
    gems: number
    xp: number
    score?: number
  }) => { newRecord: boolean }
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      gems: 0,
      xp: 0,
      completedLessons: {},
      soundStats: {},
      records: {},
      practiceDays: [],
      settings: { font: 'standaard' },

      toggleFont: () =>
        set((s) => ({
          settings: { font: s.settings.font === 'standaard' ? 'dyslexie' : 'standaard' },
        })),

      completeLesson: ({ lessonId, answers, gems, xp, score }) => {
        const s = get()

        const soundStats = { ...s.soundStats }
        for (const answer of answers) {
          soundStats[answer.soundId] = applyAnswer(
            soundStats[answer.soundId] ?? emptyStats(),
            answer,
          )
        }

        const prev = s.completedLessons[lessonId]
        const prevRecord = s.records[lessonId] ?? 0
        const newRecord = score !== undefined && score > prevRecord

        set({
          gems: s.gems + gems + (newRecord ? 10 : 0),
          xp: s.xp + xp,
          soundStats,
          completedLessons: {
            ...s.completedLessons,
            [lessonId]: {
              timesCompleted: (prev?.timesCompleted ?? 0) + 1,
              bestScore: Math.max(prev?.bestScore ?? 0, score ?? 0) || undefined,
            },
          },
          records: newRecord ? { ...s.records, [lessonId]: score! } : s.records,
          practiceDays: s.practiceDays.includes(today())
            ? s.practiceDays
            : [...s.practiceDays, today()],
        })
        return { newRecord }
      },
    }),
    {
      name: 'duolexie-progress',
      storage: createJSONStorage(() => idbStateStorage),
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
