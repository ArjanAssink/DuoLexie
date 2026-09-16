import { useNavigate } from 'react-router-dom'
import type { GameType } from '@shared/src/types'
import { allLessons, PROEFRONDE_LESSON } from '../data/path'

const GAME_ORDER: GameType[] = ['flitsen', 'tijdrit', 'hardop-lezen', 'welke-klank', 'woordbouwer']

const GAME_LABELS: Record<GameType, string> = {
  flitsen: 'Flitsen — kaarten omdraaien (CardFlash-port)',
  tijdrit: 'Tijdrit — 60s Goed/Nog even, klanken per minuut',
  'hardop-lezen': 'Hardop lezen — woord lezen, swipe goed/fout',
  'welke-klank': 'Welke klank? — nog niet gebouwd',
  woordbouwer: 'Woordbouwer — nog niet gebouwd',
}

/**
 * The celebration after a round, without a round (screens/RewardPreviewScreen.tsx). Every
 * tier, so it can be looked at by eye — and the entry the e2e tests use, which is what took
 * the reward-screen suite from eight ten-card rounds down to one.
 */
const REWARD_PREVIEWS: [string, string][] = [
  ['Beloning — 10/10, Perfect!', 'goed=10&totaal=10'],
  ['Beloning — 8/10, Super', 'goed=8&totaal=10'],
  ['Beloning — 7/10, Goed', 'goed=7&totaal=10'],
  ['Beloning — 0/10, Geoefend', 'goed=0&totaal=10'],
  ['Beloning — Tijdrit met NIEUW RECORD', 'spel=klank&goed=9&totaal=10&score=48&record=1'],
]

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
        <h2>Proberen met haar</h2>
        <button
          className="btn-primary test-menu-btn"
          onClick={() => navigate(`/les/${PROEFRONDE_LESSON.id}`)}
        >
          Proefronde lezen — 10 woorden uit heel fase 1
        </button>
      </section>

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
        <h2>Beloningsscherm</h2>
        {REWARD_PREVIEWS.map(([label, query]) => (
          <button
            key={query}
            className="btn-primary test-menu-btn"
            onClick={() => navigate(`/beloning?${query}`)}
          >
            {label}
          </button>
        ))}
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
