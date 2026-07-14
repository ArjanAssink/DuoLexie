import curriculumJson from '@shared/curriculum/sounds.json'
import type { Curriculum, Category } from '@shared/src/types'

export const curriculum = curriculumJson as Curriculum

export const allSounds: string[] = curriculum.categories.flatMap((c) => c.sounds)

const categoryBySound = new Map<string, Category>()
for (const cat of curriculum.categories) {
  for (const s of cat.sounds) categoryBySound.set(s, cat)
}

export function categoryOf(soundId: string): Category {
  return categoryBySound.get(soundId)!
}

/** Static confusion partners for a sound (from curriculum defaults) */
export function confusablesOf(soundId: string): string[] {
  const out: string[] = []
  for (const [a, b] of curriculum.confusionPairs) {
    if (a === soundId) out.push(b)
    if (b === soundId) out.push(a)
  }
  return out
}
