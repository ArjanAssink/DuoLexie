import { describe, it, expect } from 'vitest'
import {
  BEATS,
  confettiCount,
  easeBar,
  pctFor,
  praiseFor,
  showsStreak,
  tierFor,
  tierIndex,
  TIERS,
} from './rewardTimeline'

describe('tierFor', () => {
  it('puts the boundaries where the spec puts them', () => {
    // The interesting cases are all off-by-one: a round that lands exactly on a boundary is
    // the one a reader of the table and a reader of the code can disagree about.
    expect(tierFor(0).id).toBe('geoefend')
    expect(tierFor(49).id).toBe('geoefend')
    expect(tierFor(50).id).toBe('goed')
    expect(tierFor(79).id).toBe('goed')
    expect(tierFor(80).id).toBe('super')
    expect(tierFor(99).id).toBe('super')
    expect(tierFor(100).id).toBe('perfect')
  })

  it('only calls a round perfect when it is', () => {
    // 99% is nine hundred and ninety-nine words out of a thousand. It is still not perfect,
    // and the label saying so is the whole reason the tier ladder is worth climbing.
    expect(tierFor(99).label).toBe('Super')
    expect(tierFor(100).label).toBe('Perfect!')
  })

  it('clamps rather than trusting a percentage from outside 0-100', () => {
    expect(tierFor(-20).id).toBe('geoefend')
    expect(tierFor(140).id).toBe('perfect')
  })

  it('indexes the tiers in climbing order, which is what the chime steps on', () => {
    expect(TIERS.map((t) => t.id)).toEqual(['geoefend', 'goed', 'super', 'perfect'])
    expect(tierIndex('geoefend')).toBe(0)
    expect(tierIndex('perfect')).toBe(3)
  })
})

describe('pctFor', () => {
  it('rounds to whole percents', () => {
    expect(pctFor(7, 10)).toBe(70)
    expect(pctFor(10, 10)).toBe(100)
    expect(pctFor(0, 10)).toBe(0)
    expect(pctFor(1, 3)).toBe(33)
    expect(pctFor(2, 3)).toBe(67)
  })

  it('renders a round with nothing in it at 0 rather than NaN', () => {
    // Defensive: a round always has cards, but the reward screen must show a number either
    // way — NaN% would reach her, and tierFor(NaN) would fall through the whole table.
    expect(pctFor(0, 0)).toBe(0)
    expect(tierFor(pctFor(0, 0)).id).toBe('geoefend')
  })
})

describe('praiseFor', () => {
  it('gives each tier its own headline and subline', () => {
    expect(praiseFor(100, true, true)).toEqual({
      headline: 'Perfect!',
      subline: 'Alles goed gelezen!',
    })
    expect(praiseFor(80, false, true).headline).toBe('Super gedaan!')
    expect(praiseFor(80, false, true).subline).toBe('Bijna alles goed!')
    expect(praiseFor(50, false, true).headline).toBe('Goed gedaan!')
    expect(praiseFor(49, false, true).headline).toBe('Lekker geoefend!')
    expect(praiseFor(0, false, true).subline).toBe('Oefenen helpt. Volgende keer weer!')
  })

  it('never says anything that reads as failure', () => {
    for (let pct = 0; pct <= 100; pct++) {
      const { headline, subline } = praiseFor(pct, pct === 100, true)
      expect(headline).not.toMatch(/jammer|helaas|fout|mis/i)
      expect(subline).not.toMatch(/jammer|helaas|fout|mis/i)
    }
    // and the floor is the one the existing e2e test pins: an all-wrong round is not Perfect
    expect(praiseFor(0, false, true).headline).not.toContain('Perfect')
  })

  it('says "alles goed" rather than "alles goed gelezen" when she was not reading', () => {
    expect(praiseFor(100, true, false).subline).toBe('Alles goed!')
  })

  it('uses her name where there is one, and reads properly where there is not', () => {
    expect(praiseFor(100, true, true, 'Lexie').headline).toBe('Perfect, Lexie!')
    expect(praiseFor(85, false, true, 'Lexie').headline).toBe('Super gedaan, Lexie!')
    expect(praiseFor(100, true, true, '').headline).toBe('Perfect!')
    // the weakest result stays impersonal — her name on it would sting rather than warm
    expect(praiseFor(10, false, true, 'Lexie').headline).toBe('Lekker geoefend!')
  })

  it('trusts an explicit perfect flag even if the rounded percentage disagrees', () => {
    // computeReward decides `perfect`, not this table; they must never contradict each other
    // on screen, and the flag is the one that was paid out.
    expect(praiseFor(99, true, true).headline).toBe('Perfect!')
  })
})

