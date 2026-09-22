/**
 * The two decisions Maak het woord af makes that are worth testing without a DOM
 * (docs/maak-het-woord-af.md §3, §5).
 *
 * Kept out of the component for the same reason `games/swipe.ts` is: "is this tile over the
 * gap" and "where does a missed word come back" are the parts with the interesting edges —
 * a tile released exactly on the slack boundary, a miss on the last card of the round — and
 * neither of them needs a card on screen to be wrong.
 */

/** Just enough of a DOMRect to decide. Any `getBoundingClientRect()` satisfies it. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * How far outside the gap a tile's centre may still count as being over it.
 *
 * The gap is the width of `cht` and about as tall as one letter — a target small enough
 * that hitting it exactly would make the game about aim rather than about spelling. Growing
 * it by 24px on every side is roughly a fingertip's grace in each direction.
 */
export const GAP_SLACK_PX = 24

/**
 * Is the tile over the gap? Its **centre** against the gap's rect grown by `slackPx` on
 * every side.
 *
 * The centre, not an overlap test: a tile is wider than the gap, so any overlap rule would
 * light the gap up while the tile was still sitting in its own slot. Measured against real
 * rects taken at lift time (the component's `measureTargets`), so it is right on every
 * viewport without a single hard-coded coordinate.
 */
export function overGap(tile: Box, gap: Box, slackPx: number = GAP_SLACK_PX): boolean {
  const cx = tile.left + tile.width / 2
  const cy = tile.top + tile.height / 2
  return (
    cx >= gap.left - slackPx &&
    cx <= gap.left + gap.width + slackPx &&
    cy >= gap.top - slackPx &&
    cy <= gap.top + gap.height + slackPx
  )
}

/** How many positions later a missed word comes back (§5). */
export const REQUEUE_GAP = 3

/**
 * Put a missed word back into the round, `gap` positions after the card she just had.
 *
 * Three positions rather than at the end: far enough that she is not simply repeating
 * herself, near enough that the correction she was just shown is still the thing she is
 * thinking about. Past the end of the queue it is appended instead — a word missed on the
 * last card still gets its second showing, which is the whole point of re-queueing it.
 *
 * Only the *first* miss of a word re-queues it; a second one moves on (§5). That is the
 * caller's bookkeeping, not this function's: the queue alone cannot tell a re-queued card
 * from an original one, and a rule that could re-queue forever is one to keep visible in
 * the component rather than hidden in here.
 */
export function requeue(
  queue: string[],
  index: number,
  wordId: string,
  gap: number = REQUEUE_GAP,
): string[] {
  const at = Math.min(index + gap, queue.length)
  const next = [...queue]
  next.splice(at, 0, wordId)
  return next
}
