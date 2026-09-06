import { test, expect } from '@playwright/test'

const LEZEN = '/#/les/fase1-u2-l5'

test('the word is not pronounced until the reading window runs out', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __spoke: string[] }).__spoke = []
    const synth = window.speechSynthesis
    if (!synth) return
    const orig = synth.speak.bind(synth)
    synth.speak = (u: SpeechSynthesisUtterance) => {
      ;(window as unknown as { __spoke: string[] }).__spoke.push(u.text)
      return orig(u)
    }
  })
  await page.goto(LEZEN)
  await expect(page.locator('.word-card')).toBeVisible()

  // the old behaviour spoke at 450ms — nothing may be said this early
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { __spoke: string[] }).__spoke)).toEqual([])
  await expect(page.locator('.read-timer.spent')).toHaveCount(0)

  // ...and it must speak once the window (5s) is up
  await expect(page.locator('.read-timer.spent')).toHaveCount(1, { timeout: 6000 })
  const spoken = await page.evaluate(() => (window as unknown as { __spoke: string[] }).__spoke)
  expect(spoken.length).toBe(1)
})

test('swiping inside the window cancels the pronunciation', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __spoke: string[] }).__spoke = []
    const synth = window.speechSynthesis
    if (!synth) return
    const orig = synth.speak.bind(synth)
    synth.speak = (u: SpeechSynthesisUtterance) => {
      ;(window as unknown as { __spoke: string[] }).__spoke.push(u.text)
      return orig(u)
    }
  })
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
