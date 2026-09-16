import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import confetti from 'canvas-confetti'
import type { AnswerRecord, WordResult } from '@shared/src/types'
import type { Reward } from '../engine/reward'
import { getWord } from '../words'
import { playEffect, playWord } from '../audio/audio'
import { Frida } from '../components/Frida'
import { useProgress } from '../state/progress'
import {
  BEATS,
  confettiCount,
  pctFor,
  praiseFor,
  showsStreak,
  tierFor,
  type Beat,
} from './rewardTimeline'
import { useCelebration } from './useCelebration'

/** What completeLesson computed, plus the bits only the display needs. */
export interface DisplayReward extends Reward {
  /** klanken per minuut, for Tijdrit */
  score?: number
  /** Hardop lezen only — one entry per word she graded */
  wordResults?: WordResult[]
  /**
   * Klank games — one record per klank she answered. The stat card needs a denominator, and
   * for everything that is not a reading round `answers.length` is the unit `computeReward`
   * already scores on, so the card and the gems agree by construction.
   */
  answers?: AnswerRecord[]
}

interface Props {
  reward: DisplayReward
  onDone: () => void
}

/** One gem lands every this often, each a step brighter than the last. */
const GEM_TICK_MS = 90
/** Gems per step up the tick scale, so a long count-up still ends on a musical note. */
const GEMS_PER_TICK_STEP = 4

/** Gold, the same three the hero's headline is built from. canvas-confetti needs literals. */
const CONFETTI_COLORS = ['#F7C531', '#D9A616', '#FFF1B8']

/** Beats in which the reward strip and its gem count-up are on screen. */
function stripIsUp(beat: Beat): boolean {
  return beat === 'strip' || beat === 'done'
}

/**
 * The end of a round: the celebration first, then what she earned, then — for a reading
 * round — which words went on "nog even", listed so she and a parent can see what to
 * practise. Tapping one plays it again.
 *
 * The sequence is specified in docs/reward-celebration.md. This component owns none of its
 * timing: `useCelebration` holds every timer and hands back `beat` and `progress`, and the
 * choreography itself is CSS keyed off `data-beat`, so making the whole thing jump to its
 * end is a one-attribute change rather than a dozen separately cancelled animations.
 */
