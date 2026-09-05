import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Lesson, AnswerRecord } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { buildWordExercises } from '../engine/exerciseSelector'
import { getWord } from '../words'
import { playWord, playEffect, haptic } from '../audio/audio'

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

const SWIPE_THRESHOLD = 90
const FLY_DISTANCE = 500

/**
 * Hardop lezen — a word card appears, is pronounced shortly after (self-check
 * against her own reading), and she swipes it right ("goed") or left ("nog
 * even") to grade herself. Untimed, no re-queue on miss — a read-through, not
 * a drill loop. Right plays a ding, left a silly buzz (playEffect('fart')).
 */
export function HardopLezen({ lesson, onComplete, onQuit }: Props) {
  const [queue, setQueue] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flying, setFlying] = useState(false)
  const answers = useRef<AnswerRecord[]>([])
  const shownAt = useRef(0)
  const startX = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    const ids = buildWordExercises(lesson)
    setQueue(ids)
    setTotal(ids.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id])

  const currentId = queue[0]
  const current = currentId ? getWord(currentId) : undefined

  useEffect(() => {
    if (!current) return
    shownAt.current = performance.now()
    const t = setTimeout(() => playWord(current.id, current.text), 450)
    return () => clearTimeout(t)
  }, [current])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy.current || !current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    startX.current = e.clientX
    setDragging(true)
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    setDragX(e.clientX - startX.current)
  }
  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      commit(dragX > 0 ? 'right' : 'left')
    } else {
      setDragX(0)
    }
  }

  async function commit(direction: 'left' | 'right') {
    if (!current || busy.current) return
    busy.current = true
    const correct = direction === 'right'
    const ms = performance.now() - shownAt.current
    for (const klank of current.klanken) {
      answers.current.push({ soundId: klank, correct, ms })
    }

    setFlying(true)
    setDragX(direction === 'right' ? FLY_DISTANCE : -FLY_DISTANCE)
    playEffect(correct ? 'good' : 'fart')
    haptic(correct ? 12 : [10, 40, 10])

    await new Promise((r) => setTimeout(r, 320))
    if (!correct) {
      // reinforce the right pronunciation before moving on
      await playWord(current.id, current.text)
      await new Promise((r) => setTimeout(r, 250))
    }

    setFlying(false)
    setDragX(0)
    busy.current = false
    // plain call, not inside setQueue's updater — calling onComplete (which updates
    // GameScreen's state) from inside a functional setState update triggers React's
    // "Cannot update a component while rendering a different component" warning
    const next = queue.slice(1)
    setQueue(next)
    if (next.length === 0) onComplete({ answers: answers.current })
  }

  if (!current) return null

  const doneCount = total - queue.length
  const rotate = dragX / 18
  const rightOpacity = Math.max(0, Math.min(1, dragX / SWIPE_THRESHOLD))
  const leftOpacity = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD))

  return (
    <div className="game-screen">
      <div className="game-header">
        <button className="quit" onClick={onQuit}>
          ✕
        </button>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(doneCount / total) * 100}%` }} />
        </div>
      </div>
      <div className="game-stage hardop-stage">
        <h2>Lees het woord hardop</h2>
        <div className="swipe-arena">
          <span className="swipe-stamp swipe-stamp-left" style={{ opacity: leftOpacity }}>
            NOG EVEN
          </span>
          <span className="swipe-stamp swipe-stamp-right" style={{ opacity: rightOpacity }}>
            GOED!
          </span>
          <div
            className="word-card"
            style={{
              transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
              transition: dragging ? 'none' : 'transform 0.32s ease-out, opacity 0.32s ease-out',
              opacity: flying ? 0 : 1,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {current.text}
          </div>
        </div>
        <p className="swipe-hint">Sleep naar rechts als het goed ging, naar links als het nog niet lukte</p>
      </div>
    </div>
  )
}
