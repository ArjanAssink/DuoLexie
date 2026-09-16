import { useNavigate, useSearchParams } from 'react-router-dom'
import type { AnswerRecord, WordResult } from '@shared/src/types'
import { PROEFRONDE_LESSON } from '../data/path'
import { computeReward } from '../engine/reward'
import { wordsForPool } from '../words'
import { RewardScreen, type DisplayReward } from './RewardScreen'

/**
 * The reward screen on its own, from `/#/beloning?goed=7&totaal=10`.
 *
 * **Why this exists.** The celebration is four and a half seconds long and has ten things
 * worth checking (docs/reward-celebration.md §9), and the only way into it used to be
 * playing a full ten-card round — about twenty seconds per test on a desktop and a minute on
 * CI's WebKit profiles, times three profiles, for a screen that does not care how she got
 * there. This renders it directly, so the tests about the *screen* cost a page load. The
 * tests about the *round* — that the tally, the chips and the gems match what she actually
 * did — stay where they belong, in `hardop-lezen.spec.ts`, and one of them still drives a
 * real round all the way to Verder.
 *
 * It is also the quickest way to look at a tier by eye without playing to it, which is what
 * it was used for while the sequence was being tuned.
 *
 * **What keeps it honest.** It does not make its numbers up: it builds the same
 * `wordResults`/`answers` a real round produces, hands them to the real `computeReward`, and
 * passes the real `DisplayReward` to the real component. A change to the gem formula or to
 * the reward's shape lands here too, as a failing test or a type error rather than as a
 * preview quietly showing something the game no longer does.
 *
 * It credits nothing — `computeReward` is pure, and `completeLesson` is never called — so
 * opening it cannot pay her gems for a round she did not play.
 */
export function RewardPreviewScreen() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  // 200 rather than a round's ten: the cap is only here so a typo in the URL cannot ask for
  // a hundred thousand chips, and a denominator large enough to express a percentage that
  // ten cards cannot (79%, say) is exactly what a preview is for.
  const totaal = clampInt(params.get('totaal'), 10, 0, 200)
  const goed = clampInt(params.get('goed'), totaal, 0, totaal)
  // `klank` scores per klank the way Tijdrit and Flitsen do; the default is a reading round
  const klank = params.get('spel') === 'klank'
  const score = params.has('score') ? clampInt(params.get('score'), 0, 0, 999) : undefined
  const record = params.get('record') === '1'

  const wordResults: WordResult[] | undefined = klank
    ? undefined
    : previewWords(totaal).map((wordId, i) => ({
        wordId,
        correct: i >= totaal - goed,
        ms: 2000,
        withinWindow: true,
      }))
  const answers: AnswerRecord[] | undefined = klank
    ? Array.from({ length: totaal }, (_, i) => ({
        soundId: PROEFRONDE_LESSON.soundPool[i % PROEFRONDE_LESSON.soundPool.length] ?? 'm',
        correct: i >= totaal - goed,
        ms: 2000,
      }))
    : undefined

  // The real formula, not a hand-written number — see the note above.
  const reward = computeReward(
    PROEFRONDE_LESSON,
    answers ?? [],
    record && score !== undefined ? score - 1 : Number.MAX_SAFE_INTEGER,
    score,
    wordResults,
  )

  const display: DisplayReward = { ...reward, score, wordResults, answers }

  return <RewardScreen reward={display} onDone={() => navigate('/proberen')} />
}

/**
 * Real word ids, so the nog-even chips render and play like any other round's. Drawn from
 * the Proefronde's pool — the same words the round this stands in for would have used.
 */
function previewWords(count: number): string[] {
  const pool = wordsForPool(PROEFRONDE_LESSON.soundPool)
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]?.id ?? 'kat')
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
