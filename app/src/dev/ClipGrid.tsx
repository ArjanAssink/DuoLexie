import { useCallback, useEffect, useRef, useState } from 'react'
import { folderFor, type ClipKind } from '../audio/recorded'
import { useClipPlayer } from './clipPlayer'
import {
  MISSING, STATE_ICON, STATE_TITLE, clipState, countStates,
  type ClipProbe, type ClipState, type Verdict, type VerdictStore,
} from './verdicts'

interface Props {
  ids: string[]
  /** what the next take will record, for the ring that says "this one is queued" */
  activeIds: string[]
  kind: ClipKind
  /** Weetjes cues are sentences; the id goes underneath in small type (§2.8) */
  labels?: Record<string, string>
  probes: Record<string, ClipProbe>
  store: VerdictStore
  onVerdict: (id: string, verdict: Verdict | null) => void
}

/**
 * The set, as the place clips are judged (docs/recording-studio-v3.md §2.1).
 *
 * The old grid showed ✅ or ⬜ per id — recorded, or not. It could not play anything and it
 * had no way to say "this one is bad", so the state of the set lived in Arjan's head between
 * one evening and the next, and a clip he disliked stayed in the app until he happened to
 * remember it.
 *
 * The fast path is the point: press *Alles afspelen*, then `G` or `A` on each clip as it
 * sounds. Twenty clips, twenty keystrokes, no pointer. Judging is one key because anything
 * more expensive than one key does not get done twenty times in a row after a long day.
 *
 * Rejecting is not bookkeeping followed by more bookkeeping. `❌` counts as missing, so the
 * "alleen ontbrekende" filter and the *Start take* count pick the word up by themselves and
 * the next take re-records it with nothing else to remember.
 */
