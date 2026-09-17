/**
 * The browser half of the dev-server studio API (docs/recording-studio-v3.md §3,
 * app/vite-plugins/studio.ts).
 *
 * Everything here degrades. The middleware only exists when the app is served by `vite dev`
 * from this repo — not in the preview build, not on the deployed site, not if the plugin is
 * ever removed — so each call reports failure rather than throwing, and the studio keeps the
 * File System Access picker as the path it falls back to. A recording session that has
 * already captured three minutes of audio must never lose it to a 404.
 */

import type { CueSheet } from './cueSheet'
import type { SplitReport } from './TakeReview'
import type { VerdictStore } from './verdicts'

const BASE = '/__studio'

export interface TakeInfo {
  basename: string
  kind: string | null
  cues: number
  bytes: number
  recordedAt: string
  hasReport: boolean
}

export type SplitLine =
  | { type: 'progress' | 'output'; line: string }
  | { type: 'error'; error: string }
  | { type: 'done'; code: number | null; report: SplitReport | null }

/**
 * Is the dev middleware there?
 *
 * Asked once and remembered: it cannot appear or disappear during a session, and the answer
 * decides which of two quite different flows the whole screen offers.
 */
let availability: Promise<boolean> | null = null

export function studioAvailable(): Promise<boolean> {
  availability ??= fetch(`${BASE}/takes`, { method: 'GET' })
    .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json'))
    .catch(() => false)
  return availability
}

/** Only for tests, which need to ask again after changing what the route does. */
export function resetStudioAvailability(): void {
  availability = null
}

async function json<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchTakes(): Promise<TakeInfo[]> {
  return (await json<{ takes: TakeInfo[] }>('/takes'))?.takes ?? []
}

export async function fetchReport(basename: string): Promise<SplitReport | null> {
  return json<SplitReport>(`/report?take=${encodeURIComponent(basename)}`)
}

export async function fetchVerdicts(): Promise<VerdictStore | null> {
  return json<VerdictStore>('/verdicts')
}

export async function saveVerdicts(store: VerdictStore): Promise<boolean> {
  const res = await json<{ ok: boolean }>('/verdicts', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(store),
  })
  return res?.ok === true
}

/** Move a clip out of public/ into recordings/afgekeurd/. Never deletes it. */
export async function archiveClip(folder: string, id: string): Promise<boolean> {
  const res = await json<{ archived: string }>(
    `/reject?folder=${encodeURIComponent(folder)}&id=${encodeURIComponent(id)}`,
    { method: 'POST' },
  )
  return res !== null
}

/** Write the take and its cue sheet into recordings/, in one request. */
export async function uploadTake(basename: string, blob: Blob, sheet: CueSheet): Promise<boolean> {
  const form = new FormData()
  form.append('basename', basename)
  form.append('cues', `${JSON.stringify(sheet, null, 2)}\n`)
  form.append('take', blob, `${basename}.webm`)
  return (await json<{ basename: string }>('/take', { method: 'POST', body: form })) !== null
}

/**
 * Run the splitter, calling `onLine` for each line as it arrives.
 *
 * The response is NDJSON over a streaming body rather than one JSON object at the end,
 * because a split takes tens of seconds and a screen that shows nothing for tens of seconds
 * is the reason the terminal felt safer. The last line carries the report.
 */
export async function splitTake(
  basename: string,
  ids: string[] | null,
  onLine: (line: SplitLine) => void,
): Promise<SplitReport | null> {
  const query = new URLSearchParams({ take: basename })
  if (ids && ids.length > 0) query.set('ids', ids.join(','))

  let res: Response
  try {
    res = await fetch(`${BASE}/split?${query}`, { method: 'POST' })
  } catch (err) {
    onLine({ type: 'error', error: (err as Error).message })
    return null
  }
  if (!res.ok || !res.body) {
    onLine({ type: 'error', error: `de dev-server gaf ${res.status} terug` })
    return null
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let report: SplitReport | null = null

  const consume = (text: string) => {
    if (!text.trim()) return
    let parsed: SplitLine
    try {
      parsed = JSON.parse(text) as SplitLine
    } catch {
      return // a half-written line at the end of a killed stream is not worth reporting
    }
    if (parsed.type === 'done') report = parsed.report
    onLine(parsed)
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) consume(part)
  }
  consume(buffer)
  return report
}
