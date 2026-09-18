/** Where "laat het weten op GitHub" goes. */
export const GITHUB_ISSUES_URL = 'https://github.com/ArjanAssink/DuoLexie/issues'

/**
 * The work-in-progress note, shown on the welkom-flow's first screen and again under
 * Profiel -> Over DuoLexie. One component rather than the same sentence typed twice, so the
 * two cannot drift apart (docs/onboarding-welkom.md ss4).
 */
export function WipNote({ className }: { className?: string }) {
  return (
    <p className={`wip-note ${className ?? ''}`}>
      DuoLexie is nog in ontwikkeling. Loop je ergens tegenaan, of heb je een idee? Laat het
      weten op{' '}
      <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
        GitHub
      </a>
      .
    </p>
  )
}
