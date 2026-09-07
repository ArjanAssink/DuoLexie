import { test, expect } from '@playwright/test'

// Unit ids are stable/sounds-derived, not positional (data/path.ts A3) — this unit's
// sounds are m/s/k/r/t, so its id is "fase1-m-s-k-r-t", not the old fase1-u2.
const LEZEN = '/#/les/fase1-m-s-k-r-t-l5'

/**
 * Patches speechSynthesis.speak so the test can see what got said. Wrapped in try/catch and
 * reports back whether it actually took: headless WebKit in CI has no functional TTS backend
 * (confirmed via a downloaded Playwright report — `.read-timer.spent` toggles correctly, so
 * the reading-window *timing* is right, but `__spoke` stays empty because there's nothing to
 * intercept), so `__speechHooked` lets the test skip only the assertion that genuinely
 * depends on a working speechSynthesis, not the behaviour under test.
 */
async function interceptSpeech(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoke: string[]; __speechHooked: boolean }
    w.__spoke = []
    w.__speechHooked = false
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      const orig = synth.speak.bind(synth)
      synth.speak = (u: SpeechSynthesisUtterance) => {
        w.__spoke.push(u.text)
        return orig(u)
      }
      w.__speechHooked = true
    } catch {
      // some engines don't expose a patchable speechSynthesis at all — nothing to do
    }
  })
}

test('the word is not pronounced until the reading window runs out', async ({ page }) => {
  // TEMP diagnostic (see reading-window investigation in git history): capture what's
  // actually going wrong in CI's WebKit instead of guessing again — remove once resolved.
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`console.error: ${m.text()}`)
  })

  await interceptSpeech(page)
  await page.goto(LEZEN)
  await expect(page.locator('.word-card')).toBeVisible()

  // the old behaviour spoke at 450ms — nothing may be said this early
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { __spoke: string[] }).__spoke)).toEqual([])
  await expect(page.locator('.read-timer.spent')).toHaveCount(0)

  // ...and it must speak once the window (5s) is up — this is the real behaviour under
  // test, verified via the CSS class alone, independent of whether speech is observable
  await expect(page.locator('.read-timer.spent')).toHaveCount(1, { timeout: 6000 })

  const diag = await page.evaluate(() => {
    const w = window as unknown as { __speechHooked: boolean; __spoke: string[] }
    let voicesError: string | null = null
    let voiceCount = -1
    let utteranceError: string | null = null
    try {
      voiceCount = window.speechSynthesis?.getVoices().length ?? -1
    } catch (e) {
      voicesError = String(e)
    }
    try {
      new SpeechSynthesisUtterance('test')
    } catch (e) {
      utteranceError = String(e)
    }
    return { hooked: w.__speechHooked, spoken: w.__spoke, voiceCount, voicesError, utteranceError }
  })
  console.log('reading-window diagnostic:', JSON.stringify({ ...diag, pageErrors }))

  test.skip(!diag.hooked, 'speechSynthesis is not patchable here — reading-window timing already verified above')
  expect(diag.spoken.length).toBe(1)
})

test('swiping inside the window cancels the pronunciation', async ({ page }) => {
  await interceptSpeech(page)
  await page.goto(LEZEN)
  const card = page.locator('.word-card')
  await expect(card).toBeVisible()

  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()

  // past where the window would have fired for the card she just answered
  await page.waitForTimeout(5200)
  const spoken = await page.evaluate(() => (window as unknown as { __spoke: string[] }).__spoke)
  expect(spoken, 'a swiped-away word must not be read aloud').not.toContain('mat')
})
