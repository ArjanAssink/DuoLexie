import { useEffect, useRef, useState } from 'react'
import type { TakeKind } from './cueSheet'

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

const GAP_MS = 400

/**
 * The listening half of the loop (docs/recording-pipeline-v2.md §5): a three-minute take, a
 * ten-second split, a one-minute listen, and a twenty-second retake of whatever was wrong.
 *
 * The report decides what to look at first, but it does not decide anything else. Every row
 * plays, including the ones it called `ok` — the tool can only hear levels and silence, and
 * "he said it oddly" is not a status it has.
 */
export function TakeReview({ report, onRetake }: { report: SplitReport; onRetake: (ids: string[]) => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [playing, setPlaying] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const chain = useRef<number | null>(null)

  const folder = report.kind === 'klanken' ? 'sounds' : 'words'
  const rows = [...report.clips].sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status))

  useEffect(() => () => stop(), [])

  function stop() {
    if (chain.current !== null) clearTimeout(chain.current)
    chain.current = null
    audio.current?.pause()
    audio.current = null
    setPlaying(null)
  }

  /**
   * Always a fresh <audio> with a cache-buster: a re-split writes over the same URL, and both
   * the browser and the service worker will happily keep handing back the take before it.
   */
  function play(id: string, onEnded?: () => void) {
    audio.current?.pause()
    const el = new Audio(`/audio/${folder}/${id}.mp3?t=${report.generatedAt}`)
    audio.current = el
    setPlaying(id)
    el.onended = () => {
      setPlaying(null)
      onEnded?.()
    }
    el.onerror = () => {
      setPlaying(null)
      onEnded?.()
    }
    void el.play().catch(() => setPlaying(null))
  }

  /** The fastest way to hear a level or quality outlier: all of them, in order, with a gap. */
  function playAll(queue: ReportClip[]) {
    const next = (rest: ReportClip[]) => {
      const [head, ...tail] = rest
      if (!head) return stop()
      play(head.id, () => { chain.current = window.setTimeout(() => next(tail), GAP_MS) })
    }
    next(queue.filter((c) => c.file !== null))
  }

  function toggle(id: string) {
    setChecked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const flagged = rows.filter((r) => r.status !== 'ok')

  return (
    <div className="review">
      <h2>Rapport — {report.summary.ok}/{report.summary.total} ok</h2>
      {report.warnings.map((w) => <p key={w} className="review-warning">⚠️ {w}</p>)}
      <p className="review-actions">
        <button className="btn-primary" onClick={() => playAll(rows)}>▶️ Alles afluisteren</button>
        {playing !== null && <button className="btn-bad" onClick={stop}>⏹ Stop</button>}
        {flagged.length > 0 && (
          <button className="btn-primary" onClick={() => setChecked(new Set(flagged.map((r) => r.id)))}>
            Vink alle {flagged.length} gemarkeerde aan
          </button>
        )}
      </p>

      <ul className="review-list">
        {rows.map((clip) => (
          <li key={clip.id} className={`review-row${clip.status === 'ok' ? '' : ' review-row-flagged'}`}>
            <input
              type="checkbox"
              aria-label={`${clip.id} opnieuw opnemen`}
              checked={checked.has(clip.id)}
              onChange={() => toggle(clip.id)}
            />
            <button
              className="review-play"
              disabled={clip.file === null}
              aria-label={`${clip.id} afspelen`}
              onClick={() => play(clip.id)}
            >
              {playing === clip.id ? '⏸' : '▶️'}
            </button>
            <span className="review-id">{clip.id}</span>
            <span className="review-status">{LABEL[clip.status] ?? clip.status}</span>
            <span className="review-dur">{clip.durationMs === null ? '—' : `${clip.durationMs} ms`}</span>
            <span className="review-peak">{clip.peakDbfs === null ? '' : `${clip.peakDbfs} dB`}</span>
            {clip.transcript !== undefined && <span className="review-heard">gehoord: “{clip.transcript}”</span>}
          </li>
        ))}
      </ul>

      <p className="review-actions">
        <button
          className="btn-primary"
          disabled={checked.size === 0}
          style={{ opacity: checked.size ? 1 : 0.4 }}
          onClick={() => onRetake([...checked])}
        >
          🔴 Deze {checked.size || ''} opnieuw opnemen
        </button>
      </p>
    </div>
  )
}
