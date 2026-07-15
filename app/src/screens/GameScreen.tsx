import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import type { AnswerRecord } from '@shared/src/types'
import { lessonById } from '../data/path'
import { useProgress } from '../state/progress'
import { Flitsen } from '../games/Flitsen'
import { Klankenjacht } from '../games/Klankenjacht'
import { playEffect } from '../audio/audio'
import { Frida } from '../components/Frida'

export interface GameResult {
  answers: AnswerRecord[]
  /** klanken per minuut for Flitsen */
  score?: number
}

interface Reward {
  gems: number
  xp: number
  perfect: boolean
  newRecord: boolean
  score?: number
}

export function GameScreen() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const completeLesson = useProgress((s) => s.completeLesson)
  const [reward, setReward] = useState<Reward | null>(null)

  const lesson = lessonId ? lessonById(lessonId) : undefined
  if (!lesson) {
    navigate('/')
    return null
  }

  function handleComplete(result: GameResult) {
    if (!lesson) return
    const perfect = result.answers.length > 0 && result.answers.every((a) => a.correct)
    const gems = 10 + (perfect ? 5 : 0) + (lesson.kind === 'eindbaas' ? 10 : 0)
    const xp = 10 + result.answers.filter((a) => a.correct).length
    const { newRecord } = completeLesson({
      lessonId: lesson.id,
      answers: result.answers,
      gems,
      xp,
      score: result.score,
    })
    setReward({ gems: gems + (newRecord ? 10 : 0), xp, perfect, newRecord, score: result.score })
    playEffect('fanfare')
    confetti({ particleCount: newRecord ? 220 : 120, spread: 85, origin: { y: 0.7 } })
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

  const Game = lesson.gameType === 'flitsen' ? Flitsen : Klankenjacht
  return <Game lesson={lesson} onComplete={handleComplete} onQuit={() => navigate('/')} />
}
