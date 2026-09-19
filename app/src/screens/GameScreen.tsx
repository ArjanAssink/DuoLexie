import { useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { AnswerRecord, GameType, Lesson, WordResult } from '@shared/src/types'
import { lessonById } from '../data/path'
import { useProgress } from '../state/progress'
import { Flitsen } from '../games/Flitsen'
import { Tijdrit } from '../games/Tijdrit'
import { HardopLezen } from '../games/HardopLezen'
import { Weetjes } from '../games/Weetjes'
import { haptic, playEffect } from '../audio/audio'
import { RewardScreen, type DisplayReward } from './RewardScreen'
import type { GemLandingState } from './gemLanding'

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
  weetjes: Weetjes,
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
    setReward({
      ...reward,
      // a Weetje round is celebrated differently, because it has nothing to grade
      kind: lesson.kind,
      score: result.score,
      wordResults: result.wordResults,
      // the stat card's denominator for every game that is not scored per word
      answers: result.answers,
    })
    playEffect('fanfare')
    haptic(reward.newRecord ? [15, 60, 15, 60, 25] : [15, 60, 15])
    // The confetti used to fire here, and its sizing formula with it. Both now live in the
    // reward screen's hero beat (screens/rewardTimeline.ts confettiCount,
    // docs/reward-celebration.md §6): fired from here it landed a beat before the screen it
    // was celebrating had even mounted, and it could not be skipped or switched off with
    // the rest of the sequence. The fanfare and the haptics stay — they belong to the
    // moment the round ends, not to the celebration that follows it.
  }

  if (reward) {
    /*
     * The gems travel with her. `completeLesson` credited them a beat ago, so the leerpad's
     * counter is already at the new total — handing it the number she just earned lets it
     * hold that back and let the gems land in it (screens/gemLanding.ts,
     * docs/kist-openen.md §4). Nothing depends on it: a leerpad reached any other way gets
     * no state and shows the plain total.
     */
    return (
      <RewardScreen
        reward={reward}
        onDone={() => navigate('/', { state: { gemsLanded: reward.gems } satisfies GemLandingState })}
      />
    )
  }

  const Game = GAMES[lesson.gameType]
  return <Game lesson={lesson} onComplete={handleComplete} onQuit={() => navigate('/')} />
}
