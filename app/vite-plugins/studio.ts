/**
 * The dev-server half of the recording studio (docs/recording-studio-v3.md §3).
 *
 * Recording a take used to be: pick a folder in an OS dialog → record → copy a command →
 * switch to a terminal → run it → come back → open a file picker to find the report →
 * restart the dev server → play a round. Every arrow there is a place to put the laptop down,
 * and the loop has to be cheap enough to run three times in an evening or the clips do not
 * get better. This plugin removes all of them: the browser can write a take, run the
 * splitter, read the report back and know about a clip that landed a second ago.
 *
 * Everything here is dev-only by construction. The middleware lives in `configureServer`,
 * which Vite never calls for a build, and the one piece of client code — the virtual module —
 * carries only a list of filenames plus an `import.meta.hot` block that is `undefined` in a
 * production bundle. Nothing under `/__studio` reaches `dist/`.
 *
 * The routes take filenames from a browser and turn them into paths, so every one of them is
 * validated the same way: a basename, nothing that could climb out of the directory, and a
 * folder from a fixed list of three. See `safeBasename`/`safeFolder`/`safeId` below, which
 * are exported and tested on their own (§5 test 5).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const RECORDINGS = join(REPO, 'recordings')
const REJECTED = join(RECORDINGS, 'afgekeurd')
const AUDIO = join(REPO, 'app', 'public', 'audio')
const VERDICTS = join(RECORDINGS, 'verdicts.json')
const SPLITTER = join(REPO, 'tools', 'split-take.mjs')

export const AUDIO_FOLDERS = ['sounds', 'words', 'weetjes'] as const
export type AudioFolder = (typeof AUDIO_FOLDERS)[number]

export const VIRTUAL_ID = 'virtual:recorded-audio'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`

/** A take is at most a few minutes of Opus; this is roughly ten, and stops a runaway upload. */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024

/**
 * A single path segment that cannot climb out of the directory it is joined to.
 *
 * Deliberately a allowlist rather than a search for `..`: a denylist has to anticipate `..`,
 * `%2e%2e`, a leading `/`, a Windows `C:`, a NUL byte and a backslash, and it only takes one
 * of them being missed. Starting from "letters, digits, and then dots, dashes and underscores"
 * there is nothing left to anticipate. The explicit `..` rejection after it is redundant and
 * kept anyway, because §3.1 names it and a reader should be able to see it refused.
 */
export function safeBasename(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 120) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) return null
  if (value.includes('..')) return null
  return value
}

export function safeFolder(value: unknown): AudioFolder | null {
  return AUDIO_FOLDERS.includes(value as AudioFolder) ? (value as AudioFolder) : null
}

