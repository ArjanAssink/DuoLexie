import { useNavigate } from 'react-router-dom'
import type { GameType } from '@shared/src/types'
import { allLessons } from '../data/path'

const GAME_ORDER: GameType[] = ['flitsen', 'tijdrit', 'hardop-lezen', 'welke-klank', 'woordbouwer']

const GAME_LABELS: Record<GameType, string> = {
  flitsen: 'Flitsen — kaarten omdraaien (CardFlash-port)',
  tijdrit: 'Tijdrit — 60s Goed/Nog even, klanken per minuut',
  'hardop-lezen': 'Hardop lezen — woord lezen, swipe goed/fout',
  'welke-klank': 'Welke klank? — nog niet gebouwd',
  woordbouwer: 'Woordbouwer — nog niet gebouwd',
}

/**
 * Not linked from anywhere in the app's own navigation — reachable only by typing
 * /#/proberen directly. Lets you jump straight into any implemented game mode without
 * playing through the lesson tree first. `?test=true` (see the link below) does the
 * same thing for the real path UI: it unlocks every node instead of skipping it.
 */
export function TestMenuScreen() {
  const navigate = useNavigate()

  return (
    <div className="avatar-screen">
      <header className="avatar-header">
        <button className="quit" aria-label="Terug" onClick={() => navigate('/')}>
          ‹
        </button>
        <h1>Probeermenu</h1>
      </header>

      <section className="avatar-picker">
        <h2>Per spelmodus</h2>
        {GAME_ORDER.map((type) => {
          const lesson = allLessons.find((l) => l.gameType === type)
          return (
            <button
              key={type}
              className="btn-primary test-menu-btn"
              disabled={!lesson}
              onClick={() => lesson && navigate(`/les/${lesson.id}`)}
            >
              {GAME_LABELS[type]}
            </button>
          )
        })}
      </section>

      <section className="avatar-picker">
        <h2>Volledig pad</h2>
        <a className="btn-primary test-menu-btn" href="/?test=true#/">
          Open het pad, alles ontgrendeld
        </a>
      </section>
    </div>
  )
}
