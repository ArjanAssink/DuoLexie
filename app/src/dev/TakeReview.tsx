import { useMemo, useState } from 'react'
import { folderFor, type TakeKind } from './cueSheet'
import { useClipPlayer } from './clipPlayer'
import {
  MISSING, STATE_ICON, clipState, type ClipProbe, type Verdict, type VerdictStore,
} from './verdicts'

/** One row of `<take>.report.json`, as tools/split-take.mjs writes it (§4.1 step 7). */
export interface ReportClip {
  id: string
  status: 'ok' | 'missing' | 'multiple' | 'boundary' | 'too-short' | 'clipped'
  flags: string[]
  startMs: number | null
  endMs: number | null
  durationMs: number | null
  peakDbfs: number | null
  file: string | null
  transcript?: string
  verifyDistance?: number
}

export interface SplitReport {
  version: 1
  generatedAt: string
  kind: TakeKind
  out: string
  warnings: string[]
  clips: ReportClip[]
  summary: { total: number; ok: number }
  audio?: {
    appliedGainDb?: number
    gainSource?: 'measured' | 'reused'
    gainFrom?: string | null
  }
}

/** Flagged rows first, then the rest in the order they were recorded. */
const SEVERITY = ['missing', 'too-short', 'clipped', 'boundary', 'multiple', 'ok']

const LABEL: Record<string, string> = {
  ok: 'ok',
  missing: 'niets gehoord',
  multiple: 'meerdere stukken',
  boundary: 'op de grens',
  'too-short': 'te kort',
  clipped: 'oversturing',
}

interface Props {
  report: SplitReport
  /** Weetjes cues are sentences; `slim-doe` is not what was said (§2.8) */
  labels?: Record<string, string>
  store: VerdictStore
  probes: Record<string, ClipProbe>
  onVerdict: (id: string, verdict: Verdict | null) => void
  onRetake: (ids: string[]) => void
}

/**
 * The listening half of the loop (docs/recording-pipeline-v2.md §5, and §2.1 of the v3 spec).
 *
 * The report decides what to look at first, and nothing else. Every row plays, including the
 * ones it called `ok`: the tool can hear levels and silence, and "he read it oddly" is not a
 * status it has — which is exactly the kind of thing that sends a clip back.
 *
 * The verdict buttons here write the same store as the set grid's, so judging right after a
 * split and judging a week later in the grid are the same act rather than two records of it.
 */