export function RewardScreen({ reward, onDone }: Props) {
  const playerName = useProgress((s) => s.settings.playerName)

  const wordResults = reward.wordResults ?? []
  const reading = wordResults.length > 0
  const missed = wordResults.filter((r) => !r.correct)

  // A reading round is scored per word; every other game per klank — the same two units
  // computeReward branches on, so the percentage on the card can never tell a different
  // story from the gems underneath it.
  const total = reading ? wordResults.length : (reward.answers?.length ?? 0)
  const correct = reading
    ? wordResults.filter((r) => r.correct).length
    : (reward.answers?.filter((a) => a.correct).length ?? 0)
  const pct = pctFor(correct, total)

  const praise = praiseFor(pct, reward.perfect, reading, playerName)

  const [shownGems, setShownGems] = useState(0)

  // Sound and confetti are the reward screen's own now: the burst used to fire from
  // GameScreen.handleComplete, a beat before this screen even mounted, so it was already
  // thinning out by the time Frida arrived. Firing it from the hero beat is what makes the
  // two read as one moment — and puts it behind the same reduced-motion and skip gates as
  // everything else.
  const handleBeat = useCallback(
    (beat: Beat) => {
      if (beat === 'hero') {
        if (showsStreak(pct)) playEffect('whoosh')
        const particleCount = confettiCount(pct, reward.newRecord, reading ? correct : undefined)
        if (particleCount > 0) {
          confetti({
            particleCount,
            spread: 85,
            origin: { y: 0.35 },
            shapes: ['square'],
            colors: CONFETTI_COLORS,
          })
        }
      }
      if (beat === 'card') playEffect('cardPop')
    },
    [pct, correct, reading, reward.newRecord],
  )

  const handleTierUp = useCallback((step: number) => playEffect('tierUp', step), [])

  const { beat, progress, skipped, skip } = useCelebration({
    pct,
    onBeat: handleBeat,
    onTierUp: handleTierUp,
  })

  // The number and the bar are the same value rendered twice — see easeBar's note. Rounding
  // last means the label lands on exactly `pct` rather than on whatever the final frame
  // happened to compute.
  const shownPct = Math.round(progress * pct)
  const tier = tierFor(shownPct)

  /**
   * Below 50% the room is quieter (§5): no streak, no confetti, and a gentle pop-in rather
   * than the burst. It has to be its own flag rather than something CSS reads off
   * `data-tier`, because at the hero beat every round is still `geoefend` — the bar has not
   * started filling yet, which is the entire point of the tier climbing while it does.
   */
  const quiet = !showsStreak(pct)

  // Count the gems up one at a time rather than printing the total: the counting *is* the
  // reward moment, and it costs a second and a half. It starts with the strip and is
  // deliberately allowed to run on into `done` — under reduced motion the screen mounts in
  // `done`, so this starts immediately and behaves exactly as it did before.
  const countGems = stripIsUp(beat)
  useEffect(() => {
    if (!countGems || reward.gems <= 0) return
    let n = 0
    const timer = setInterval(() => {
      n += 1
      setShownGems(n)
      playEffect('tick', Math.floor((n - 1) / GEMS_PER_TICK_STEP))
      if (n >= reward.gems) clearInterval(timer)
    }, GEM_TICK_MS)
    return () => clearInterval(timer)
  }, [reward.gems, countGems])

  /**
   * A tap anywhere jumps to the end. Verder is `visibility: hidden` until the last beat, so
   * it is not hit-testable before then and a tap aimed at it lands here instead — which is
   * the point: an impatient tap is never a dead tap, it is the skip, and her second tap
   * hits the button that is now there.
   */
  const atEnd = beat === 'done'
  const handleTap = useCallback(() => {
    if (!atEnd) skip()
  }, [atEnd, skip])

  return (
    <div
      className="reward-screen"
      data-beat={beat}
      data-tier={tier.id}
      data-quiet={quiet ? 'true' : undefined}
      data-skipped={skipped ? 'true' : undefined}
      onPointerDown={handleTap}
      style={
        {
          // published so the stylesheet does not keep a second copy of the schedule
          '--hero-at': `${BEATS.heroAt}ms`,
          '--settle-ms': `${BEATS.cardAt - BEATS.settleAt}ms`,
        } as CSSProperties
      }
    >
      {!quiet && (
        <div className="reward-streak" aria-hidden="true">
          <span className="streak-band streak-band-teal" />
          <span className="streak-band streak-band-gold" />
        </div>
      )}

      <div className="reward-hero">
        <div className="frida-scale">
          {/* `happy` is the only full-body pose, and a hero needs a whole dog — the drama is
              all scale, wobble, streak and confetti, never a different drawing. */}
          <Frida expression="happy" className="frida" alt="Frida is blij" />
        </div>
        <span className="reward-sparkle reward-sparkle-1" aria-hidden="true" />
        <span className="reward-sparkle reward-sparkle-2" aria-hidden="true" />
        <span className="reward-sparkle reward-sparkle-3" aria-hidden="true" />
        <span className="reward-sparkle reward-sparkle-4" aria-hidden="true" />
      </div>

      <div className="reward-title">
        <h1>{praise.headline}</h1>
        {reward.newRecord ? (
          <div className="record-banner">NIEUW RECORD!</div>
        ) : (
          <p className="reward-subline">{praise.subline}</p>
        )}
      </div>

      <div className="reward-card">
        <div className="reward-card-label">
          {/* keyed on the tier so each upgrade remounts the label and replays its bump */}
          <span key={tier.id} className="reward-card-tier">
            {tier.label}
          </span>
        </div>
        <div className="reward-bar">
          <div
            className="reward-bar-fill"
            style={{ transform: `scaleX(${(progress * pct) / 100})` }}
          />
        </div>
        <div className="reward-pct">{shownPct}%</div>
        <div className="reward-tally">
          {reading ? `${correct} goed · ${missed.length} nog even` : `${correct} van ${total} goed`}
        </div>
      </div>

      {/* One announcement, at the end, rather than a screen reader following the count-up
          digit by digit. */}
      <p className="reward-sr" aria-live="polite">
        {progress >= 1 ? `${correct} van ${total} goed` : ''}
      </p>

      <div className="reward-strip">
        {/* gems first: the existing e2e tests read the first .reward-line, and the gems are
            the line she is waiting for anyway */}
        <div className="reward-line">💎 +{shownGems}</div>
        <div className="reward-line">✨ +{reward.xp} XP</div>
      </div>

      {reward.score !== undefined && (
        <div className="reward-score">⚡ {reward.score} klanken per minuut</div>
      )}

      {missed.length > 0 && (
        <div className="reward-chips">
          {missed.map((r, i) => (
            <button
              key={`${r.wordId}-${i}`}
              className="word-chip"
              onClick={() => void playWord(r.wordId, getWord(r.wordId).text)}
            >
              🔊 {getWord(r.wordId).text}
            </button>
          ))}
        </div>
      )}

      {/* In the DOM and wired up from the first frame — only hidden. See handleTap. */}
      <button
        className="btn-primary reward-verder"
        onClick={onDone}
        aria-hidden={atEnd ? undefined : true}
        tabIndex={atEnd ? undefined : -1}
      >
        Verder
      </button>
    </div>
  )
}
