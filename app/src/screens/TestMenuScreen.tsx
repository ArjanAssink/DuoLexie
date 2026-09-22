import { useNavigate } from 'react-router-dom'
import type { GameType } from '@shared/src/types'
import {
  allLessons, PROEFRONDE_LESSON, SPELLING_TRY_LESSONS, spellingDraftCount,
} from '../data/path'
import { getSpellingPair } from '../spelling'
import { haptic, hapticBackend, type HapticBackend } from '../audio/haptics'

const GAME_ORDER: GameType[] = [
  'flitsen',
  'tijdrit',
  'hardop-lezen',
  'weetjes',
  'maak-het-woord-af',
  'welke-klank',
  'woordbouwer',
]

const GAME_LABELS: Record<GameType, string> = {
  flitsen: 'Flitsen — kaarten omdraaien (CardFlash-port)',
  tijdrit: 'Tijdrit — 60s Goed/Nog even, klanken per minuut',
  'hardop-lezen': 'Hardop lezen — woord lezen, swipe goed/fout',
  weetjes: 'Weetjes — dyslexie-feitjes: luister, doe, bewaar',
  'maak-het-woord-af': 'Maak het woord af — sleep d of t in het gat',
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
  ['Beloning — Weetje, niets te beoordelen', 'spel=weetje'],
]

/**
 * The three shapes of buzz the app uses, to feel on a real device (docs/haptics.md). The
 * patterns are copies, not imports: the games own theirs, and this menu must not become a
 * reason to export them.
 */
const HAPTIC_SAMPLES: [string, number | number[]][] = [
  ['Tikje (kaart draait om)', 8],
  ['Ronde klaar', [15, 60, 15]],
  ['Viering (hero-beat)', [40, 50, 60, 50, 240]],
]

const BACKEND_LABEL: Record<HapticBackend, string> = {
  vibrate: 'via navigator.vibrate (Android)',
  'ios-switch': 'via de iOS-schakelaartruc (Safari 17.4+) — een iPad heeft geen trilmotor, dus voelt niets',
  none: 'niet beschikbaar in deze browser',
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
        <h2>Proberen met haar</h2>
        <button
          className="btn-primary test-menu-btn"
          onClick={() => navigate(`/les/${PROEFRONDE_LESSON.id}`)}
        >
          Proefronde lezen — 10 woorden uit heel fase 1
        </button>
        {/*
          The spelling node only appears on the path once its seed words are `reviewed:
          true` (docs/maak-het-woord-af.md §6 rule 5), so until that review has happened
          this is the only way in — and it deals the drafts, which the label says out loud.
        */}
        {SPELLING_TRY_LESSONS.map((lesson) => {
          const pair = getSpellingPair(lesson.spellingPair ?? '')
          const drafts = spellingDraftCount(lesson.spellingPair ?? '')
          return (
            <button
              key={lesson.id}
              className="btn-primary test-menu-btn"
              onClick={() => navigate(`/les/${lesson.id}`)}
            >
              Maak het woord af — {pair?.title ?? lesson.spellingPair}
              {drafts > 0 && <small>{drafts} woorden nog niet nagekeken</small>}
            </button>
          )
        })}
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
        <h2>Trillen</h2>
        <p className="test-menu-note" data-haptic-backend={hapticBackend()}>
          Op dit apparaat: {BACKEND_LABEL[hapticBackend()]}
        </p>
        {HAPTIC_SAMPLES.map(([label, pattern]) => (
          <button key={label} className="btn-primary test-menu-btn" onClick={() => haptic(pattern)}>
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
