import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Lesson } from '@shared/src/types'
import type { GameResult } from '../screens/GameScreen'
import { buildCardDeck } from '../engine/exerciseSelector'
import { categoryOf } from '../curriculum'
import { haptic } from '../audio/audio'

interface Props {
  lesson: Lesson
  onComplete: (result: GameResult) => void
  onQuit: () => void
}

const FLY_MS = 420

interface Flight {
  id: number
  sound: string
}

/**
 * Klankkaarten — ported from CardFlash (github.com/ArjanAssink/CardFlash):
 * tap the deck, the top card flips over and flies to the discard pile. Pure
 * exposure, no grading, no narration — replaces Klankenjacht's tap-the-
 * right-tile drill, which wasn't landing as fun. Restyled to DuoLexie's
 * palette/tokens; the animation is CSS keyframes instead of a JS rAF loop.
 */
export function KlankKaarten({ lesson, onComplete, onQuit }: Props) {
  const [deck, setDeck] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [discardTop, setDiscardTop] = useState<string | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [dx, setDx] = useState(0)
  const [timerStarted, setTimerStarted] = useState(false)
  const inFlight = useRef(0)
  const flyId = useRef(0)
  const finished = useRef(false)

  const arenaRef = useRef<HTMLDivElement>(null)
  const deckRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDeck(buildCardDeck(lesson))
    setIdx(0)
    setDiscardTop(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id])

  useLayoutEffect(() => {
    function measure() {
      const arena = arenaRef.current
      const deckEl = deckRef.current
      const discardEl = discardRef.current
      if (!arena || !deckEl || !discardEl) return
      const a = arena.getBoundingClientRect()
      const d = deckEl.getBoundingClientRect()
      const t = discardEl.getBoundingClientRect()
      setDx(t.left - d.left)
      arena.style.setProperty('--kk-fly-left', `${d.left - a.left}px`)
      arena.style.setProperty('--kk-fly-top', `${d.top - a.top}px`)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (arenaRef.current) ro.observe(arenaRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    if (!timerStarted) return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [timerStarted])

  function flip() {
    if (idx >= deck.length) return
    if (!timerStarted) setTimerStarted(true)

    const sound = deck[idx]
    const isLast = idx + 1 >= deck.length
    setIdx((i) => i + 1)
    inFlight.current++
    haptic(10)

    const id = flyId.current++
    setFlights((f) => [...f, { id, sound }])

    setTimeout(() => {
      setFlights((f) => f.filter((fl) => fl.id !== id))
      setDiscardTop(sound)
      inFlight.current--

      if (isLast && inFlight.current === 0 && !finished.current) {
        finished.current = true
        onComplete({ answers: [] })
      }
    }, FLY_MS)
  }

  if (deck.length === 0) return null

  const remaining = deck.length - idx
  const done = idx
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const deckGhostShow = Math.min(Math.max(remaining - 1, 0), 3)
  const discardGhostShow = Math.min(done, 2)

  return (
    <div className="game-screen">
      <div className="game-header">
        <button className="quit" onClick={onQuit}>
          ✕
        </button>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(done / deck.length) * 100}%` }} />
        </div>
        <div className="timer-big" style={{ color: 'var(--teal)' }}>
          {fmt(elapsed)}
        </div>
      </div>
      <div className="game-stage">
        <h2>
          {done === 0
            ? 'Tik op de stapel!'
            : remaining === 0
              ? `Alle ${deck.length} kaarten omgedraaid!`
              : `${done} van ${deck.length} omgedraaid`}
        </h2>
        <div className="kk-arena" ref={arenaRef}>
          <div className="kk-stack-wrap">
            <div className="kk-stack" ref={deckRef}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`kk-ghost kk-ghost-deck kk-g${i + 1}`}
                  style={{ opacity: i < deckGhostShow ? undefined : 0 }}
                />
              ))}
              {remaining > 0 ? (
                <button className="kk-face kk-face-back" onClick={flip} aria-label="Draai een kaart om">
                  <span className="kk-star">⭐</span>
                  <span className="kk-brand">Klankkaarten</span>
                  <span className="kk-count">{remaining}</span>
                </button>
              ) : (
                <div className="kk-empty">✓ Leeg!</div>
              )}
            </div>
            <span className="kk-stack-label">Stapel ({remaining})</span>
          </div>

          {flights.map((f) => {
            const cat = categoryOf(f.sound)
            return (
              <div
                key={f.id}
                className="kk-fly"
                style={{
                  left: 'var(--kk-fly-left)',
                  top: 'var(--kk-fly-top)',
                  ['--fly-dx' as string]: `${dx}px`,
                }}
              >
                <div className="kk-fly-inner">
                  <div className="kk-face kk-face-back">
                    <span className="kk-star">⭐</span>
                    <span className="kk-brand">Klankkaarten</span>
                  </div>
                  <div
                    className="kk-face kk-face-front"
                    style={{ background: `linear-gradient(148deg, ${cat.color1} 0%, ${cat.color2} 100%)` }}
                  >
                    <span className="kk-sound">{f.sound}</span>
                    <span className="kk-cat">{cat.name}</span>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="kk-stack-wrap">
            <div className="kk-stack" ref={discardRef}>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={`kk-ghost kk-ghost-discard kk-dg${i + 1}`}
                  style={{ opacity: i < discardGhostShow ? undefined : 0 }}
                />
              ))}
              {discardTop ? (
                <div
                  className="kk-face kk-face-front"
                  style={{
                    background: `linear-gradient(148deg, ${categoryOf(discardTop).color1} 0%, ${categoryOf(discardTop).color2} 100%)`,
                  }}
                >
                  <span className="kk-sound">{discardTop}</span>
                  <span className="kk-cat">{categoryOf(discardTop).name}</span>
                </div>
              ) : (
                <div className="kk-empty">Omgedraaid</div>
              )}
            </div>
            <span className="kk-stack-label">Omgedraaid ({done})</span>
          </div>
        </div>
        {remaining > 0 && <p className="kk-tap-hint">👆 Tik op de stapel</p>}
      </div>
    </div>
  )
}
