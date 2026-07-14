import { useNavigate } from 'react-router-dom'
import { path, allLessons } from '../data/path'
import { useProgress, daysThisWeek } from '../state/progress'
import type { Lesson, LessonKind } from '@shared/src/types'

const KIND_ICON: Record<LessonKind, string> = {
  les: '⭐',
  'flits-uitdaging': '⚡',
  herhaling: '🔁',
  eindbaas: '👑',
}

export function PathScreen() {
  const navigate = useNavigate()
  const completedLessons = useProgress((s) => s.completedLessons)
  const gems = useProgress((s) => s.gems)
  const practiceDays = useProgress((s) => s.practiceDays)
  const font = useProgress((s) => s.settings.font)
  const toggleFont = useProgress((s) => s.toggleFont)

  // Linear unlock: first not-completed lesson is the active one
  const firstOpenIdx = allLessons.findIndex((l) => !completedLessons[l.id])

  function nodeState(lesson: Lesson): 'done' | 'active' | 'locked' {
    if (completedLessons[lesson.id]) return 'done'
    const idx = allLessons.findIndex((l) => l.id === lesson.id)
    return idx === firstOpenIdx ? 'active' : 'locked'
  }

  return (
    <div>
      <div className="topbar">
        <span className="gems">💎 {gems}</span>
        <span className="mascot-corner">🦊</span>
        <span className="week" title="Weekdoel: 5 van de 7 dagen">
          🔥 {daysThisWeek(practiceDays)}/5
        </span>
        <button
          className="quit"
          style={{ background: 'none', color: 'inherit', fontSize: 16, opacity: 0.7 }}
          onClick={toggleFont}
        >
          {font === 'standaard' ? 'Aa' : 'Aa✓'}
        </button>
      </div>

      {path.map((fase) => (
        <section key={fase.id}>
          <div
            className="fase-header"
            style={{ background: `linear-gradient(135deg, ${fase.color1}, ${fase.color2})` }}
          >
            {fase.title}
          </div>
          {fase.units.map((unit) => (
            <div key={unit.id}>
              <div className="unit-title">{unit.title}</div>
              <div className="path-nodes">
                {unit.lessons.map((lesson) => {
                  const state = nodeState(lesson)
                  return (
                    <button
                      key={lesson.id}
                      className={`path-node ${state === 'done' ? 'done' : ''} ${state === 'locked' ? 'locked' : ''}`}
                      disabled={state === 'locked'}
                      onClick={() => navigate(`/les/${lesson.id}`)}
                    >
                      {KIND_ICON[lesson.kind]}
                      <span className="node-label">{lesson.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
