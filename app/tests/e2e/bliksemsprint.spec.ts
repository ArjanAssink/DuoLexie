import { test, expect } from '@playwright/test'

/**
 * The Tijdrit (speed drill) node of fase1's first unit — the only game that grades.
 * Unit ids are stable/sounds-derived, not positional (data/path.ts A3) — this is
 * "fase1" + the unit's sounds ("a-e-o-u-i") + "-l2", not the old fase1-u1-l2.
 */
const TIJDRIT = '/#/les/fase1-a-e-o-u-i-l2'

async function startRound(page: import('@playwright/test').Page) {
  await page.goto(TIJDRIT)
  await page.locator('.btn-primary').first().click() // Start! (60 sec)
  await expect(page.locator('.flash-card')).toBeVisible()
}

test('the streak celebration fires on the third correct in a row, not the second', async ({ page }) => {
  await startRound(page)
  const goed = page.locator('.btn-primary')

  await goed.click()
  await goed.click()
  await expect(page.locator('.bs')).toHaveCount(0)

  await goed.click()
  await expect(page.locator('.bs')).toHaveCount(1)
})

test('a wrong answer resets the streak', async ({ page }) => {
  await startRound(page)
  const goed = page.locator('.btn-primary')

  await goed.click()
  await goed.click()
  await page.locator('.btn-bad').click() // breaks it
  await goed.click()
  await goed.click()
  await expect(page.locator('.bs')).toHaveCount(0)

  await goed.click()
  await expect(page.locator('.bs')).toHaveCount(1)
})

test('the celebration never covers the flash card or the grade buttons', async ({ page }) => {
  await startRound(page)
  const goed = page.locator('.btn-primary')
  for (let i = 0; i < 3; i++) await goed.click()
  await expect(page.locator('.bs-band')).toBeVisible()

  // she is mid-item on a timed drill — obscuring the letter costs her the answer
  const clear = await page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
    const hits = (a: DOMRect, b: DOMRect) =>
      !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
    const band = box('.bs-band')
    return {
      overCard: hits(band, box('.flash-card')),
      overButtons: hits(band, box('.grade-buttons')),
      passesClicks: getComputedStyle(document.querySelector('.bs')!).pointerEvents,
    }
  })

  expect(clear.overCard, 'celebration overlaps the flash card').toBe(false)
  expect(clear.overButtons, 'celebration overlaps the grade buttons').toBe(false)
  expect(clear.passesClicks).toBe('none')
})

test('the celebration unmounts itself when it finishes', async ({ page }) => {
  await startRound(page)
  const goed = page.locator('.btn-primary')
  for (let i = 0; i < 3; i++) await goed.click()
  await expect(page.locator('.bs')).toHaveCount(1)

  // TOTAL_MS is 2000 in Bliksemsprint.tsx; give it a little slack
  await expect(page.locator('.bs')).toHaveCount(0, { timeout: 4000 })
})
