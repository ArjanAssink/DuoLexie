import { describe, it, expect } from 'vitest'
import { localDay, addDays } from './date'

// Runs with TZ=Europe/Amsterdam (see the "test" script) so the DST and
// after-midnight cases are deterministic.

describe('localDay', () => {
  it('uses the local day, not the UTC one', () => {
    // 01:00 local on 15 July is 23:00 UTC on 14 July — this is exactly the case
    // toISOString().slice(0, 10) got wrong, and the reason this helper exists.
    expect(localDay(new Date(2026, 6, 15, 1, 0))).toBe('2026-07-15')
    expect(new Date(2026, 6, 15, 1, 0).toISOString().slice(0, 10)).toBe('2026-07-14')
  })

  it('pads months and days', () => {
    expect(localDay(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })

  it('handles the last moment of a day', () => {
    expect(localDay(new Date(2026, 2, 31, 23, 59, 59))).toBe('2026-03-31')
  })
})

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-09-06', 2)).toBe('2026-09-08')
  })

  it('rolls over a month boundary', () => {
    expect(addDays('2026-09-29', 4)).toBe('2026-10-03')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-28', 9)).toBe('2027-01-06')
  })

  it('handles a leap year', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01')
  })

  it('is not derailed by the spring DST shift', () => {
    // 2026-03-29 is when Amsterdam loses an hour; a naive +86400000ms lands at
    // 01:00 on the 30th in some zones and 23:00 on the 29th in others.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })

  it('is not derailed by the autumn DST shift', () => {
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('accepts 0 and negative offsets', () => {
    expect(addDays('2026-09-06', 0)).toBe('2026-09-06')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('round-trips the Leitner intervals from reading-mechanics.md', () => {
    expect(addDays('2026-09-06', 2)).toBe('2026-09-08')
    expect(addDays('2026-09-06', 4)).toBe('2026-09-10')
    expect(addDays('2026-09-06', 9)).toBe('2026-09-15')
    expect(addDays('2026-09-06', 21)).toBe('2026-09-27')
  })
})
