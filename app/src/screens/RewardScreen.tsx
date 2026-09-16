import { useEffect, useState } from 'react'
import type { LessonKind, WordResult } from '@shared/src/types'
import type { Reward } from '../engine/reward'
import { getWord } from '../words'
import { playEffect, playWord } from '../audio/audio'
import { Frida } from '../components/Frida'
import { useProgress } from '../state/progress'

/** What completeLesson computed, plus the bits only the display needs. */
export interface DisplayReward extends Reward {
  /**
   * The lesson's kind, because one of them is celebrated differently: a `weetje` round has
   * nothing to grade, so it shows no score at all (docs/weetjes.md §2).
   */
  kind?: LessonKind
  /** klanken per minuut, for Tijdrit */
  score?: number
  /** Hardop lezen only — one entry per word she graded */
  wordResults?: WordResult[]
}

interface Props {
  reward: DisplayReward
  onDone: () => void
}

/** One gem lands every this often, each a step brighter than the last. */
const GEM_TICK_MS = 90
/** Gems per step up the tick scale, so a long count-up still ends on a musical note. */
const GEMS_PER_TICK_STEP = 4

function headline(
  reward: DisplayReward,
  correct: number,
  graded: number,
  name: string,
): string {
  // '' when she skipped the name in the welkom-flow, so every praise line has to read
  // properly without one.
  const praise = name ? `, ${name}!` : '!'
  if (reward.perfect) return `Perfect${praise}`
  if (graded === 0) return `Goed gedaan${praise}`
  // Never a failure message: the worst round still says she practised.
  return correct >= graded / 2 ? `Goed gedaan${praise}` : 'Lekker geoefend!'
}

/**
 * The end of a round: what she earned, and — for a reading round — how the two piles ended
 * up, with the words that went on "nog even" listed so she and a parent can see what to
 * practise. Tapping one plays it again.
 */
/** The Weetjes headline and the line under it (docs/weetjes.md §2) — copy is fixed. */
const WEETJE_HEADLINE = 'Nu weet je dit ook!'
const WEETJE_SUBLINE = 'Vertel het vanavond aan iemand thuis.'

export function RewardScreen({ reward, onDone }: Props) {
  const playerName = useProgress((s) => s.settings.playerName)
  /**
   * A Weetje round is never scored (engine/reward.ts pays a flat rate), so there is nothing
   * honest to put on a stat card — and putting one there anyway would turn "kinderen met
   * dyslexie zijn minder slim" into a question she can get wrong. docs/weetjes.md §2 is the
   * exception to docs/reward-celebration.md §4's "always render the card".
   */
  const isWeetje = reward.kind === 'weetje'
  const graded = reward.wordResults?.length ?? 0
  const correct = reward.wordResults?.filter((r) => r.correct).length ?? 0
  const missed = reward.wordResults?.filter((r) => !r.correct) ?? []

  const [shownGems, setShownGems] = useState(0)

  // Count the gems up one at a time rather than printing the total: the counting *is* the
  // reward moment, and it costs a second and a half.
  useEffect(() => {
    if (reward.gems <= 0) return
    let n = 0
    const timer = setInterval(() => {
      n += 1
      setShownGems(n)
      playEffect('tick', Math.floor((n - 1) / GEMS_PER_TICK_STEP))
      if (n >= reward.gems) clearInterval(timer)
    }, GEM_TICK_MS)
    return () => clearInterval(timer)
  }, [reward.gems])

  return (
    <div className="reward-screen">
      <Frida
        expression={
          isWeetje || reward.perfect || correct >= 8 ? 'head-celebrating' : 'happy'
        }
        className="frida"
        alt="Frida is blij"
      />
      {reward.newRecord && <div className="record-banner">NIEUW RECORD!</div>}
      <h1>{isWeetje ? WEETJE_HEADLINE : headline(reward, correct, graded, playerName)}</h1>
      {isWeetje && <p className="reward-subline">{WEETJE_SUBLINE}</p>}

      {!isWeetje && graded > 0 && (
        <>
          <div className="reward-tally">
            <span className="tally tally-goed">{correct} goed</span>
            <span className="tally tally-nog">{missed.length} nog even</span>
          </div>
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
        </>
      )}

      {reward.score !== undefined && (
        <div className="reward-line">⚡ {reward.score} klanken per minuut</div>
      )}
      <div className="reward-line">💎 +{shownGems}</div>
      <div className="reward-line">✨ +{reward.xp} XP</div>
      <button className="btn-primary" onClick={onDone}>
        Verder
      </button>
    </div>
  )
}
