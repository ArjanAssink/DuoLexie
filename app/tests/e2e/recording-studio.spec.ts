import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CALM_WAV, fakeMicArgs } from './fixtures/fakeMic'

/**
 * Half a second of real, decodable mp3.
 *
 * A one-byte body with an audio content type is enough for the studio's HEAD probe, but an
 * `<audio>` pointed at it fires `error` almost immediately — and the player treats an error
 * the same as an ending, so a clip would stop being "playing" before any assertion could see
 * it. This is the same fixture audio-fallback.spec.ts uses.
 */
const SILENT_MP3 = readFileSync(fileURLToPath(new URL('./fixtures/silent.mp3', import.meta.url)))

/**
 * The studio, rebuilt around one continuous take (docs/recording-pipeline-v2.md §3, §5).
 *
 * These replace the two auto-chain tests: there is no chain any more, because there is no
 * clicking between words. What matters now is the cue sheet — it is the only thing that says
 * which burst of speech is which word, and a take with a wrong one produces a full set of
 * confidently mislabelled clips that nothing downstream can catch.
 *
 * Desktop (Chromium) only: the studio needs the fake-media flags and the File System Access
 * API, and it is a dev tool she never opens.
 */

/** A take runs in real time: 3s countdown, a beat, then a word per pace. */
const LEAD_IN_MS = 3000
const GO_GAP_MS = 800
const PACE_MS = 1500

interface Cue { id: string; shownAt: number; hiddenAt: number; retake?: true }
interface Written { name: string; text?: string; size?: number }

const REPORT_FIXTURE = {
  version: 1,
  generatedAt: '2026-09-14T19:10:00.000Z',
  kind: 'woorden',
  out: 'app/public/audio/words',
  warnings: ['Lead-in beeps not found; falling back to the recorder start for alignment.'],
  clips: [
    { id: 'aan', status: 'ok', flags: [], startMs: 4100, endMs: 4700, durationMs: 600, peakDbfs: -4.2, file: 'aan.mp3' },
    { id: 'bal', status: 'missing', flags: ['missing'], startMs: null, endMs: null, durationMs: null, peakDbfs: null, file: null },
    { id: 'kat', status: 'ok', flags: [], startMs: 9100, endMs: 9800, durationMs: 700, peakDbfs: -5.1, file: 'kat.mp3' },
    { id: 'tas', status: 'multiple', flags: ['multiple'], startMs: 6600, endMs: 7200, durationMs: 600, peakDbfs: -6.0, file: 'tas.mp3' },
  ],
  summary: { total: 4, ok: 2 },
}

/**
 * Stand in for the OS folder picker, and remember what was written to it.
 *
 * Also serves the split report back, so the review screen can be driven without running
 * ffmpeg in a browser test.
 */
/**
 * Every clip probe and every playback in one place, with a `Last-Modified` the studio can
 * hang a verdict on.
 *
 * `served` are the ids that have an mp3; everything else answers the way Vite's dev server
 * answers a missing file in `public/` — the SPA's index.html, with a 200 — which is exactly
 * why the studio checks the content type rather than the status.
 */
async function stubClips(page: Page, folder: string, served: Record<string, string>) {
  await page.route(`**/audio/${folder}/*.mp3*`, (route) => {
    const id = decodeURIComponent(route.request().url().split('/').pop()!.replace(/\.mp3.*$/, ''))
    const lastModified = served[id]
    route.fulfill(
      lastModified
        ? {
            status: 200,
            contentType: 'audio/mpeg',
            headers: { 'last-modified': lastModified },
            body: SILENT_MP3,
          }
        : { status: 200, contentType: 'text/html', body: '<!doctype html>' },
    )
  })
}

/**
 * Record what actually got played, and control when it finishes.
 *
 * A one-byte mp3 never fires `ended` in a headless browser, so a walk through a set would
 * stall on the first clip. `autoEndMs` ends each clip on a timer for the tests about *order*;
 * `null` leaves it sounding for the tests about what the screen looks like *while* it plays,
 * which a 30ms clip is gone before anyone can assert.
 */
