import { useNavigate } from 'react-router-dom'
import type { Lesson, Unit } from '@shared/src/types'
import { path, allLessons } from '../data/path'
import { useProgress, daysThisWeek } from '../state/progress'
import { Frida } from '../components/Frida'
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

  function unitHasActive(unit: Unit): boolean {
    return unit.lessons.some((l) => l.id === activeLessonId)
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
              <div className="path-section">
                {unitHasActive(unit) && (
                  <Frida expression="sass" className="frida-path" alt="Frida kijkt toe" />
                )}
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
                      className={`coin-item ${state}`}
                      style={{ marginLeft: COIN_OFFSETS[i % COIN_OFFSETS.length] }}
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
