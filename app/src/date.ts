/**
 * Calendar-day helpers. Everything that answers "which day was this?" must go
 * through here.
 *
 * `toISOString().slice(0, 10)` is the trap these exist to avoid: it yields the
 * *UTC* day, so in CEST a session at 01:00 on Monday is recorded as Sunday. That
 * silently drops it out of the practice week and, once words are scheduled by
 * calendar day, misfires review intervals by a day.
 */

/** Local calendar day as YYYY-MM-DD. */
export function localDay(d: Date = new Date()): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Shift a YYYY-MM-DD day by n days. Goes through the Date constructor's
 * month/year normalisation, so rollovers and leap years are handled, and stays
 * on local midday so a DST shift can't move the result onto the wrong day.
 */
export function addDays(day: string, n: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return localDay(new Date(year, month - 1, date + n, 12))
}
