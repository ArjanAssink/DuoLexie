import type { Fase, Lesson, Unit, Word } from '@shared/src/types'
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

/** Cards in one Lezen round — ten different words (docs/hardop-lezen-rework.md §4). */
export const LEZEN_ROUND_SIZE = 10

/**
 * A "Lezen" node needs enough readable words to fill a round without running the same
 * words twice. Nine is the floor rather than ten: a nine-word pool still yields ten cards
 * with a single non-adjacent repeat (`buildWordExercises`), which is a real round.
 */
const MIN_WORDS_FOR_LEZEN = 9

/**
 * The sound pool a Lezen node reads from, widened by one unit when the strict pool can't
 * fill a round (docs/hardop-lezen-rework.md §4).
 *
 * Strictly, a word is readable only once every klank in it has been introduced — which
 * leaves the first Lezen node with five words (kat/tas/mat/kok/kus) and no way to show ten
 * different ones. Allowing the *next* unit's sounds lifts that to seventeen: those words are
 * built from the klank category she is already working in, so reading one early is a preview
 * rather than a jump.
 *
 * The look-ahead deliberately stops at one unit. Two would hand the vowels-only opening unit
 * a reading node made of consonants she has never met, and one unit is already enough
 * everywhere on the path — every later unit clears the floor on its strict pool alone.
 */
function lezenPool(cumulative: string[], nextUnitSounds: string[]): string[] {
  if (nextUnitSounds.length === 0) return cumulative
  if (wordsForPool(cumulative).length >= LEZEN_ROUND_SIZE) return cumulative
  return [...cumulative, ...nextUnitSounds]
}

function buildLessons(
  unitId: string,
  unitDef: UnitDef,
  cumulative: string[],
  nextUnitSounds: string[],
): Lesson[] {
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

  const readingPool = lezenPool(pool, nextUnitSounds)
  if (wordsForPool(readingPool).length >= MIN_WORDS_FOR_LEZEN) {
    lessons.push({
      id: `${unitId}-l5`,
      unitId,
      kind: 'les',
      title: 'Lezen',
      gameType: 'hardop-lezen',
      newSounds: [],
      soundPool: readingPool,
      exerciseCount: LEZEN_ROUND_SIZE,
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
        lessons: buildLessons(
          unitId,
          unitDef,
          [...cumulative],
          faseDef.units[i + 1]?.sounds ?? [],
        ),
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

/**
 * Proefronde — a direct-launch Hardop lezen round over the whole of fase 1 (short vowels +
 * every consonant, 38 readable words), reachable from `/#/proberen` only.
 *
 * Deliberately *not* in `allLessons`: it must not appear on the path, take a slot in the
 * linear-unlock order, or wait on her progress. It exists so the read → listen → sort
 * interaction can be tried with her before the word level is tuned to where she actually is
 * (docs/hardop-lezen-rework.md §4).
 */
export const PROEFRONDE_LESSON: Lesson = {
  id: 'proef-hardop-lezen',
  unitId: 'proefronde',
  kind: 'les',
  title: 'Proefronde lezen',
  gameType: 'hardop-lezen',
  newSounds: [],
  soundPool: [
    ...(curriculum.categories.find((c) => c.id === 'kort')?.sounds ?? []),
    ...(curriculum.categories.find((c) => c.id === 'mede')?.sounds ?? []),
  ],
  exerciseCount: LEZEN_ROUND_SIZE,
}

export function lessonById(id: string): Lesson | undefined {
  if (id === PROEFRONDE_LESSON.id) return PROEFRONDE_LESSON
  return allLessons.find((l) => l.id === id)
}

/** Linear unlock: a lesson is unlocked when all earlier lessons are completed */
export function lessonIndex(id: string): number {
  return allLessons.findIndex((l) => l.id === id)
}

/**
 * Every word the path can serve, in the order she will actually meet it: for each Lezen node
 * in path order, that node's readable words shortest-first, deduped.
 *
 * This is the recording order — the studio's word mode walks it, so the clips that get
 * recorded first are the ones she reads first (dev/RecordingStudio.tsx).
 */
export function wordsInPathOrder(): Word[] {
  const seen = new Set<string>()
  const out: Word[] = []
  for (const lesson of allLessons) {
    if (lesson.gameType !== 'hardop-lezen') continue
    const words = [...wordsForPool(lesson.soundPool)].sort(
      (a, b) => a.text.length - b.text.length,
    )
    for (const word of words) {
      if (seen.has(word.id)) continue
      seen.add(word.id)
      out.push(word)
    }
  }
  return out
}