/** Clip ids: word ids, klank ids, and Weetjes' `<card>-<part>`. Same rules as a basename. */
export function safeId(value: unknown): string | null {
  return safeBasename(value)
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_UPLOAD_BYTES) throw new Error('upload too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** Ids of the mp3s in one audio folder — what the app calls a "recorded" clip. */
function mp3Ids(folder: AudioFolder): string[] {
  try {
    return readdirSync(join(AUDIO, folder)).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort()
  } catch {
    return [] // the folder may not exist yet
  }
}

function recordedLists(): Record<AudioFolder, string[]> {
  return { sounds: mp3Ids('sounds'), words: mp3Ids('words'), weetjes: mp3Ids('weetjes') }
}

/**
 * The module the app asks "is there a clip for this id".
 *
 * The Sets are exported once and then *mutated* in place by the hot handler rather than
 * re-exported. That is the point: `words.ts` and `weetjes.ts` hold a reference to the Set at
 * module scope, so updating its contents reaches them with no HMR boundary to arrange, no
 * module re-execution, and — the thing that matters during a recording session — no page
 * reload that would throw away the report currently on screen.
 */
function virtualModuleSource(lists: Record<AudioFolder, string[]>): string {
  return `
export const recordedSounds = new Set(${JSON.stringify(lists.sounds)})
export const recordedWords = new Set(${JSON.stringify(lists.words)})
export const recordedWeetjes = new Set(${JSON.stringify(lists.weetjes)})

if (import.meta.hot) {
  const replace = (set, ids) => { set.clear(); for (const id of ids) set.add(id) }
  import.meta.hot.on('studio:recorded', (lists) => {
    replace(recordedSounds, lists.sounds)
    replace(recordedWords, lists.words)
    replace(recordedWeetjes, lists.weetjes)
  })
}
`
}

/** `2026-09-16T20-14-03-114Z` — an ISO instant that is also a legal filename everywhere. */
function fileStamp(at = new Date()): string {
  return at.toISOString().replace(/[:.]/g, '-')
}

function readVerdicts(): unknown {
  try {
    return JSON.parse(readFileSync(VERDICTS, 'utf8'))
  } catch {
    return {}
  }
}

function writeVerdicts(store: unknown) {
  mkdirSync(RECORDINGS, { recursive: true })
  writeFileSync(VERDICTS, `${JSON.stringify(store, null, 2)}\n`)
}

/** Takes in `recordings/`, newest first, with whether they have been split yet. */
function listTakes() {
  try {
    return readdirSync(RECORDINGS)
      .filter((f) => f.endsWith('.webm'))
      .map((file) => {
        const basename = file.slice(0, -'.webm'.length)
        let kind: string | null = null
        let cues = 0
        try {
          const sheet = JSON.parse(readFileSync(join(RECORDINGS, `${basename}.json`), 'utf8'))
          kind = typeof sheet.kind === 'string' ? sheet.kind : null
          cues = Array.isArray(sheet.cues) ? sheet.cues.length : 0
        } catch { /* a take with no cue sheet is still a take, and still listable */ }
        return {
          basename,
          kind,
          cues,
          bytes: statSync(join(RECORDINGS, file)).size,
          recordedAt: statSync(join(RECORDINGS, file)).mtime.toISOString(),
          hasReport: existsSync(join(RECORDINGS, `${basename}.report.json`)),
        }
      })
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  } catch {
    return []
  }
}

/**
 * Run the splitter and narrate it as it goes (§3.3).
 *
 * NDJSON rather than a single response at the end because a split takes tens of seconds on a
 * three-minute take, and a button that goes grey for half a minute with nothing to show is
 * the reason the terminal felt safer. The splitter already writes its progress to stderr, one
 * line per step; those lines are the narration, forwarded as they arrive.
 */
function runSplit(res: ServerResponse, basename: string, ids: string[] | null) {
  const take = join(RECORDINGS, `${basename}.webm`)
  if (!existsSync(take)) return sendJson(res, 404, { error: `No take at recordings/${basename}.webm` })

  res.statusCode = 200
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  const line = (payload: unknown) => res.write(`${JSON.stringify(payload)}\n`)

  const args = [SPLITTER, take, ...(ids && ids.length > 0 ? ['--ids', ids.join(',')] : [])]
  const child = spawn(process.execPath, args, { cwd: REPO })

  // The splitter's exit code is 1 for "some clip needs an ear", which is a normal outcome
  // here and not a transport failure — the report is what says what happened, so it is sent
  // either way and the caller reads `ok` off the summary rather than off the status.
  const forward = (stream: NodeJS.ReadableStream, kind: 'progress' | 'output') => {
    let buffer = ''
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const text of parts) if (text.trim()) line({ type: kind, line: text })
    })
    stream.on('end', () => { if (buffer.trim()) line({ type: kind, line: buffer }) })
  }
  forward(child.stderr, 'progress')
  forward(child.stdout, 'output')

  child.on('error', (err) => {
    line({ type: 'error', error: err.message })
    res.end()
  })
  child.on('close', (code) => {
    let report: unknown = null
    try {
      report = JSON.parse(readFileSync(join(RECORDINGS, `${basename}.report.json`), 'utf8'))
    } catch { /* no report means the splitter died before writing one; `code` says so */ }
    line({ type: 'done', code, report })
    res.end()
  })
}

/**
 * Take a clip out of the app without destroying it (§2.1, §3.1).
 *
 * Moved, never deleted. A retake can come out worse than what it replaced — a different
 * distance from the microphone, a flatter reading — and at that point the only thing that can
 * tell you so is the clip you threw away. `recordings/afgekeurd/` is gitignored with the rest
 * of `recordings/`, so this costs nothing but disk.
 */
function rejectClip(res: ServerResponse, folder: AudioFolder, id: string) {
  const source = join(AUDIO, folder, `${id}.mp3`)
  if (!existsSync(source)) return sendJson(res, 404, { error: `No clip at audio/${folder}/${id}.mp3` })
  mkdirSync(REJECTED, { recursive: true })
  const archived = `${folder}-${id}-${fileStamp()}.mp3`
  renameSync(source, join(REJECTED, archived))
  return sendJson(res, 200, { archived: `recordings/afgekeurd/${archived}` })
}