async function spyOnPlayback(page: Page, autoEndMs: number | null = 30) {
  await page.addInitScript((endAfter) => {
    const played: string[] = []
    ;(window as unknown as { __played: string[] }).__played = played
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      played.push(this.getAttribute('src') ?? '')
      if (endAfter !== null) setTimeout(() => this.dispatchEvent(new Event('ended')), endAfter)
      return Promise.resolve()
    }
  }, autoEndMs)
}

const playedUrls = (page: Page) => page.evaluate(() => (window as unknown as { __played: string[] }).__played)

/**
 * Hide the dev middleware.
 *
 * `vite dev` really does serve /__studio in this suite, and a studio that finds it uploads
 * takes into `recordings/` for real. These specs are about the browser, so the middleware is
 * switched off for all of them except the one that is about the middleware, which stubs it.
 */
async function withoutStudioApi(page: Page) {
  await page.route('**/__studio/**', (route) => route.fulfill({ status: 404, body: 'off' }))
}

async function stubFolder(page: Page) {
  await page.addInitScript((report) => {
    const w = window as unknown as { __writes: Written[]; showDirectoryPicker: unknown }
    w.__writes = []
    w.showDirectoryPicker = async () => ({
      name: 'recordings',
      async getFileHandle(name: string) {
        if (name.endsWith('.report.json')) {
          return { async getFile() { return new File([JSON.stringify(report)], name) } }
        }
        return {
          async createWritable() {
            return {
              async write(data: Blob | string) {
                w.__writes.push(typeof data === 'string' ? { name, text: data } : { name, size: data.size })
              },
              async close() {},
            }
          },
        }
      },
    })
  }, REPORT_FIXTURE)
}

/**
 * Narrow the twenty-word starter set down to `keep` words, by telling the studio the rest
 * already have an mp3 — which is what its "alleen ontbrekende" switch is for. Three words is
 * a nine-second take; twenty would be fifty.
 */
async function threeWordSet(page: Page, keep: number): Promise<string[]> {
  await page.goto('/#/opnemen')
  // No route renders until both persisted stores have hydrated from IndexedDB
  // (state/hydration.ts), so the grid arrives a beat after load — and allTextContents(),
  // unlike most locator calls, reads whatever matches right now instead of waiting for it.
  await expect(page.locator('.studio-cell-id').first()).toBeVisible()
  const ids = await page.locator('.studio-cell-id').allTextContents()
  // the probe pass has to finish before "alleen ontbrekende" can be believed
  await page.waitForTimeout(150)
  expect(ids.length).toBeGreaterThan(keep)
  const missing = ids.slice(0, keep)

  const served: Record<string, string> = {}
  for (const id of ids.slice(keep)) served[id] = 'Tue, 15 Sep 2026 10:00:00 GMT'
  await stubClips(page, 'words', served)
  await page.reload()
  await expect(page.getByText(`alleen ontbrekende (${keep} van ${ids.length})`)).toBeVisible()
  await page.getByRole('checkbox').check()
  return missing
}

async function startTake(page: Page) {
  await page.getByRole('button', { name: /Kies map/ }).click()
  await expect(page.getByText('Map gekozen')).toBeVisible()
  await page.locator('input[type=range]').fill(String(PACE_MS))
  await page.getByRole('button', { name: /Start take/ }).click()
}

async function writtenCueSheet(page: Page) {
  const writes = await page.evaluate(() => (window as unknown as { __writes: Written[] }).__writes)
  const webm = writes.find((w) => w.name.endsWith('.webm'))
  const json = writes.find((w) => w.name.endsWith('.json'))
  expect(webm, 'the take itself was written').toBeTruthy()
  expect(webm!.size).toBeGreaterThan(0)
  expect(json, 'the cue sheet was written next to it').toBeTruthy()
  // same basename, so `node tools/split-take.mjs <take>.webm` finds the cue sheet with no flag
  expect(json!.name.replace(/\.json$/, '')).toBe(webm!.name.replace(/\.webm$/, ''))
  return JSON.parse(json!.text!) as {
    version: number; kind: string; paceMs: number; leadInMs: number
    beeps: { lastEndAt: number; spacingMs: number }
    cues: Cue[]; pauses: unknown[]
  }
}

/**
 * A microphone at a sane level, for the whole file.
 *
 * Chromium's default fake device is a beep at nearly full scale, which the new clip detector
 * flags — correctly — on every word, so a take recorded against it comes back with every cue
 * marked for retake and a test about cue-sheet timing ends up measuring the meter. Playwright
 * only allows `launchOptions` at the top level of a file, which is why the meter tests that
 * need a *different* microphone live in their own specs beside this one.
 */
