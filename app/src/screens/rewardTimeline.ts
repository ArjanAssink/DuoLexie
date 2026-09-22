/**
 * The end-of-round celebration, as pure data (docs/reward-celebration.md).
 *
 * Everything here is a value or a total function: the beat schedule, the tier table, the
 * headline table, the confetti sizing and the bar's easing. `useCelebration` turns it into
 * timers and `RewardScreen` renders it, so the numbers that decide what she sees can be
 * unit-tested without a DOM — the boundaries between tiers in particular are the kind of
 * off-by-one that is invisible until the one round that lands exactly on 80%.
 */

/** Which stage of the celebration is on screen; mirrored to `data-beat` for CSS and tests. */
export type Beat = 'hero' | 'settle' | 'card' | 'strip' | 'done'

/**
 * Milliseconds from mount. The *order* of the beats is the acceptance criterion; these
 * figures are the tuning, kept in one place so they can be moved without hunting through
 * CSS — `RewardScreen` publishes `heroAt` and `barFillMs` to CSS as custom properties
 * rather than letting the stylesheet keep its own copy of them.
 */
export const BEATS = {
  /** the hero burst, after the screen's own 300ms enter fade has covered the cut */
  heroAt: 250,
  /** Frida shrinks, the headline moves under her, the streak wipes out */
  settleAt: 1800,
  /** the stat card pops in */
  cardAt: 2400,
  /** after the card has landed, before the bar starts moving */
  barDelay: 150,
  /** how long the bar takes to fill, and the count-up with it */
  barFillMs: 800,
  /** gems, XP and the nog-even chips fade in */
  stripAt: 3700,
  /**
   * Verder rises in. §2 puts this at "when the strip has finished"; what has to be finished
   * is the strip *arriving*, not the gem count-up — that is deliberately allowed to keep
   * running into `done` (§6: "nothing plays after done except the gem ticks that were
   * already running"), and waiting for it would hold the button back by up to 1.6s on
   * exactly the rounds she did best on.
   */
  doneAt: 4300,
  /**
   * The schatkist opens by itself, if she has not tapped it (docs/kist-openen.md §3).
   *
   * The tap is the point, so this is a floor under it rather than the intended path: 1.5s
   * after the strip arrives is long enough that a child reaching for the chest gets to be
   * the one who opens it, and short enough that a child who is not looking still sees her
   * gems without having to do anything. It sits *after* `doneAt` on purpose — Verder is
   * already up and usable while the chest is still closed, so waiting for the chest is
   * never something the screen makes her do.
   */
  chestAt: 5200,
} as const

export type TierId = 'geoefend' | 'goed' | 'super' | 'perfect'

export interface Tier {
  id: TierId
  /** shown in the card's label strip */
  label: string
  /** lowest percentage that earns this tier */
  min: number
}

/**
 * Ordered worst to best. `min` is inclusive, so the boundaries are 50, 80 and 100 — 49 is
 * still *Geoefend* and 99 is still *Super*; only an actually perfect round says Perfect.
 */
export const TIERS: readonly Tier[] = [
  { id: 'geoefend', label: 'Geoefend', min: 0 },
  { id: 'goed', label: 'Goed', min: 50 },
  { id: 'super', label: 'Super', min: 80 },
  { id: 'perfect', label: 'Perfect!', min: 100 },
] as const

/** The tier a percentage earns. Out-of-range input is clamped rather than trusted. */
export function tierFor(pct: number): Tier {
  const clamped = Math.max(0, Math.min(100, pct))
  let found = TIERS[0]
  for (const tier of TIERS) if (clamped >= tier.min) found = tier
  return found
}

/** How far up the ladder a tier sits — what the `tierUp` chime's `step` counts. */
export function tierIndex(id: TierId): number {
  return TIERS.findIndex((t) => t.id === id)
}

/**
 * The percentage the card fills to. `total === 0` should not happen (a round always has
 * cards) but the reward screen must render something rather than NaN if it ever does.
 */
export function pctFor(correct: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((correct / total) * 100)
}

export interface Praise {
  headline: string
  subline: string
}

/**
 * What the screen says. Never a failure message — *Lekker geoefend!* is the floor, because
 * the round that went worst is the one she most needs a reason to play again.
 *
 * `playerName` is '' when she skipped the name in the welkom-flow, so every line has to read
 * properly without one. The floor line stays impersonal on purpose: putting her name on the
 * weakest result is the one place it would sting rather than warm.
 */
