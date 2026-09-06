import { useEffect, useRef, useState } from 'react'
import type { Lesson, AnswerRecord } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { buildTijdritDeck } from '../engine/exerciseSelector'
import { useProgress } from '../state/progress'
import { haptic, playEffect } from '../audio/audio'
import { Frida } from '../components/Frida'
import { Bliksemsprint } from '../components/Bliksemsprint'

const ROUND_SECONDS = 60
/** Consecutive correct answers that earn a Bliksemsprint. */
const STREAK_FOR_BURST = 3

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

/**
 * Tijdrit — the digital version of RID flashcard practice (formerly called
 * "Flitsen"; that name moved to the CardFlash-ported card-flip game). Speed-
 * focused: read the sound aloud, tap Goed/Nog even, beat your klanken-per-
 * minuut record.
 */
export function Tijdrit({ lesson, onComplete, onQuit }: Props) {
  const soundStats = useProgress((s) => s.soundStats)
  const record = useProgress((s) => s.records[lesson.id] ?? 0)

  const [deck, setDeck] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS)
  const [started, setStarted] = useState(false)
  const answers = useRef<AnswerRecord[]>([])
  const shownAt = useRef(0)
  const done = useRef(false)
  const streak = useRef(0)
  /** 0 = idle; any other value keys a running Bliksemsprint so a re-trigger restarts it */
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    setDeck(buildTijdritDeck(lesson, soundStats))
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
    haptic(correct ? 12 : [10, 40, 10])

    // Fire on *reaching* the streak, not on every multiple of it: a 30-correct run
    // celebrates once instead of ten times, which would bury the card she's reading.
    // A wrong answer resets, so the next run earns its own.
    if (correct) {
      streak.current += 1
      if (streak.current === STREAK_FOR_BURST) setBurst((b) => b + 1)
    } else {
      streak.current = 0
    }

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
          <h1 style={{ textAlign: 'center' }}>⚡ Tijdrit!</h1>
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
        <div className="flash-card" key={idx}>{currentSound}</div>
        <div className="grade-buttons">
          <button className="btn-bad" onClick={() => grade(false)}>Nog even</button>
          <button className="btn-primary" onClick={() => grade(true)}>Goed!</button>
        </div>
      </div>
      {burst > 0 && <Bliksemsprint key={burst} onDone={() => setBurst(0)} />}
    </div>
  )
}