test.use({ launchOptions: { args: fakeMicArgs(CALM_WAV) } })

test.describe('recording studio: one continuous take', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone'])
    await withoutStudioApi(page)
    await stubFolder(page)
  })

  test('a take writes the webm and a cue sheet timed to the prompts', async ({ page }) => {
    test.slow() // the take itself is 8s of wall clock and cannot be hurried
    const words = await threeWordSet(page, 3)
    await startTake(page)

    // 3 · 2 · 1, a beat, then the first word — and nothing to click through
    await expect(page.locator('.tp-count')).toBeVisible()
    await expect(page.locator('.tp-word')).toHaveText(words[0], { timeout: 8000 })
    await expect(page.getByText(/Take opgeslagen/)).toBeVisible({ timeout: 15_000 })

    const sheet = await writtenCueSheet(page)
    expect(sheet.version).toBe(1)
    expect(sheet.kind).toBe('woorden')
    expect(sheet.paceMs).toBe(PACE_MS)
    expect(sheet.leadInMs).toBe(LEAD_IN_MS)
    expect(sheet.pauses).toEqual([])
    // the anchor split-take.mjs measures the recorder-start skew against
    expect(sheet.beeps).toMatchObject({ lastEndAt: LEAD_IN_MS + 120, spacingMs: 1000 })

    expect(sheet.cues.map((c) => c.id)).toEqual(words)
    expect(sheet.cues.every((c) => c.retake === undefined)).toBe(true)
    // The first word appears a beat after the countdown, and the rest follow at the pace —
    // but only ever late, never early. How late is not the assertion: a setTimeout on a
    // loaded machine drifts, and the cue sheet writing down what actually happened instead of
    // what was scheduled is the whole reason it exists. The loose upper bounds are only here
    // to catch a pace that was ignored outright.
    expect(sheet.cues[0].shownAt).toBeGreaterThan(LEAD_IN_MS + GO_GAP_MS - 100)
    expect(sheet.cues[0].shownAt).toBeLessThan((LEAD_IN_MS + GO_GAP_MS) * 2)
    for (let i = 1; i < sheet.cues.length; i++) {
      const gap = sheet.cues[i].shownAt - sheet.cues[i - 1].shownAt
      expect(gap).toBeGreaterThanOrEqual(PACE_MS)
      expect(gap).toBeLessThan(PACE_MS * 3)
      // Each cue is closed by the same reading of the clock that opens the next: a hole
      // between them would be take that no prompt's own span covers, and the splitter reads
      // "inside exactly one prompt" as the thing that makes a burst unambiguous.
      expect(sheet.cues[i].shownAt).toBe(sheet.cues[i - 1].hiddenAt)
    }
  })

  test('space flags the word on screen and it comes back at the end of the set', async ({ page }) => {
    test.slow()
    const words = await threeWordSet(page, 3)
    await startTake(page)

    const word = page.locator('.tp-word')
    await expect(word).toHaveText(words[0], { timeout: 8000 })
    await expect(word).toHaveText(words[1])
    await page.keyboard.press('Space')

    // the only acknowledgement the key gets, and the only thing on screen that changes
    await expect(page.locator('.tp-word-flagged')).toBeVisible()
    await expect(page.locator('.tp-pending')).toHaveText(/1 opnieuw/)
    // …and the word itself comes round again after the last one of the set
    await expect(word).toHaveText(words[1], { timeout: 8000 })

    await expect(page.getByText(/Take opgeslagen/)).toBeVisible({ timeout: 15_000 })
    const sheet = await writtenCueSheet(page)

    expect(sheet.cues.map((c) => c.id)).toEqual([...words, words[1]])
    expect(sheet.cues[1].retake).toBe(true)
    // the retake is not itself flagged, so split-take.mjs cuts that one and drops the first
    expect(sheet.cues[3].retake).toBeUndefined()
    expect(sheet.cues.filter((c) => c.retake).length).toBe(1)
  })

  test('the report puts the flagged clips first and hands the checked ones to a new take', async ({ page }) => {
    test.slow()
    await threeWordSet(page, 3)
    await startTake(page)
    await expect(page.getByText(/Take opgeslagen/)).toBeVisible({ timeout: 15_000 })

    // the split command is the next step, and says so with the take's real name
    await expect(page.locator('.studio-next pre')).toHaveText(/node tools\/split-take\.mjs recordings\/woorden-/)

    await page.getByRole('button', { name: 'Rapport laden' }).click()
    await expect(page.getByRole('heading', { name: /Rapport — 2\/4 ok/ })).toBeVisible()
    await expect(page.locator('.review-warning')).toContainText('beeps not found')

    // worst first: nothing was heard for "bal", so it is the one with no file at all
    await expect(page.locator('.review-id')).toHaveText(['bal', 'tas', 'aan', 'kat'])
    await expect(page.locator('.review-row').first()).toHaveClass(/review-row-flagged/)
    await expect(page.getByRole('button', { name: 'bal afspelen' })).toBeDisabled()

    await page.getByRole('button', { name: /Vink alle 2 gemarkeerde aan/ }).click()
    await page.getByRole('button', { name: /Deze .* opnieuw opnemen/ }).click()

    // back on the setup screen, with the next take narrowed to exactly those two
    await expect(page.getByText('Opnieuw opnemen:')).toBeVisible()
    await expect(page.locator('.studio-retake b')).toHaveText('bal · tas')
    await expect(page.getByRole('button', { name: /Start take \(2 woorden\)/ })).toBeVisible()
  })
})