export function studioPlugin(): Plugin {
  let server: ViteDevServer | null = null

  return {
    name: 'duolexie-studio',

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null
    },

    load(id) {
      return id === RESOLVED_VIRTUAL_ID ? virtualModuleSource(recordedLists()) : null
    },

    configureServer(devServer) {
      server = devServer

      // public/ is not part of the module graph, so nothing imports these files and nothing
      // invalidates anything when one appears. Watching the directory ourselves is what makes
      // a clip the splitter wrote a moment ago usable by the next round without a dev-server
      // restart (§3.2) — the caveat that used to be written into vite.config.ts and repeated
      // as small print on the studio's own screen.
      //
      // `server.watcher.add` is passed a plain directory, not a glob: chokidar 4 dropped glob
      // support, so a `/**` suffix would be taken as the literal name of a directory that
      // does not exist. In practice Vite already watches the project root and these events
      // arrive either way; this makes it true by intent rather than by luck.
      server.watcher.add(AUDIO)

      let pending: NodeJS.Timeout | null = null
      const announce = (file: string) => {
        if (!file.startsWith(AUDIO) || !file.endsWith('.mp3')) return
        // a split writes twenty files in a second; one announcement covers them all
        if (pending) clearTimeout(pending)
        pending = setTimeout(() => {
          pending = null
          const lists = recordedLists()
          // Two things, because they serve two different pages. Invalidating drops the cached
          // transform so the *next* page load compiles a fresh list; the custom event refills
          // the Sets in the page that is open right now. Only the second one matters during a
          // session, and it is the one that must not be a reload: the report on screen is the
          // thing that was just recorded.
          for (const env of Object.values(server?.environments ?? {})) {
            const mod = env.moduleGraph?.getModuleById(RESOLVED_VIRTUAL_ID)
            if (mod) env.moduleGraph.invalidateModule(mod)
          }
          server?.hot.send('studio:recorded', lists)
        }, 150)
      }
      for (const event of ['add', 'change', 'unlink'] as const) server.watcher.on(event, announce)

      const handler: Connect.NextHandleFunction = (req, res) => {
        void (async () => {
          const url = new URL(req.url ?? '/', 'http://studio.local')
          const route = url.pathname.replace(/\/$/, '')
          const method = req.method ?? 'GET'

          try {
            if (route === '/takes' && method === 'GET') return sendJson(res, 200, { takes: listTakes() })

            if (route === '/verdicts' && method === 'GET') return sendJson(res, 200, readVerdicts())

            if (route === '/verdicts' && method === 'PUT') {
              const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
              if (!body || typeof body !== 'object' || Array.isArray(body)) {
                return sendJson(res, 400, { error: 'verdicts must be an object' })
              }
              writeVerdicts(body)
              return sendJson(res, 200, { ok: true })
            }

            if (route === '/report' && method === 'GET') {
              const take = safeBasename(url.searchParams.get('take'))
              if (!take) return sendJson(res, 400, { error: 'bad take name' })
              const path = join(RECORDINGS, `${take}.report.json`)
              if (!existsSync(path)) return sendJson(res, 404, { error: 'no report yet' })
              return sendJson(res, 200, JSON.parse(readFileSync(path, 'utf8')))
            }

            if (route === '/take' && method === 'POST') {
              const contentType = req.headers['content-type'] ?? ''
              const body = await readBody(req)
              // Node's own multipart parser, via undici's Request — no dependency, and no
              // hand-rolled boundary splitting over binary data to get subtly wrong
              const form = await new Request('http://studio.local/', {
                method: 'POST',
                headers: { 'content-type': contentType },
                body,
              }).formData()

              const basename = safeBasename(form.get('basename'))
              const cues = form.get('cues')
              const take = form.get('take')
              if (!basename) return sendJson(res, 400, { error: 'bad take name' })
              if (typeof cues !== 'string') return sendJson(res, 400, { error: 'cue sheet missing' })
              if (typeof take === 'string' || take === null) return sendJson(res, 400, { error: 'take missing' })

              mkdirSync(RECORDINGS, { recursive: true })
              writeFileSync(join(RECORDINGS, `${basename}.webm`), Buffer.from(await take.arrayBuffer()))
              writeFileSync(join(RECORDINGS, `${basename}.json`), cues.endsWith('\n') ? cues : `${cues}\n`)
              return sendJson(res, 200, { basename, wrote: [`${basename}.webm`, `${basename}.json`] })
            }

            if (route === '/split' && method === 'POST') {
              const take = safeBasename(url.searchParams.get('take'))
              if (!take) return sendJson(res, 400, { error: 'bad take name' })
              const raw = url.searchParams.get('ids')
              const ids = raw ? raw.split(',').map(safeId) : null
              if (ids && ids.some((id) => id === null)) return sendJson(res, 400, { error: 'bad id' })
              return runSplit(res, take, ids as string[] | null)
            }

            if (route === '/reject' && method === 'POST') {
              const folder = safeFolder(url.searchParams.get('folder'))
              const id = safeId(url.searchParams.get('id'))
              if (!folder) return sendJson(res, 400, { error: 'unknown folder' })
              if (!id) return sendJson(res, 400, { error: 'bad id' })
              return rejectClip(res, folder, id)
            }

            // Anything else under /__studio is a mistake, not a page: falling through would
            // hand back index.html with a 200 and a fetch would try to parse it as JSON.
            return sendJson(res, 404, { error: `no such studio route: ${method} ${route}` })
          } catch (err) {
            return sendJson(res, 500, { error: (err as Error).message })
          }
        })()
      }

      server.middlewares.use('/__studio', handler)
    },
  }
}

/**
 * The same lists, read once, for a production build — where there is no dev server to watch
 * anything and the contents of `public/audio/` are fixed at the moment the bundle is made.
 */
export function buildTimeRecordedLists(): Record<AudioFolder, string[]> {
  return recordedLists()
}