export function praiseFor(pct: number, perfect: boolean, reading: boolean, playerName = ''): Praise {
  const name = playerName ? `, ${playerName}!` : '!'
  if (perfect || pct >= 100) {
    return { headline: `Perfect${name}`, subline: reading ? 'Alles goed gelezen!' : 'Alles goed!' }
  }
  if (pct >= 80) return { headline: `Super gedaan${name}`, subline: 'Bijna alles goed!' }
  if (pct >= 50) return { headline: `Goed gedaan${name}`, subline: 'Je hebt lekker geoefend.' }
  return { headline: 'Lekker geoefend!', subline: 'Oefenen helpt. Volgende keer weer!' }
}

/** Ceiling on the burst, so a record round is loud but never a lock-up. */
const CONFETTI_MAX = 220

/**
 * How much confetti the hero beat throws — the formula that used to live in
 * `GameScreen.handleComplete`, moved here so it fires with Frida rather than a beat early.
 *
 * A reading round's burst is sized to how much of it she got right, so ten out of ten
 * visibly outshines four out of ten. Below 50% there is no burst at all (§5): the sequence
 * still runs in full and takes the same time, the room is just quieter — confetti over a
 * two-out-of-ten round reads as being laughed at.
 *
 * @param correct correct words, or undefined for a game scored per klank
 */
export function confettiCount(pct: number, newRecord: boolean, correct?: number): number {
  if (newRecord) return CONFETTI_MAX
  if (pct < 50) return 0
  const full = Math.min(correct === undefined ? 120 : 40 + 18 * correct, CONFETTI_MAX)
  // 50–79 gets half the burst; 80 and up gets all of it
  return pct >= 80 ? full : Math.round(full / 2)
}

/**
 * Most gems that fly out of the opened chest at once.
 *
 * A sprite per gem would mean eighteen elements on a perfect round and five on the worst
 * one, which reads as "this round was worth more" — true, but the count-up already says it,
 * and eighteen animating elements on a 2019 Android tablet is the one place this screen
 * could drop frames. The burst is a *gesture*; the number is the number.
 */
const GEM_SPRITES_MAX = 7

/**
 * How many gems to draw flying out of the chest for a round worth `gems`.
 *
 * Never more than `GEM_SPRITES_MAX`, never more than she actually earned (four gems throwing
 * seven sprites is a small lie a nine-year-old will catch), and never fewer than one for a
 * round that earned anything at all — a chest that opens on nothing is worse than no chest.
 */
export function gemSpriteCount(gems: number): number {
  if (gems <= 0) return 0
  return Math.max(1, Math.min(GEM_SPRITES_MAX, gems))
}

/** Whether the diagonal streak band sweeps in — the quiet room below 50% has no sweep. */
export function showsStreak(pct: number): boolean {
  return pct >= 50
}

/**
 * `cubic-bezier(.22,.9,.35,1)` — the app's standard ease-out, evaluated in JS.
 *
 * The bar and the number beside it are driven from this one function so they cannot
 * disagree: the width is `scaleX(progress × pct/100)` and the label is
 * `Math.round(progress × pct)`, both read from the same value in the same frame. Letting CSS
 * animate the bar while an interval ticked the number is how they end up a few percent apart
 * on a slow frame, and how the number ends on 82% under a bar that is clearly full.
 */
export function easeBar(t: number): number {
  return cubicBezier(0.22, 0.9, 0.35, 1, t)
}

/**
 * Solves y for x on a cubic Bézier with endpoints (0,0) and (1,1) — the same curve CSS
 * means by `cubic-bezier(x1,y1,x2,y2)`.
 *
 * x is found by Newton–Raphson with a bisection fallback: the derivative goes to zero at
 * curves with a flat start or end, where Newton alone can stall or overshoot out of range.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  const curve = (a: number, b: number, t: number) => {
    const u = 1 - t
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
  }
  const slope = (a: number, b: number, t: number) => {
    const u = 1 - t
    return 3 * u * u * a + 6 * u * t * (b - a) + 3 * t * t * (1 - b)
  }

  let t = x
  for (let i = 0; i < 8; i++) {
    const err = curve(x1, x2, t) - x
    if (Math.abs(err) < 1e-6) return curve(y1, y2, t)
    const d = slope(x1, x2, t)
    if (Math.abs(d) < 1e-6) break
    t -= err / d
  }

  let lo = 0
  let hi = 1
  t = x
  for (let i = 0; i < 24; i++) {
    const at = curve(x1, x2, t)
    if (Math.abs(at - x) < 1e-6) break
    if (at < x) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return curve(y1, y2, t)
}