/**
 * §2.1: the set grid is where clips are judged. Tests 6 and 7 of docs/recording-studio-v3.md §5.
 *
 * Playback is spied rather than heard — nothing in this sandbox can listen — so what these
 * assert is which URL was asked for, in what order, and what the screen did about it. That is
 * the part that can be wrong in a way a person would not notice: a cell that plays the
 * previous clip's cached audio, or a verdict that silently survives a retake.
 */
test.describe('judging the set from the grid', () => {
  const MONDAY = 'Mon, 14 Sep 2026 09:00:00 GMT'
  const TUESDAY = 'Tue, 15 Sep 2026 18:30:00 GMT'

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone'])
    await withoutStudioApi(page)
  })

  /** The first `count` words of the starter set, all with a clip; the rest with none. */
  async function setWithClips(page: Page, count: number, lastModified = MONDAY) {
    await page.goto('/#/opnemen')
    await expect(page.locator('.studio-cell-id').first()).toBeVisible()
    const ids = (await page.locator('.studio-cell-id').allTextContents()).slice(0, count)
    const served: Record<string, string> = {}
    for (const id of ids) served[id] = lastModified
    await stubClips(page, 'words', served)
    await page.reload()
    await expect(page.getByRole('button', { name: `▶︎ Alles afspelen (${count})` })).toBeVisible()
    return ids
  }

  test('a cell plays its own clip, cache-busted on the file it is playing', async ({ page }) => {
    await spyOnPlayback(page, null)
    const [kat, tas] = await setWithClips(page, 3)

    await page.getByRole('button', { name: `${kat} afspelen` }).click()
    await expect(page.locator(`.studio-cell[data-id="${kat}"]`)).toHaveClass(/studio-cell-playing/)

    // ?v=<Last-Modified>, not a timestamp: a retake overwrites the same URL, and both the
    // browser and the service worker will otherwise go on serving the take before it —
    // which during a judging pass means approving audio that no longer exists
    expect(await playedUrls(page)).toEqual([`/audio/words/${kat}.mp3?v=${encodeURIComponent(MONDAY)}`])

    await page.getByRole('button', { name: `${tas} afspelen` }).click()
    await expect(page.locator(`.studio-cell[data-id="${kat}"]`)).not.toHaveClass(/studio-cell-playing/)
    await expect(page.locator(`.studio-cell[data-id="${tas}"]`)).toHaveClass(/studio-cell-playing/)
  })

  test('a cell with nothing recorded cannot be played', async ({ page }) => {
    await spyOnPlayback(page, 30)
    await setWithClips(page, 2)
    const empty = page.locator('.studio-cell[data-state="ontbreekt"]').first()
    await expect(empty.locator('.studio-cell-face')).toBeDisabled()
  })

  test('Alles afspelen walks every recorded clip, in order, and stops on request', async ({ page }) => {
    await spyOnPlayback(page, 30)
    const ids = await setWithClips(page, 3)

    await page.getByRole('button', { name: '▶︎ Alles afspelen (3)' }).click()
    await expect.poll(() => playedUrls(page).then((u) => u.length)).toBe(3)
    expect(await playedUrls(page)).toEqual(
      ids.map((id) => `/audio/words/${id}.mp3?v=${encodeURIComponent(MONDAY)}`),
    )

    await page.getByRole('button', { name: '▶︎ Alles afspelen (3)' }).click()
    await page.getByRole('button', { name: '⏹ Stop' }).click()
    const afterStop = (await playedUrls(page)).length
    await page.waitForTimeout(600)
    expect(await playedUrls(page), 'stopping ends the walk rather than pausing it').toHaveLength(afterStop)
  })

  test('the arrow keys move a focus ring and Enter plays what it is on', async ({ page }) => {
    await spyOnPlayback(page, null)
    const ids = await setWithClips(page, 3)

    await page.getByRole('button', { name: `${ids[0]} afspelen` }).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('button', { name: `${ids[2]} afspelen` })).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')

    expect(await playedUrls(page)).toEqual([`/audio/words/${ids[1]}.mp3?v=${encodeURIComponent(MONDAY)}`])
  })

  test('afkeuren counts as missing, survives a reload, and resets when a retake lands', async ({ page }) => {
    await spyOnPlayback(page, 30)
    const [kat] = await setWithClips(page, 3)
    const cell = page.locator(`.studio-cell[data-id="${kat}"]`)

    await expect(page.getByRole('button', { name: /Woorden, startset/ })).toContainText('0 goed van 20')
    await page.getByRole('button', { name: `${kat} goedkeuren` }).click()
    await expect(cell).toHaveAttribute('data-state', 'goed')
    await expect(page.getByRole('button', { name: /Woorden, startset/ })).toContainText('1 goed van 20')

    await page.getByRole('button', { name: `${kat} afkeuren` }).click()
    await expect(cell).toHaveAttribute('data-state', 'afgekeurd')
    await expect(page.getByRole('button', { name: /Woorden, startset/ })).toContainText('0 goed van 20')

    // the whole point of the verdict: the next take picks the word up with nothing else to do
    await expect(page.getByText('alleen ontbrekende (18 van 20)')).toBeVisible()
    await page.getByRole('checkbox').check()
    await expect(page.getByRole('button', { name: /Start take \(18 woorden\)/ })).toBeVisible()

    // …and it is still there tomorrow
    await page.reload()
    await expect(page.locator(`.studio-cell[data-id="${kat}"]`)).toHaveAttribute('data-state', 'afgekeurd')

    // a retake lands: a new file, so the old opinion is not about it any more. Without this
    // the ❌ that sent the word away would come back with it, and — since ❌ counts as
    // missing — queue the word forever.
    await stubClips(page, 'words', { [kat]: TUESDAY })
    await page.reload()
    await expect(page.locator(`.studio-cell[data-id="${kat}"]`)).toHaveAttribute('data-state', 'onbeoordeeld')
  })

  test('G and A judge the clip that is sounding and move straight on', async ({ page }) => {
    await spyOnPlayback(page, null)
    const ids = await setWithClips(page, 3)

    await page.getByRole('button', { name: '▶︎ Alles afspelen (3)' }).click()
    await expect(page.locator(`.studio-cell[data-id="${ids[0]}"]`)).toHaveClass(/studio-cell-playing/)
    await page.keyboard.press('g')

    await expect(page.locator(`.studio-cell[data-id="${ids[0]}"]`)).toHaveAttribute('data-state', 'goed')
    // judging is also "next": twenty clips in twenty keystrokes is the entire feature
    await expect(page.locator(`.studio-cell[data-id="${ids[1]}"]`)).toHaveClass(/studio-cell-playing/)

    await page.keyboard.press('a')
    await expect(page.locator(`.studio-cell[data-id="${ids[1]}"]`)).toHaveAttribute('data-state', 'afgekeurd')
  })

  test('Alleen onbeoordeeld skips what has already been judged', async ({ page }) => {
    await spyOnPlayback(page, 30)
    const ids = await setWithClips(page, 3)

    await page.getByRole('button', { name: `${ids[0]} goedkeuren` }).click()
    await page.getByRole('button', { name: '▶︎ Alleen onbeoordeeld (2)' }).click()

    await expect.poll(() => playedUrls(page).then((u) => u.length)).toBe(2)
    expect(await playedUrls(page)).toEqual(
      ids.slice(1).map((id) => `/audio/words/${id}.mp3?v=${encodeURIComponent(MONDAY)}`),
    )
  })
})

