import { describe, it, expect } from 'vitest'
import { gemsLandedFrom } from '../../src/screens/gemLanding'

/**
 * The handoff the leerpad reads to know it owes her a landing (docs/kist-openen.md §4).
 *
 * `location.state` is the loosest input in the app: it is whatever the last `navigate` put
 * there, it is `null` after a reload or a hand-typed URL, and — because this is a HashRouter
 * app whose links people do paste to each other — it is not something a reader can be sure
 * of the shape of. Every one of the cases below has a real way of happening; the function
 * exists so that none of them can put `NaN` in the statbar or hold the counter back forever.
 */
describe('gemsLandedFrom', () => {
  it('reads the gems a round handed over', () => {
    expect(gemsLandedFrom({ gemsLanded: 18 })).toBe(18)
  })

  it('treats every way of arriving without one as no landing', () => {
    // a reload, a deep link, a tab restored — all of these reach the leerpad with no state
    expect(gemsLandedFrom(null)).toBe(0)
    expect(gemsLandedFrom(undefined)).toBe(0)
    expect(gemsLandedFrom({})).toBe(0)
    // and the bottom nav, which navigates with state of a different shape entirely
    expect(gemsLandedFrom({ from: '/winkel' })).toBe(0)
  })

  it('refuses a number that would break the counter rather than trusting it', () => {
    expect(gemsLandedFrom({ gemsLanded: Number.NaN })).toBe(0)
    expect(gemsLandedFrom({ gemsLanded: Number.POSITIVE_INFINITY })).toBe(0)
    expect(gemsLandedFrom({ gemsLanded: '18' })).toBe(0)
    // zero and below are not a flight; a round always pays, so this is a guard, not a case
    expect(gemsLandedFrom({ gemsLanded: 0 })).toBe(0)
    expect(gemsLandedFrom({ gemsLanded: -5 })).toBe(0)
  })

  it('floors a fraction, because the counter shows whole gems', () => {
    // No formula produces one today. If one ever does, the sprites and the held-back total
    // have to agree on an integer, and this is the one place that can guarantee they do.
    expect(gemsLandedFrom({ gemsLanded: 7.8 })).toBe(7)
  })
})
