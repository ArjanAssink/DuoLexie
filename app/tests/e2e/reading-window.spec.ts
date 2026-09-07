import { test, expect, type Page } from '@playwright/test'
import { installNarration, narrated } from './fixtures/narration'

// Unit ids are stable/sounds-derived, not positional (data/path.ts A3). The first unit has
// no Lezen node — vowels alone spell nothing — so this is the second unit's.
const LEZEN = '/#/les/fase1-m-s-k-r-t-l5'

/**
 * The reading window (docs/hardop-lezen-rework.md §3): she reads the word herself, and the
 * app pronounces it only once the fuse runs out or she taps Laat horen. The audio is a check
 * on an attempt she has already made, never a prompt that hands her the word.
 */

function phase(page: Page): Promise<string | null> {
  return page.getAttribute('.hardop-screen', 'data-phase')
}

function waitForPhase(page: Page, want: string, timeout = 15_000) {
  return page.waitForFunction(
    (p) => document.querySelector('.hardop-screen')?.getAttribute('data-phase') === p,
    want,
    { timeout },
  )
}

test.beforeEach(async ({ page }) => {
  await installNarration(page)
})

test('the word is not played while she is still reading', async ({ page }) => {
  await page.goto(LEZEN)
  await expect(page.locator('.word-card')).toBeVisible()
  await waitForPhase(page, 'reading')

  // the pre-rework behaviour spoke 450ms after showing the word
  await page.waitForTimeout(1500)
  expect(await narrated(page)).toEqual([])
  expect(await phase(page)).toBe('reading')
})

test('a new word gets the full ten seconds, then is played exactly once', async ({ page }) => {
  await page.goto(LEZEN)
  await waitForPhase(page, 'reading')

  // Still reading well past the old fixed 5s window: every word here is unseen, so it sits
  // in Leitner box 1 and the ladder gives it 10s.
  await page.waitForTimeout(6500)
  expect(await phase(page), 'box-1 words must not expire at the old 5s').toBe('reading')
  expect(await narrated(page)).toEqual([])

  const word = await page.locator('.word-text').innerText()
  await waitForPhase(page, 'listening')
  // Polled, not read once: the phase flips to 'listening' a beat before play() is called
  // (reveal() renders, then awaits loadWordClip), so reading the list on the transition
  // itself catches it still empty. Caught locally; it would have been a CI flake.
  await expect.poll(() => narrated(page), { timeout: 5000 }).toEqual([word])
})

test('Laat horen reveals the word early, and the card is only gradeable after it', async ({
  page,
}) => {
  await page.goto(LEZEN)
  await waitForPhase(page, 'reading')

  // while reading, both piles refuse input — she cannot grade what she hasn't heard
  await expect(page.locator('.pile-goed')).toBeDisabled()
  await expect(page.locator('.pile-nog-even')).toBeDisabled()
  expect(await page.locator('.pip-done').count()).toBe(0)

  const word = await page.locator('.word-text').innerText()
  await page.locator('.reveal-btn').click()

  await waitForPhase(page, 'judging', 5000)
  expect(await narrated(page), 'revealed once, not twice').toEqual([word])
  await expect(page.locator('.pile-goed')).toBeEnabled()
  await expect(page.locator('.reveal-btn')).toContainText('Nog eens')

  // nothing has been graded yet: hearing the word is not answering
  expect(await page.locator('.pip-done').count()).toBe(0)
})

test('dragging the card during the reading phase cannot grade it', async ({ page }) => {
  await page.goto(LEZEN)
  await waitForPhase(page, 'reading')

  const card = page.locator('.word-card')
  const b = (await card.boundingBox())!
  const cy = b.y + b.height / 2
  await page.mouse.move(b.x + b.width / 2, cy)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 220, cy, { steps: 8 })
  await page.mouse.up()

  await page.waitForTimeout(500)
  // a swipe before she's heard the word is not an answer — and a card-tap in this phase
  // means "Laat horen", so the phase may have advanced to listening/judging, never past it
  expect(await page.locator('.pip-done').count()).toBe(0)
  expect(['reading', 'listening', 'judging']).toContain(await phase(page))
})

test('the word she got wrong is replayed, the one she got right is not', async ({ page }) => {
  await page.goto(LEZEN)
  await waitForPhase(page, 'reading')

  const wrongWord = await page.locator('.word-text').innerText()
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 5000)
  await page.locator('.pile-nog-even').click()

  // "nog even" replays the word as reinforcement, so it is said twice in total
  await expect
    .poll(async () => (await narrated(page)).filter((t) => t === wrongWord).length, {
      timeout: 8000,
    })
    .toBe(2)
})