/**
 * §3.3, test 10: the terminal leaves the loop.
 *
 * Against a stubbed `/__studio/split`, because the real one runs ffmpeg for half a minute on
 * a take this suite has no way to record. What is being checked is the seam: that the button
 * narrates the split while it happens, shows the report when it lands, and that the report it
 * shows is one that can be judged.
 */
test.describe('knip en beluister, without a terminal', () => {
  const TAKE_REPORT = {
    version: 1,
    generatedAt: '2026-09-16T20:10:00.000Z',
    kind: 'woorden',
    out: 'app/public/audio/words',
    warnings: [],
    audio: { appliedGainDb: 7.4, gainSource: 'reused', gainFrom: 'woorden-2026-09-16-1955' },
    clips: [
      { id: 'kat', status: 'ok', flags: [], startMs: 4100, endMs: 4700, durationMs: 600, peakDbfs: -4.2, file: 'kat.mp3' },
      { id: 'tas', status: 'ok', flags: [], startMs: 6600, endMs: 7200, durationMs: 600, peakDbfs: -6.0, file: 'tas.mp3' },
    ],
    summary: { total: 2, ok: 2 },
  }

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone'])
    await spyOnPlayback(page)

    await page.route('**/__studio/takes', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ takes: [] }) }))
    await page.route('**/__studio/verdicts', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await page.route('**/__studio/take', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ basename: 'x' }) }))
    await page.route('**/__studio/split*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: [
          JSON.stringify({ type: 'progress', line: 'Decoding woorden-2026-09-16-2005.webm…' }),
          JSON.stringify({ type: 'progress', line: "Reusing woorden-2026-09-16-1955's level: +7.4 dB…" }),
          JSON.stringify({ type: 'progress', line: 'Noise floor -71.2 dBFS → silence below -55.0 dB; 7 bursts in 12.1s.' }),
          JSON.stringify({ type: 'done', code: 0, report: TAKE_REPORT }),
          '',
        ].join('\n'),
      }))
  })

  test('one button splits the take, narrates it, and hands back a report to judge', async ({ page }) => {
    test.slow()
    const words = await threeWordSet(page, 3)
    // with the middleware present the picker is not offered at all — there is nothing to pick
    await expect(page.getByRole('button', { name: /Kies map/ })).toHaveCount(0)
    await page.locator('input[type=range]').fill(String(PACE_MS))
    await page.getByRole('button', { name: /Start take/ }).click()
    await expect(page.getByText(/Take opgeslagen/)).toBeVisible({ timeout: 15_000 })
    expect(words).toHaveLength(3)

    // no command to copy, and nowhere to copy it to
    await expect(page.locator('.studio-next pre.studio-progress')).toHaveCount(0)
    await expect(page.getByText('node tools/split-take.mjs')).toHaveCount(0)

    // the clips the split is about to write; the studio re-probes when the report lands, and
    // a verdict needs a Last-Modified to belong to
    await stubClips(page, 'words', {
      kat: 'Wed, 16 Sep 2026 20:10:00 GMT',
      tas: 'Wed, 16 Sep 2026 20:10:00 GMT',
    })
    await page.getByRole('button', { name: /Knip en beluister/ }).click()

    // the splitter's own lines, as they arrive — a button that goes grey for half a minute
    // with nothing to show is why the terminal felt safer
    await expect(page.locator('.studio-progress')).toContainText('Decoding')
    await expect(page.locator('.studio-progress')).toContainText('7 bursts in 12.1s')

    await expect(page.getByRole('heading', { name: /Rapport — 2\/2 ok/ })).toBeVisible()
    await expect(page.locator('.review-note')).toContainText('woorden-2026-09-16-1955')

    // and the report is a thing that can be judged, not just read
    // the probe pass has to have found the new clips before a verdict can belong to one: a
    // verdict is about a *file*, and until the Last-Modified is known there is nothing to
    // attach it to (§2.1)
    const katRow = page.locator('.review-row').filter({ hasText: 'kat' })
    await expect(katRow).toHaveAttribute('data-state', 'onbeoordeeld')
    await page.getByRole('button', { name: 'kat goedkeuren' }).click()
    await expect(katRow).toHaveAttribute('data-state', 'goed')
  })
})

