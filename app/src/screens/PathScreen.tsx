import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Lesson, Unit } from '@shared/src/types'
import { path, allLessons } from '../data/path'
import { useProgress, daysThisWeek } from '../state/progress'
import { Frida } from '../components/Frida'
import { FridaTap } from '../components/FridaTap'
import {
  LessonIcon,
  GemIcon,
  FlameIcon,
  ListIcon,
  HouseIcon,
  ChestIcon,
  PersonIcon,
} from '../components/Icons'

// Zig-zag: horizontal offsets per lesson position within a unit (design: 0/+130/+40/+150)
const COIN_OFFSETS = [0, 130, 40, 150]

type CoinState = 'done' | 'active' | 'locked'

interface Point {
  x: number
  y: number
}

function pointsEqual(a: Point[], b: Point[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => Math.abs(p.x - b[i].x) < 0.5 && Math.abs(p.y - b[i].y) < 0.5)
}

/** Smooth S-curve through consecutive coin centers — the "road" under the path. */
function buildTrackPath(points: Point[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const midY = (prev.y + curr.y) / 2
    d += ` C ${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`
  }
  return d
}

interface UnitPathProps {
  unit: Unit
  activeLessonId: string | null
  coinState: (lesson: Lesson) => CoinState
  iconFill: (state: CoinState) => string
  navigate: ReturnType<typeof useNavigate>
}

/** One unit's zig-zag lesson coins, with a dotted road drawn through their measured centers. */
function UnitPath({ unit, activeLessonId, coinState, iconFill, navigate }: UnitPathProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [points, setPoints] = useState<Point[]>([])

  // no dep array: re-measure after every render (coin size/label changes with state), guarded
  // against redundant setState by pointsEqual so it can't loop.
  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()
      const next: Point[] = []
      for (const el of itemRefs.current) {
        if (!el) return
        const coin = el.querySelector('.coin')
        const rect = (coin ?? el).getBoundingClientRect()
        next.push({
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.top + rect.height / 2 - containerRect.top,
        })
      }
      setPoints((prev) => (pointsEqual(prev, next) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  })

  const hasActive = unit.lessons.some((l) => l.id === activeLessonId)

  return (
    <div className="path-section" ref={containerRef}>
      <svg className="path-track" aria-hidden="true">
        <path d={buildTrackPath(points)} />
      </svg>
      {hasActive && <FridaTap className="frida-path" />}
      {unit.lessons.map((lesson, i) => {
        const state = coinState(lesson)
        const clickable = state !== 'locked'
        const coin = (
          <button
            className="coin"
            aria-label={`${lesson.title}${state === 'locked' ? ' — vergrendeld' : ''}`}
            disabled={!clickable}
            onClick={() => clickable && navigate(`/les/${lesson.id}`)}
          >
            <LessonIcon
              title={lesson.title}
              fill={iconFill(state)}
              size={state === 'active' ? 34 : 28}
            />
          </button>
        )
        return (
          <div
            key={lesson.id}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className={`coin-item ${state}`}
            style={{
              marginLeft: COIN_OFFSETS[i % COIN_OFFSETS.length],
              animationDelay: `${i * 55}ms`,
            }}
          >
            {state === 'active' ? (
              <div className="coin-ring">
                <div className="ring" />
                {coin}
              </div>
            ) : (
              coin
            )}
            <span className="coin-label">{lesson.title}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PathScreen() {
  const navigate = useNavigate()
  const completedLessons = useProgress((s) => s.completedLessons)
  const gems = useProgress((s) => s.gems)
  const practiceDays = useProgress((s) => s.practiceDays)
  const font = useProgress((s) => s.settings.font)
  const toggleFont = useProgress((s) => s.toggleFont)

  const firstOpenIdx = allLessons.findIndex((l) => !completedLessons[l.id])
  const activeLessonId = firstOpenIdx === -1 ? null : allLessons[firstOpenIdx].id

  function coinState(lesson: Lesson): CoinState {
    if (completedLessons[lesson.id]) return 'done'
    return lesson.id === activeLessonId ? 'active' : 'locked'
  }

  function iconFill(state: CoinState): string {
    if (state === 'active') return '#FFFFFF'
    if (state === 'done') return 'var(--gold-icon)'
    return 'var(--muted)'
  }

  return (
    <>
      <header className="statbar">
        <span className="stat gems">
          <GemIcon /> {gems}
        </span>
        <Frida expression="head-grumpy" className="frida-head" />
        <span className="stat streak" title="Weekdoel: 5 van de 7 dagen">
          <FlameIcon /> {daysThisWeek(practiceDays)}/5
        </span>
        <button
          className={`aa-toggle ${font === 'dyslexie' ? 'on' : ''}`}
          aria-label="Leesmodus"
          onClick={toggleFont}
        >
          Aa
        </button>
      </header>

      <main>
        {path.map((fase, faseIdx) =>
          fase.units.map((unit, unitIdx) => (
            <section key={unit.id}>
              {(faseIdx > 0 || unitIdx > 0) && (
                <div className="letters-divider">
                  <div className="line" />
                  <span className="letters">{unit.sounds.join(' · ')}</span>
                  <div className="line" />
                </div>
              )}
              <div className="unit-card">
                <div className="unit-text">
                  <span className="kicker">
                    Deel {faseIdx + 1} · {fase.title}
                  </span>
                  <span className="title">{unit.title}</span>
                </div>
                <div className="divider" />
                <button className="overview-btn" aria-label="Overzicht">
                  <ListIcon />
                </button>
              </div>
              <UnitPath
                unit={unit}
                activeLessonId={activeLessonId}
                coinState={coinState}
                iconFill={iconFill}
                navigate={navigate}
              />
            </section>
          )),
        )}
      </main>

      <nav className="bottomnav">
        <button className="nav-active" aria-label="Leerpad">
          <HouseIcon />
        </button>
        <button className="nav-letters" aria-label="Letters">
          Aa
        </button>
        <button aria-label="Beloningen">
          <ChestIcon />
        </button>
        <button aria-label="Profiel">
          <PersonIcon />
        </button>
      </nav>
    </>
  )
}
