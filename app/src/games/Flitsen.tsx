import { useEffect, useRef, useState } from 'react'
import type { Lesson, AnswerRecord } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { buildFlitsDeck } from '../engine/exerciseSelector'
import { useProgress } from '../state/progress'
import { playEffect } from '../audio/audio'
import { Frida } from '../components/Frida'

const ROUND_SECONDS = 60

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

/**
 * Flitsen — the digital version of RID flashcard practice. Speed-focused:
 * read the sound aloud, tap Goed/Nog even, beat your klanken-per-minuut record.
 */
export function Flitsen({ lesson, onComplete, onQuit }: Props) {
  const soundStats = useProgress((s) => s.soundStats)
  const record = useProgress((s) => s.records[lesson.id] ?? 0)

  const [deck, setDeck] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS)
  const [started, setStarted] = useState(false)
  const answers = useRef<AnswerRecord[]>([])
  const shownAt = useRef(0)
  const done = useRef(false)

  useEffect(() => {
    setDeck(buildFlitsDeck(lesson, soundStats))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id])

  useEffect(() => {
    if (!started) return
    shownAt.current = performance.now()
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer)
          finish()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  function finish() {
    if (done.current) return
    done.current = true
    const correct = answers.current.filter((a) => a.correct).length
    onComplete({ answers: answers.current, score: correct })
  }

  function grade(correct: boolean) {
    const ms = performance.now() - shownAt.current
    answers.current.push({ soundId: deck[idx % deck.length], correct, ms })
    playEffect(correct ? 'good' : 'bad')
    setIdx((i) => i + 1)
    shownAt.current = performance.now()
  }

  if (!started) {
    return (
      <div className="game-screen">
        <div className="game-header">
          <button className="quit" onClick={onQuit}>✕</button>
        </div>
        <div className="game-stage">
          <Frida expression="sass" width={150} alt="Frida" />
          <h1 style={{ textAlign: 'center' }}>⚡ Flitsen!</h1>
          <p style={{ textAlign: 'center', maxWidth: 320 }}>
            Lees elke klank hardop, zo snel als je kunt.
            Tik daarna <b>Goed!</b> of <b>Nog even</b>.
          </p>
          {record > 0 && <p>Jouw record: <b>⚡ {record}</b> — versla jezelf!</p>}
          <button className="btn-primary" onClick={() => setStarted(true)}>
            Start! ({ROUND_SECONDS} sec)
          </button>
        </div>
      </div>
    )
  }

  const currentSound = deck.length > 0 ? deck[idx % deck.length] : ''
  const correctSoFar = answers.current.filter((a) => a.correct).length

  return (
    <div className="game-screen">
      <div className="game-header">
        <button className="quit" onClick={onQuit}>✕</button>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${(secondsLeft / ROUND_SECONDS) * 100}%`, background: 'var(--accent)' }}
          />
        </div>
        <div className="timer-big">{secondsLeft}</div>
      </div>
      <div className="game-stage">
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          ⚡ {correctSoFar} {record > 0 && <span style={{ opacity: 0.6 }}>· record {record}</span>}
        </div>
        <div className="flash-card">{currentSound}</div>
        <div className="grade-buttons">
          <button className="btn-bad" onClick={() => grade(false)}>Nog even</button>
          <button className="btn-primary" onClick={() => grade(true)}>Goed!</button>
        </div>
      </div>
    </div>
  )
}
