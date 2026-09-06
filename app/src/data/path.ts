import type { Fase, Lesson, Unit } from '@shared/src/types'
import { curriculum } from '../curriculum'
import { wordsForPool } from '../words'

interface UnitDef {
  title: string
  sounds: string[]
}

interface FaseDef {
  id: string
  title: string
  categoryId: Fase['categoryId']
  units: UnitDef[]
}

// Default order (§3 of the plan). Later this becomes parent-configurable.
const FASE_DEFS: FaseDef[] = [
  {
    id: 'fase1',
    title: 'Korte klanken',
    categoryId: 'kort',
    units: [
      { title: 'De klinkers', sounds: ['a', 'e', 'o', 'u', 'i'] },
      { title: 'm · s · k · r · t', sounds: ['m', 's', 'k', 'r', 't'] },
      { title: 'n · p · b · d · f', sounds: ['n', 'p', 'b', 'd', 'f'] },
      { title: 'g · h · j · l', sounds: ['g', 'h', 'j', 'l'] },
      { title: 'v · w · z', sounds: ['v', 'w', 'z'] },
    ],
  },
  {
    id: 'fase2',
    title: 'Lange klanken',
    categoryId: 'lang',
    units: [
      { title: 'aa · ee · oo · uu', sounds: ['aa', 'ee', 'oo', 'uu'] },
    ],
  },
  {
    id: 'fase3',
    title: 'Twee tekens I',
    categoryId: 'twee',
    units: [
      { title: 'ie · oe', sounds: ['ie', 'oe'] },
      { title: 'eu · ui · uw', sounds: ['eu', 'ui', 'uw'] },
    ],
  },
  {
    id: 'fase4',
    title: 'Tweelingklanken',
    categoryId: 'twee',
    units: [
      { title: 'ei · ij', sounds: ['ei', 'ij'] },
      { title: 'au · ou', sounds: ['au', 'ou'] },
    ],
  },
  {
    id: 'fase5',
    title: 'Twee tekens II',
    categoryId: 'twee',
    units: [
      { title: 'ch · ng · nk', sounds: ['ch', 'ng', 'nk'] },
    ],
  },
  {
    id: 'fase6',
    title: 'Drie & vier tekens',
    categoryId: 'drie',
    units: [
      { title: 'aai · ooi · oei', sounds: ['aai', 'ooi', 'oei'] },
      { title: 'auw · ouw', sounds: ['auw', 'ouw'] },
      { title: 'eeuw · ieuw', sounds: ['eeuw', 'ieuw'] },
    ],
  },
]

/** A "Lezen" (Hardop lezen) node only makes sense once its pool covers a handful of real words. */
const MIN_WORDS_FOR_LEZEN = 4

function buildLessons(unitId: string, unitDef: UnitDef, cumulative: string[]): Lesson[] {
  const pool = cumulative
  const lessons: Lesson[] = [
    {
      id: `${unitId}-l1`,
      unitId,
      kind: 'les',
      title: 'Flitsen',
      gameType: 'flitsen',
      newSounds: unitDef.sounds,
      soundPool: pool,
      exerciseCount: 10,
    },
    {
      id: `${unitId}-l2`,
      unitId,
      kind: 'les',
      title: 'Tijdrit',
      gameType: 'tijdrit',
      newSounds: unitDef.sounds,
      soundPool: pool,
      exerciseCount: 0, // Tijdrit is time-based, not count-based
    },
    {
      id: `${unitId}-l3`,
      unitId,
      kind: 'herhaling',
      title: 'Mix',
      gameType: 'flitsen',
      newSounds: [],
      soundPool: pool,
      exerciseCount: 12,
    },
    {
      id: `${unitId}-l4`,
      unitId,
      kind: 'tijdrit-uitdaging',
      title: 'Uitdaging',
      gameType: 'tijdrit',
      newSounds: [],
      soundPool: pool,
      exerciseCount: 0,
    },
  ]

  const eligibleWords = wordsForPool(pool)
  if (eligibleWords.length >= MIN_WORDS_FOR_LEZEN) {
    lessons.push({
      id: `${unitId}-l5`,
      unitId,
      kind: 'les',
      title: 'Lezen',
      gameType: 'hardop-lezen',
      newSounds: [],
      soundPool: pool,
      exerciseCount: Math.min(8, eligibleWords.length),
    })
  }

  return lessons
}

/**
 * A unit's stable id — derived from the sounds it introduces, not its position in
 * FASE_DEFS. docs/backend-readiness.md A3 / code-review-backlog.md's "positional lesson
 * ids": the old `u${i+1}` scheme silently remapped a user's completedLessons/records onto
 * whatever unit happened to occupy that array slot after any reorder or insertion. A unit's
 * sound set is what actually identifies it and doesn't change under editing elsewhere in
 * the array, so it survives exactly the edits the old scheme didn't.
 */
function unitSlug(unitDef: UnitDef): string {
  return unitDef.sounds.join('-')
}

/**
 * Maps this file's *former* positional unit ids (`fase{n}-u{i+1}`, one-time only, computed
 * from the current FASE_DEFS order) to the new stable ids above. Used once, by
 * state/progress.ts's persisted-state migration, to remap old completedLessons/records
 * keys and session lessonIds so upgrading doesn't silently blank out real progress. Nothing
 * else should use this — new code has no reason to know the old scheme ever existed.
 */
export const LEGACY_UNIT_ID_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const faseDef of FASE_DEFS) {
    faseDef.units.forEach((unitDef, i) => {
      map[`${faseDef.id}-u${i + 1}`] = `${faseDef.id}-${unitSlug(unitDef)}`
    })
  }
  return map
})()

function buildPath(): Fase[] {
  const fases: Fase[] = []
  const cumulative: string[] = []
  for (const faseDef of FASE_DEFS) {
    const cat = curriculum.categories.find((c) => c.id === faseDef.categoryId)!
    const units: Unit[] = []
    for (let i = 0; i < faseDef.units.length; i++) {
      const unitDef = faseDef.units[i]
      cumulative.push(...unitDef.sounds)
      const unitId = `${faseDef.id}-${unitSlug(unitDef)}`
      units.push({
        id: unitId,
        faseId: faseDef.id,
        title: unitDef.title,
        sounds: unitDef.sounds,
        cumulativeSounds: [...cumulative],
        lessons: buildLessons(unitId, unitDef, [...cumulative]),
      })
    }
    fases.push({
      id: faseDef.id,
      title: faseDef.title,
      categoryId: faseDef.categoryId,
      color1: cat.color1,
      color2: cat.color2,
      units,
    })
  }
  return fases
}

export const path: Fase[] = buildPath()

export const allLessons: Lesson[] = path.flatMap((f) => f.units.flatMap((u) => u.lessons))

export function lessonById(id: string): Lesson | undefined {
  return allLessons.find((l) => l.id === id)
}

/** Linear unlock: a lesson is unlocked when all earlier lessons are completed */
export function lessonIndex(id: string): number {
  return allLessons.findIndex((l) => l.id === id)
}