export function ClipGrid({ ids, activeIds, kind, labels, probes, store, onVerdict }: Props) {
  const folder = folderFor(kind)
  const player = useClipPlayer(kind)
  const [focus, setFocus] = useState(0)
  // the ref, not the state, is what `move` reads: moving focus is a DOM side effect, and
  // doing it from inside a setState updater makes it depend on when React chooses to run
  // that updater — two quick arrow presses would land one cell short
  const focusRef = useRef(0)
  const cells = useRef<(HTMLButtonElement | null)[]>([])
  const active = new Set(activeIds)

  const stateOf = useCallback(
    (id: string) => clipState(store, folder, id, probes[id] ?? MISSING),
    [store, folder, probes],
  )
  const counts = countStates(store, folder, ids, probes)
  const playable = ids.filter((id) => stateOf(id) !== 'ontbreekt')
  const unjudged = ids.filter((id) => stateOf(id) === 'onbeoordeeld')

  const cacheKeyFor = useCallback(
    (id: string) => probes[id]?.lastModified ?? null,
    [probes],
  )

  const playOne = useCallback((id: string) => {
    if (stateOf(id) === 'ontbreekt') return
    player.play(id, cacheKeyFor(id))
  }, [player, stateOf, cacheKeyFor])

  /**
   * Judge, then get out of the way.
   *
   * During a walk this stops the clip mid-word and starts the next one, which is what makes
   * twenty clips take a minute: the moment he knows, he has said so and is already hearing
   * the next one. A second `G` on the same clip clears the verdict, so a slip is undone by
   * the same key rather than by finding the mouse.
   */
  const judge = useCallback((id: string, verdict: Verdict) => {
    onVerdict(id, stateOf(id) === verdict ? null : verdict)
    if (player.playing === id) player.advance()
  }, [onVerdict, player, stateOf])

  const move = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(ids.length - 1, focusRef.current + delta))
    focusRef.current = next
    setFocus(next)
    cells.current[next]?.focus()
  }, [ids.length])

  /**
   * `G`/`A` (and `↑`/`↓`) judge whatever is sounding, from anywhere on the page.
   *
   * Not scoped to the grid on purpose: the walk is started by clicking a button above the
   * grid, so focus is on that button and nothing is in the grid at all. Scoping it would mean
   * "click the button, then click into the grid, then judge", and the keystroke-per-clip
   * economy is the entire feature.
   */
  useEffect(() => {
    if (!player.playing) return
    const sounding = player.playing
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const key = e.key.toLowerCase()
      if (key === 'g' || e.key === 'ArrowUp') {
        e.preventDefault()
        judge(sounding, 'goed')
      } else if (key === 'a' || e.key === 'ArrowDown') {
        e.preventDefault()
        judge(sounding, 'afgekeurd')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        player.stop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, judge])

  function onGridKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); move(-ids.length) }
    else if (e.key === 'End') { e.preventDefault(); move(ids.length) }
  }

  return (
    <div className="clipgrid">
      <div className="clipgrid-bar">
        <button
          className="btn-primary"
          disabled={playable.length === 0}
          onClick={() => player.walk(playable, cacheKeyFor)}
        >
          ▶︎ Alles afspelen ({playable.length})
        </button>
        <button
          className="btn-primary"
          disabled={unjudged.length === 0}
          onClick={() => player.walk(unjudged, cacheKeyFor)}
        >
          ▶︎ Alleen onbeoordeeld ({unjudged.length})
        </button>
        {(player.playing !== null || player.walking) && (
          <button className="btn-bad" onClick={player.stop}>⏹ Stop</button>
        )}
        <span className="clipgrid-counts">
          {(['ontbreekt', 'onbeoordeeld', 'goed', 'afgekeurd'] as ClipState[]).map((state) => (
            <span key={state} title={STATE_TITLE[state]}>{STATE_ICON[state]} {counts[state]}</span>
          ))}
        </span>
      </div>

      {player.walking && (
        <p className="clipgrid-hint">
          <b>G</b> = goed · <b>A</b> = afkeuren · <b>Esc</b> = stoppen. Beoordelen slaat meteen
          door naar de volgende.
        </p>
      )}

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
      <div
        className={`studio-grid${labels ? ' studio-grid-wide' : ''}`}
        role="grid"
        onKeyDown={onGridKey}
      >
        {ids.map((id, index) => {
          const state = stateOf(id)
          const sounding = player.playing === id
          return (
            <div
              key={id}
              className={`studio-cell${active.has(id) ? ' studio-cell-active' : ''}${
                sounding ? ' studio-cell-playing' : ''
              }${labels ? ' studio-cell-wide' : ''}`}
              data-state={state}
              data-id={id}
            >
              <button
                ref={(el) => { cells.current[index] = el }}
                className="studio-cell-face"
                type="button"
                tabIndex={index === focus ? 0 : -1}
                disabled={state === 'ontbreekt'}
                aria-label={`${labels?.[id] ?? id} afspelen`}
                title={STATE_TITLE[state]}
                onFocus={() => { focusRef.current = index; setFocus(index) }}
                onClick={() => (sounding ? player.stop() : playOne(id))}
              >
                <span className="studio-cell-id">{labels?.[id] ?? id}</span>
                {labels && <span className="studio-cell-sub">{id}</span>}
                <span className="studio-cell-status">{sounding ? '🔊' : STATE_ICON[state]}</span>
              </button>
              <span className="studio-cell-judge">
                <button
                  type="button"
                  className={`studio-judge${state === 'goed' ? ' studio-judge-on' : ''}`}
                  aria-label={`${id} goedkeuren`}
                  disabled={state === 'ontbreekt'}
                  onClick={() => judge(id, 'goed')}
                >✓</button>
                <button
                  type="button"
                  className={`studio-judge${state === 'afgekeurd' ? ' studio-judge-on' : ''}`}
                  aria-label={`${id} afkeuren`}
                  disabled={state === 'ontbreekt'}
                  onClick={() => judge(id, 'afgekeurd')}
                >✗</button>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
