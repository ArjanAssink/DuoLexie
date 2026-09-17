import { test, expect } from '@playwright/test'
import { HOT_WAV, fakeMicArgs } from './fixtures/fakeMic'

/**
 * §2.2, test 8: the level meter and the clip counter during a take.
 *
 * Its own spec file because Playwright only takes `launchOptions` at the top level of one,
 * and this one needs a microphone that is genuinely too hot — a 220Hz tone at very nearly
 * full scale, which is what a gain set far too high sounds like to an analyser.
 *
 * Until now a clipped word surfaced at split time, after three minutes of reading, and the
 * whole take went again. Nothing about it is subtle while it happens; it just had nowhere to
 * show.
 */
test.use({ launchOptions: { args: fakeMicArgs(HOT_WAV) } })

interface Cue { id: string; retake?: true }
interface Written { name: string; text?: string }

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['microphone'])
  // the dev server really does serve /__studio here, and a studio that finds it uploads takes
  // into recordings/ for real
  await page.route('**/__studio/**', (route) => route.fulfill({ status: 404, body: 'off' }))
  await page.addInitScript(() => {
    const w = window as unknown as { __writes: Written[]; showDirectoryPicker: unknown }
    w.__writes = []
    w.showDirectoryPicker = async () => ({
      name: 'recordings',
      async getFileHandle(name: string) {
        return {
          async createWritable() {
            return {
              async write(data: Blob | string) {
                if (typeof data === 'string') w.__writes.push({ name, text: data })
              },
              async close() {},
            }
          },
        }
      },
    })
  })
})

test('a clipped word is counted, named, and sent back for a retake', async ({ page }) => {
  test.slow() // a take runs in real wall clock and cannot be hurried

  await page.goto('/#/opnemen')
  await expect(page.locator('.studio-cell-id').first()).toBeVisible()
  const ids = await page.locator('.studio-cell-id').allTextContents()
  await page.waitForTimeout(150)

  // the setup meter should already be saying so, before a take is even started (§2.3)
  await expect(page.locator('.studio-level-verdict')).toHaveText(/oversturing/)

  // three words, so the take is nine seconds rather than fifty
  const served: Record<string, string> = {}
  for (const id of ids.slice(3)) served[id] = 'Mon, 14 Sep 2026 09:00:00 GMT'
  await page.route('**/audio/words/*.mp3*', (route) => {
    const id = decodeURIComponent(route.request().url().split('/').pop()!.replace(/\.mp3.*$/, ''))
    route.fulfill(served[id]
      ? { status: 200, contentType: 'audio/mpeg', headers: { 'last-modified': served[id] }, body: Buffer.from([0]) }
      : { status: 200, contentType: 'text/html', body: '<!doctype html>' })
  })
  await page.reload()
  // the probe pass fills the counts in as it goes; starting before it lands would record all
  // twenty words instead of three
  await expect(page.getByText(`alleen ontbrekende (3 van ${ids.length})`)).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /Kies map/ }).click()
  await page.locator('input[type=range]').fill('1500')
  await page.getByRole('button', { name: /Start take/ }).click()

  // the counter names the word it happened on, which is the thing worth knowing afterwards
  await expect(page.locator('.tp-meter-clip')).toContainText(/oversturing/, { timeout: 15_000 })
  await expect(page.locator('.tp-meter-clip')).toContainText(ids[0])
  // …and the word marks itself for a retake, exactly as it would have if Space had been
  // pressed. The red word itself is checked through the retake counter rather than through
  // `.tp-word-flagged`: that class belongs to the word currently on screen and is cleared
  // when the next one arrives, so asserting on it is a race against the pace.
  await expect(page.locator('.tp-pending')).toContainText(/opnieuw/)

  await expect(page.getByText(/Take opgeslagen/)).toBeVisible({ timeout: 40_000 })
  const writes = await page.evaluate(() => (window as unknown as { __writes: Written[] }).__writes)
  const sheet = JSON.parse(writes.find((w) => w.name.endsWith('.json'))!.text!) as { cues: Cue[] }

  const flagged = sheet.cues.filter((c) => c.retake).map((c) => c.id)
  expect(flagged, 'every clipped word is marked for a retake').toEqual(ids.slice(0, 3))

  // Once per word, though. A microphone this hot clips the retakes too, and a queue that
  // re-flags what it re-prompts is a take that never ends — where a person pressing Space
  // eventually stops, this would not.
  expect(sheet.cues.map((c) => c.id)).toEqual([...ids.slice(0, 3), ...ids.slice(0, 3)])
  expect(sheet.cues.slice(3).every((c) => c.retake === undefined)).toBe(true)
})