export function TakeReview({ report, labels, store, probes, onVerdict, onRetake }: Props) {
  const folder = folderFor(report.kind)
  const player = useClipPlayer(folder)
  const rows = useMemo(
    () => [...report.clips].sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status)),
    [report.clips],
  )
  const stateOf = (id: string) => clipState(store, folder, id, probes[id] ?? MISSING)

  /**
   * Rejected rows start ticked.
   *
   * ❌ already means "record this again" everywhere else — it is what makes the id count as
   * missing — so making him tick it a second time to say the same thing is the sort of step
   * that turns a two-minute loop into one he does once.
   */
  const rejected = rows.filter((r) => stateOf(r.id) === 'afgekeurd').map((r) => r.id)
  const [checked, setChecked] = useState<Set<string> | null>(null)
  const ticked = checked ?? new Set(rejected)

  const flagged = rows.filter((r) => r.status !== 'ok')
  const playable = rows.filter((r) => r.file !== null).map((r) => r.id)

  function toggle(id: string) {
    const next = new Set(ticked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
  }

  function judge(id: string, verdict: Verdict) {
    onVerdict(id, stateOf(id) === verdict ? null : verdict)
    if (player.playing === id) player.advance()
  }

  return (
    <div className="review">
      <h2>Rapport — {report.summary.ok}/{report.summary.total} ok</h2>
      {report.warnings.map((w) => <p key={w} className="review-warning">⚠️ {w}</p>)}
      {report.audio?.gainSource === 'reused' && (
        <p className="review-note">
          Niveau overgenomen van <code>{report.audio.gainFrom}</code>{' '}
          ({report.audio.appliedGainDb! >= 0 ? '+' : ''}{report.audio.appliedGainDb} dB), zodat
          deze clips op hetzelfde niveau staan als de rest van de set.
        </p>
      )}

      <p className="review-actions">
        <button
          className="btn-primary"
          disabled={playable.length === 0}
          onClick={() => player.walk(playable, (id) => probes[id]?.lastModified ?? report.generatedAt)}
        >
          ▶️ Alles afluisteren
        </button>
        {(player.playing !== null || player.walking) && (
          <button className="btn-bad" onClick={player.stop}>⏹ Stop</button>
        )}
        {flagged.length > 0 && (
          <button className="btn-primary" onClick={() => setChecked(new Set(flagged.map((r) => r.id)))}>
            Vink alle {flagged.length} gemarkeerde aan
          </button>
        )}
      </p>
      {player.walking && (
        <p className="clipgrid-hint"><b>G</b> = goed · <b>A</b> = afkeuren · <b>Esc</b> = stoppen.</p>
      )}

      <ul className="review-list">
        {rows.map((clip) => {
          const state = stateOf(clip.id)
          return (
            <li
              key={clip.id}
              className={`review-row${clip.status === 'ok' ? '' : ' review-row-flagged'}${
                player.playing === clip.id ? ' review-row-playing' : ''
              }`}
              data-state={state}
            >
              <input
                type="checkbox"
                aria-label={`${clip.id} opnieuw opnemen`}
                checked={ticked.has(clip.id)}
                onChange={() => toggle(clip.id)}
              />
              <button
                className="review-play"
                disabled={clip.file === null}
                aria-label={`${clip.id} afspelen`}
                onClick={() => player.play(clip.id, probes[clip.id]?.lastModified ?? report.generatedAt)}
              >
                {player.playing === clip.id ? '🔊' : '▶️'}
              </button>
              <span className="review-id">
                {labels?.[clip.id] ?? clip.id}
                {labels?.[clip.id] && <span className="review-sub">{clip.id}</span>}
              </span>
              <span className="review-meta">
                <span className="review-status">{LABEL[clip.status] ?? clip.status}</span>
                <span className="review-dur">{clip.durationMs === null ? '—' : `${clip.durationMs} ms`}</span>
                <span className="review-peak">{clip.peakDbfs === null ? '' : `${clip.peakDbfs} dB`}</span>
              </span>
              <span className="review-judge">
                <span className="review-state" title={state}>{STATE_ICON[state]}</span>
                {/* A verdict belongs to a file, so a row whose clip the studio cannot find
                    has nothing to attach one to — the buttons say so rather than accepting a
                    click and dropping it. */}
                <button
                  className={`studio-judge${state === 'goed' ? ' studio-judge-on' : ''}`}
                  aria-label={`${clip.id} goedkeuren`}
                  disabled={state === 'ontbreekt'}
                  onClick={() => judge(clip.id, 'goed')}
                >✓</button>
                <button
                  className={`studio-judge${state === 'afgekeurd' ? ' studio-judge-on' : ''}`}
                  aria-label={`${clip.id} afkeuren`}
                  disabled={state === 'ontbreekt'}
                  onClick={() => judge(clip.id, 'afgekeurd')}
                >✗</button>
              </span>
              {clip.transcript !== undefined && <span className="review-heard">gehoord: “{clip.transcript}”</span>}
            </li>
          )
        })}
      </ul>

      <p className="review-actions">
        <button
          className="btn-primary"
          disabled={ticked.size === 0}
          style={{ opacity: ticked.size ? 1 : 0.4 }}
          onClick={() => onRetake([...ticked])}
        >
          🔴 Deze {ticked.size || ''} opnieuw opnemen
        </button>
      </p>
    </div>
  )
}
