import type { AnswerRecord, Lesson } from '@shared/src/types'

export interface Reward {
  gems: number
  xp: number
  perfect: boolean
  newRecord: boolean
}

/**
 * docs/backend-readiness.md A4 — the one place the reward formula lives. It used to be
 * written independently in GameScreen (to decide what to display) and progress.ts (to
 * decide what to credit); they agreed only by coincidence — change the bonus in one file
 * and the number she sees silently stops matching the number she's paid. Callers of
 * completeLesson no longer compute gems/xp themselves; they render what it returns.
 */
export function computeReward(
  lesson: Lesson,
  answers: AnswerRecord[],
  prevRecord: number,
  score?: number,
): Reward {
  const perfect = answers.length > 0 && answers.every((a) => a.correct)
  const newRecord = score !== undefined && score > prevRecord
  const gems =
    10 + (perfect ? 5 : 0) + (lesson.kind === 'eindbaas' ? 10 : 0) + (newRecord ? 10 : 0)
  const xp = 10 + answers.filter((a) => a.correct).length
  return { gems, xp, perfect, newRecord }
}
