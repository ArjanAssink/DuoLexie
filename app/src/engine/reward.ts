import type { AnswerRecord, Lesson, WordResult } from '@shared/src/types'

export interface Reward {
  gems: number
  xp: number
  perfect: boolean
  newRecord: boolean
}

/**
 * Hardop lezen's gem formula (docs/hardop-lezen-rework.md §7). Finishing the round is worth
 * something on its own, so a round she got entirely wrong still pays — the point is to keep
 * her practising, and a zero would punish exactly the session that was hardest to sit
 * through. Ten words therefore pay 5…18.
 */
const READING_FINISH_GEMS = 5
const READING_PERFECT_BONUS = 3

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
  wordResults?: WordResult[],
): Reward {
  // A word round is scored per *word*, not per klank. `answers` carries one record per
  // klank, so a round of long words would otherwise be worth more than the same round of
  // short ones, and "perfect" would hinge on letter count rather than on how she read.
  if (wordResults && wordResults.length > 0) {
    const correct = wordResults.filter((r) => r.correct).length
    const perfect = correct === wordResults.length
    return {
      gems: READING_FINISH_GEMS + correct + (perfect ? READING_PERFECT_BONUS : 0),
      xp: 10 + correct,
      perfect,
      // no score, so nothing to beat — Hardop lezen is untimed by design
      newRecord: false,
    }
  }

  const perfect = answers.length > 0 && answers.every((a) => a.correct)
  const newRecord = score !== undefined && score > prevRecord
  const gems =
    10 + (perfect ? 5 : 0) + (lesson.kind === 'eindbaas' ? 10 : 0) + (newRecord ? 10 : 0)
  const xp = 10 + answers.filter((a) => a.correct).length
  return { gems, xp, perfect, newRecord }
}
