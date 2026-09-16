/**
 * The one place that asks whether she wants motion.
 *
 * Three screens needed the same two lines (Hardop lezen, the welkom-flow, and now the
 * reward celebration), and the reward screen's whole timeline hangs off it — a copy that
 * drifted would mean one screen quietly animating for someone who asked it not to.
 *
 * Read it at mount (`useState(prefersReducedMotion)`) rather than per frame: the setting
 * changing mid-round is not worth re-choreographing a running animation for, and the CSS
 * `@media (prefers-reduced-motion: reduce)` blocks are the belt to this braces anyway.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
