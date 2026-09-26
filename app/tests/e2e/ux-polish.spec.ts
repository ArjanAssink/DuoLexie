import { test, expect } from '@playwright/test'
import { skipOnboarding } from './fixtures/onboarded'

test('the leerpad draws a connecting road behind the lesson coins', async ({ page }) => {
  await skipOnboarding(page)
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
  await skipOnboarding(page)
  await page.goto('/')
  const coin = page.locator('.coin-item').first()
  await expect(coin).toBeVisible()
  const animationName = await coin.evaluate((el) => getComputedStyle(el).animationName)
  expect(animationName).toBe('none')
})

test('the viewport is configured for iPhone safe areas', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  const content = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(content).toContain('viewport-fit=cover')
})

test('the leerpad runs through the forest, one season per deel', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')
  await expect(page.locator('.coin-item').first()).toBeVisible()

  // four fases make a year, and the fifth starts a new one (docs/bospad.md §3.6)
  const seasons = await page.locator('main.bos > section').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-season')),
  )
  expect(seasons.length).toBeGreaterThan(4)
  const perFase = [...new Set(seasons)]
  expect(perFase.slice(0, 4)).toEqual(['lente', 'zomer', 'herfst', 'winter'])
  expect(seasons[seasons.length - 1]).toBeTruthy()

  // every unit has its scenery, and none of it can get in the way of a tap on a coin
  for (const section of await page.locator('.path-section').all()) {
    expect(await section.locator('.bos-sprite').count()).toBeGreaterThan(8)
  }
  const sprite = page.locator('.bos-sprite').first()
  expect(await sprite.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')

  // the path is three strokes of one curve, all drawn from the same measured points
  const strokes = page.locator('.path-section').first().locator('.path-track path')
  await expect(strokes).toHaveCount(3)
  const ds = await strokes.evaluateAll((els) => els.map((el) => el.getAttribute('d')))
  expect(new Set(ds).size).toBe(1)
})
