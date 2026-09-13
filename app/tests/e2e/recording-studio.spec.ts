import { test, expect, type Page } from '@playwright/test'

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
  const ids = await page.locator('.studio-cell-id').allTextContents()
  expect(ids.length).toBeGreaterThan(keep)
  const missing = ids.slice(0, keep)

  await page.route('**/audio/words/*.mp3', (route) => {
    const id = decodeURIComponent(route.request().url().split('/').pop()!.replace(/\.mp3.*$/, ''))
    route.fulfill(
      missing.includes(id)
        ? { status: 404, body: '' }
        : { status: 200, contentType: 'audio/mpeg', body: Buffer.from([0]) },
    )
  })
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

test.describe('recording studio: one continuous take', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone'])
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
    await page.getByRole('button', { name: /opnieuw opnemen/ }).click()

    // back on the setup screen, with the next take narrowed to exactly those two
    await expect(page.getByText('Opnieuw opnemen:')).toBeVisible()
    await expect(page.locator('.studio-retake b')).toHaveText('bal · tas')
    await expect(page.getByRole('button', { name: /Start take \(2 woorden\)/ })).toBeVisible()
  })
})
