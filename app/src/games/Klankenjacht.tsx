import { useEffect, useRef, useState } from 'react'
import type { Lesson, AnswerRecord } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { buildExercises, type Exercise } from '../engine/exerciseSelector'
import { useProgress } from '../state/progress'
import { playSound, playEffect } from '../audio/audio'

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

/**
 * Klankenjacht — hear a sound, tap the matching letters (klank→teken).
 * Wrong answers shake, play the correct sound, and re-queue the exercise.
 */
export function Klankenjacht({ lesson, onComplete, onQuit }: Props) {
  const soundStats = useProgress((s) => s.soundStats)

  const [queue, setQueue] = useState<Exercise[]>([])
  const [total, setTotal] = useState(0)
  const [feedback, setFeedback] = useState<{ tapped: string; correct: boolean } | null>(null)
  const answers = useRef<AnswerRecord[]>([])
  const shownAt = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    const exercises = buildExercises(lesson, soundStats)
    setQueue(exercises)
    setTotal(exercises.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id])

  const current = queue[0]

  useEffect(() => {
    if (!current) return
    shownAt.current = performance.now()
    playSound(current.targetSound)
  }, [current])

  async function tap(option: string) {
    if (!current || busy.current) return
    busy.current = true
    const correct = option === current.targetSound
    const ms = performance.now() - shownAt.current
    answers.current.push({
      soundId: current.targetSound,
      correct,
      ms,
      confusedWith: correct ? undefined : option,
    })
    setFeedback({ tapped: option, correct })
    playEffect(correct ? 'good' : 'bad')

    if (!correct) {
      // let her hear the right answer before moving on
      await new Promise((r) => setTimeout(r, 500))
      await playSound(current.targetSound)
    }
    await new Promise((r) => setTimeout(r, correct ? 600 : 900))

    setFeedback(null)
    busy.current = false
    setQueue((q) => {
      const [head, ...rest] = q
      const next = correct ? rest : [...rest, head] // re-queue on miss
      if (next.length === 0) {
        onComplete({ answers: answers.current })
      }
      return next
    })
  }

  if (!current) return null

  const doneCount = total - queue.length
  return (
    <div className="game-screen">
      <div className="game-header">
        <button className="quit" onClick={onQuit}>✕</button>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(doneCount / total) * 100}%` }} />
        </div>
      </div>
      <div className="game-stage">
        <h2>Welke klank hoor je?</h2>
        <button className="prompt-speaker" onClick={() => playSound(current.targetSound)}>
          🔊
        </button>
        <div className="tile-grid">
          {current.options.map((option) => {
            let cls = 'tile'
            if (feedback) {
              if (option === current.targetSound) cls = 'tile correct'
              else if (option === feedback.tapped && !feedback.correct) cls = 'tile wrong'
            }
            return (
              <button key={option} className={cls} onClick={() => tap(option)}>
                {option}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
