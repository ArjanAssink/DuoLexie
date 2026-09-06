import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import type { AnswerRecord, WordResult } from '@shared/src/types'
import { lessonById } from '../data/path'
import { useProgress } from '../state/progress'
import type { Reward } from '../engine/reward'
import { Flitsen } from '../games/Flitsen'
import { Tijdrit } from '../games/Tijdrit'
import { HardopLezen } from '../games/HardopLezen'
import { haptic, playEffect } from '../audio/audio'
import { Frida } from '../components/Frida'

export interface GameResult {
  answers: AnswerRecord[]
  /** klanken per minuut for Tijdrit */
  score?: number
  /** Hardop lezen only — one entry per word she graded */
  wordResults?: WordResult[]
}

/** What completeLesson computed (engine/reward.ts), plus the score display alone needs. */
interface DisplayReward extends Reward {
  score?: number
}

export function GameScreen() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const completeLesson = useProgress((s) => s.completeLesson)
  const [reward, setReward] = useState<DisplayReward | null>(null)

  const lesson = lessonId ? lessonById(lessonId) : undefined
  if (!lesson) {
    navigate('/')
    return null
  }

  function handleComplete(result: GameResult) {
    if (!lesson) return
    // completeLesson computes gems/xp/perfect/newRecord (engine/reward.ts) — nothing here
    // recomputes any of it, so there's nowhere for the credited and displayed numbers to
    // silently disagree the way they used to.
    const reward = completeLesson({
      lesson,
      answers: result.answers,
      score: result.score,
      wordResults: result.wordResults,
    })
    setReward({ ...reward, score: result.score })
    playEffect('fanfare')
    haptic(reward.newRecord ? [15, 60, 15, 60, 25] : [15, 60, 15])
    confetti({ particleCount: reward.newRecord ? 220 : 120, spread: 85, origin: { y: 0.7 } })
  }

  if (reward) {
    return (
      <div className="reward-screen">
        <Frida
          expression={reward.newRecord ? 'head-celebrating' : 'happy'}
          className="frida"
          alt="Frida is blij"
        />
        {reward.newRecord && <div className="record-banner">NIEUW RECORD!</div>}
        <h1>{reward.perfect ? 'Perfect!' : 'Goed gedaan!'}</h1>
        {reward.score !== undefined && (
          <div className="reward-line">⚡ {reward.score} klanken per minuut</div>
        )}
        <div className="reward-line">💎 +{reward.gems}</div>
        <div className="reward-line">✨ +{reward.xp} XP</div>
        <button className="btn-primary" onClick={() => navigate('/')}>
          Verder
        </button>
      </div>
    )
  }

  const Game =
    lesson.gameType === 'tijdrit'
      ? Tijdrit
      : lesson.gameType === 'hardop-lezen'
        ? HardopLezen
        : Flitsen
  return <Game lesson={lesson} onComplete={handleComplete} onQuit={() => navigate('/')} />
}