describe('confettiCount', () => {
  it('sizes a reading round to how much of it she got right', () => {
    expect(confettiCount(100, false, 10)).toBe(220)
    expect(confettiCount(80, false, 8)).toBe(184)
  })

  it('halves the burst for a middling round and drops it entirely below half', () => {
    // 50-79 is a quieter room, under 50 is no confetti at all: a burst over a two-out-of-ten
    // round reads as being laughed at, and the sequence still runs in full either way.
    expect(confettiCount(70, false, 7)).toBe(Math.round(Math.min(40 + 18 * 7, 220) / 2))
    expect(confettiCount(50, false, 5)).toBe(65)
    expect(confettiCount(49, false, 4)).toBe(0)
    expect(confettiCount(0, false, 0)).toBe(0)
  })

  it('caps the burst, including for a record', () => {
    expect(confettiCount(100, true, 10)).toBe(220)
    expect(confettiCount(0, true, 0)).toBe(220) // a record is a record even on a bad round
    expect(confettiCount(100, false, 40)).toBe(220)
  })

  it('falls back to a fixed burst for a game not scored per word', () => {
    expect(confettiCount(100, false, undefined)).toBe(120)
    expect(confettiCount(60, false, undefined)).toBe(60)
  })
})

describe('showsStreak', () => {
  it('matches the confetti threshold, so the quiet room is quiet in both senses', () => {
    expect(showsStreak(49)).toBe(false)
    expect(showsStreak(50)).toBe(true)
    expect(showsStreak(100)).toBe(true)
  })
})

describe('easeBar', () => {
  it('starts at 0, ends at 1, and never leaves the range in between', () => {
    expect(easeBar(0)).toBe(0)
    expect(easeBar(1)).toBe(1)
    for (let i = 0; i <= 100; i++) {
      const y = easeBar(i / 100)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  })

  it('is monotonic, so the bar and the number can only ever go up', () => {
    let prev = -1
    for (let i = 0; i <= 200; i++) {
      const y = easeBar(i / 200)
      expect(y).toBeGreaterThanOrEqual(prev)
      prev = y
    }
  })

  it('eases out: more than half the distance is covered in the first half of the time', () => {
    expect(easeBar(0.5)).toBeGreaterThan(0.5)
    expect(easeBar(0.25)).toBeGreaterThan(0.25)
  })

  it('clamps input from outside 0-1 rather than extrapolating off the curve', () => {
    expect(easeBar(-1)).toBe(0)
    expect(easeBar(2)).toBe(1)
  })

  it('ends the count-up on exactly the percentage it was given', () => {
    // The reason the number is derived from progress rather than ticked independently: at
    // t=1 it has to be pct, not pct-1, for every pct.
    for (const pct of [0, 1, 33, 50, 67, 70, 80, 99, 100]) {
      expect(Math.round(easeBar(1) * pct)).toBe(pct)
    }
  })
})

describe('BEATS', () => {
  it('runs in order, with room for the bar fill inside the card beat', () => {
    expect(BEATS.heroAt).toBeLessThan(BEATS.settleAt)
    expect(BEATS.settleAt).toBeLessThan(BEATS.cardAt)
    expect(BEATS.cardAt).toBeLessThan(BEATS.stripAt)
    expect(BEATS.stripAt).toBeLessThan(BEATS.doneAt)
    // the bar must have finished filling before the strip pulls her eye off the card
    expect(BEATS.cardAt + BEATS.barDelay + BEATS.barFillMs).toBeLessThanOrEqual(BEATS.stripAt)
  })
})
