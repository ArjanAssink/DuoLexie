import { useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import type { AnswerRecord, GameType, Lesson, WordResult } from '@shared/src/types'
import { lessonById } from '../data/path'
import { useProgress } from '../state/progress'
import { Flitsen } from '../games/Flitsen'
import { Tijdrit } from '../games/Tijdrit'
import { HardopLezen } from '../games/HardopLezen'
import { haptic, playEffect } from '../audio/audio'
import { RewardScreen, type DisplayReward } from './RewardScreen'

export interface GameResult {
  answers: AnswerRecord[]
  /** klanken per minuut for Tijdrit */
  score?: number
  /** Hardop lezen only — one entry per word she graded */
  wordResults?: WordResult[]
}

interface GameProps {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

/**
 * Placeholder for a GameType with no real component yet (`welke-klank`, `woordbouwer`) — an
 * honest "not built" screen, not the previous fallback of silently rendering whichever game
 * happened to sit last in a ternary chain.
 */
function NotImplementedGame({ onQuit }: GameProps) {
  return (
    <div className="game-screen">
      <div className="game-header">
        <button className="quit" onClick={onQuit}>
          ✕
        </button>
      </div>
      <div className="game-stage">
        <h2>Dit spel bestaat nog niet</h2>
        <button className="btn-primary" onClick={onQuit}>
          Terug naar het pad
        </button>
      </div>
    </div>
  )
}

/**
 * docs/backend-readiness.md A6 — a `Record<GameType, ...>` instead of a ternary chain, so
 * adding a GameType without adding it here is a compile error, not a silently-wrong game
 * at runtime.
 */
const GAMES: Record<GameType, ComponentType<GameProps>> = {
  flitsen: Flitsen,
  tijdrit: Tijdrit,
  'hardop-lezen': HardopLezen,
  'welke-klank': NotImplementedGame,
  woordbouwer: NotImplementedGame,
}

export function GameScreen() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const completeLesson = useProgress((s) => s.completeLesson)
  const [reward, setReward] = useState<DisplayReward | null>(null)
  /**
   * Every "credit this lesson once" guarantee used to live inside the game components, so
   * any game that fired onComplete twice — or once after unmount — double-credited gems, XP
   * and the session log. Guard it here too, where the crediting actually happens.
   */
  const credited = useRef(false)

  const lesson = lessonId ? lessonById(lessonId) : undefined
  if (!lesson) {
    navigate('/')
    return null
  }

  function handleComplete(result: GameResult) {
    if (!lesson || credited.current) return
    credited.current = true
    // completeLesson computes gems/xp/perfect/newRecord (engine/reward.ts) — nothing here
    // recomputes any of it, so there's nowhere for the credited and displayed numbers to
    // silently disagree the way they used to.
    const reward = completeLesson({
      lesson,
      answers: result.answers,
      score: result.score,
      wordResults: result.wordResults,
    })
    setReward({ ...reward, score: result.score, wordResults: result.wordResults })
    playEffect('fanfare')
    haptic(reward.newRecord ? [15, 60, 15, 60, 25] : [15, 60, 15])
    // a reading round's burst is sized to how much of it she got right, so ten out of ten
    // visibly outshines four out of ten
    const correctWords = result.wordResults?.filter((r) => r.correct).length
    confetti({
      particleCount: reward.newRecord
        ? 220
        : correctWords !== undefined
          ? 40 + 18 * correctWords
          : 120,
      spread: 85,
      origin: { y: 0.7 },
    })
  }

  if (reward) {
    return <RewardScreen reward={reward} onDone={() => navigate('/')} />
  }

  const Game = GAMES[lesson.gameType]
  return <Game lesson={lesson} onComplete={handleComplete} onQuit={() => navigate('/')} />
}
