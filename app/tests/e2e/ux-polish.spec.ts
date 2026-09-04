import { test, expect } from '@playwright/test'

test('the leerpad draws a connecting road behind the lesson coins', async ({ page }) => {
  await page.goto('/')
  const track = page.locator('.path-track path').first()
  await expect(track).toBeVisible()

  // regression guard: the road is measured from real DOM positions and painted with
  // z-index:-1 — without a stacking context on .path-section that escapes to the root
  // and the road silently renders behind the whole page instead of just the coins.
  const d = await track.getAttribute('d')
  expect(d, 'path-track has no drawn coordinates').toBeTruthy()
  const commandCount = d!.split(/[MC]/).filter(Boolean).length
  expect(commandCount).toBeGreaterThanOrEqual(2)

  // the road must sit visually behind the coins, not on top of them
  const roadZIndex = await track.evaluate((el) => getComputedStyle(el.parentElement!).zIndex)
  expect(roadZIndex).toBe('-1')
})

test('respects prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const coin = page.locator('.coin-item').first()
  await expect(coin).toBeVisible()
  const animationName = await coin.evaluate((el) => getComputedStyle(el).animationName)
  expect(animationName).toBe('none')
})

test('the viewport is configured for iPhone safe areas', async ({ page }) => {
  await page.goto('/')
  const content = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(content).toContain('viewport-fit=cover')
})