/**
 * §2.8, test 11. `TakeReview` worked its folder out as `klanken → sounds, else words`, so a
 * Weetjes report played every row from `/audio/words/slim-doe.mp3`, found nothing, and
 * reported nothing about it — a whole set silently unlistenable.
 */
test.describe('a Weetjes report', () => {
  const WEETJE_REPORT = {
    version: 1,
    generatedAt: '2026-09-16T20:40:00.000Z',
    kind: 'weetjes',
    out: 'app/public/audio/weetjes',
    warnings: [],
    clips: [
      { id: 'slim-fact', status: 'ok', flags: [], startMs: 4100, endMs: 8700, durationMs: 4600, peakDbfs: -5.2, file: 'slim-fact.mp3' },
    ],
    summary: { total: 1, ok: 1 },
  }

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone'])
    await withoutStudioApi(page)
    await spyOnPlayback(page, null)
    await page.addInitScript((report) => {
      ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async () => ({
        name: 'recordings',
        async getFileHandle(name: string) {
          if (name.endsWith('.report.json')) {
            return { async getFile() { return new File([JSON.stringify(report)], name) } }
          }
          return { async createWritable() { return { async write() {}, async close() {} } } }
        },
      })
    }, WEETJE_REPORT)
  })

  test('shows the sentence with the id underneath, and plays from /audio/weetjes/', async ({ page }) => {
    test.slow()
    await page.goto('/#/opnemen')
    await expect(page.locator('.studio-cell-id').first()).toBeVisible()
    await page.getByRole('button', { name: /^Weetjes/ }).click()
    const cues = await page.locator('.studio-cell-sub').allTextContents()
    expect(cues.length).toBeGreaterThan(1)

    // Every cue but one already recorded, so "alleen ontbrekende" leaves a single-cue take.
    // The full Weetjes set is forty-odd sentences: at the fastest pace the slider allows that
    // is over a minute of wall clock on a shared two-core runner, for a test about which
    // folder a row plays from.
    const served: Record<string, string> = { 'slim-fact': 'Wed, 16 Sep 2026 20:40:00 GMT' }
    for (const id of cues.slice(1)) served[id] = 'Mon, 14 Sep 2026 09:00:00 GMT'
    delete served[cues[0]]
    await stubClips(page, 'weetjes', served)
    await page.reload()
    await page.getByRole('button', { name: /^Weetjes/ }).click()
    await expect(page.getByText(`alleen ontbrekende (1 van ${cues.length})`)).toBeVisible()
    await page.getByRole('checkbox').check()

    await page.getByRole('button', { name: /Kies map/ }).click()
    await expect(page.getByText('Map gekozen')).toBeVisible()

    // the grid already reads as sentences rather than as `slim-doe`
    await expect(page.locator('.studio-cell-wide .studio-cell-id').first()).not.toHaveText(/^[a-z-]+$/)
    await expect(page.locator('.studio-cell-wide .studio-cell-sub').first()).toHaveText(/-(fact|doe|reveal)$/)

    await page.locator('input[type=range]').fill('1500')
    await expect(page.getByRole('button', { name: /Start take \(1 weetjes\)/ })).toBeVisible()
    await page.getByRole('button', { name: /Start take/ }).click()
    await expect(page.getByText(/Take opgeslagen/)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Rapport laden' }).click()

    await expect(page.getByRole('heading', { name: /Rapport — 1\/1 ok/ })).toBeVisible()
    await expect(page.locator('.review-id')).toContainText('Dyslexie')
    await expect(page.locator('.review-sub')).toHaveText('slim-fact')

    await page.getByRole('button', { name: 'slim-fact afspelen' }).click()
    const played = await playedUrls(page)
    expect(played[0], 'a Weetjes clip lives in /audio/weetjes/, not /audio/words/').toContain('/audio/weetjes/slim-fact.mp3')
  })
})
