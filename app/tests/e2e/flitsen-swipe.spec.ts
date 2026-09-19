import { test, expect, type Page } from '@playwright/test'

/**
 * Carrying a Flitsen card from the deck to the discard pile by hand (docs/flitsen-swipe.md).
 * The tap is covered by path-to-lesson.spec.ts and quit-mid-animation.spec.ts; this file is
 * about the drag: the card follows the finger, lands when let go past the midpoint, slides
 * back when let go short — and a tap afterwards still flips exactly one card.
 *
 * l1 of the first unit is Flitsen (data/path.ts); a deep link never redirects to the
 * welkom-flow, so no onboarding seed is needed.
 */
const FLITSEN = '/#/les/fase1-a-e-o-u-i-l1'

/** Mirrors LAND_MS / RETURN_MS in src/games/Flitsen.tsx, with slack for the timer. */
const SETTLE_MS = 320 + 150

async function deckCount(page: Page): Promise<number> {
  return parseInt(await page.locator('.kk-stack-wrap').first().locator('.kk-count').innerText(), 10)
}

/** Centre of an element, in page coordinates. */
async function centre(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The translation part of an element's transform — where a drag has put it. */
async function translation(page: Page, selector: string): Promise<{ x: number; y: number }> {
  return page.locator(selector).evaluate((el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return { x: m.m41, y: m.m42 }
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto(FLITSEN)
  await expect(page.locator('.kk-arena')).toBeVisible()
})

test('carrying a card to the other stack lands it there', async ({ page }) => {
  const before = await deckCount(page)
  const from = await centre(page, '.kk-stack-wrap >> nth=0 >> .kk-stack')
  const to = await centre(page, '.kk-stack-wrap >> nth=1 >> .kk-stack')

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()

  const discard = page.locator('.kk-stack-wrap').nth(1).locator('.kk-face-front')
  await expect(discard).toBeVisible()
  await expect(discard.locator('.kk-sound')).not.toBeEmpty()
  expect(await deckCount(page)).toBe(before - 1)
  await page.waitForTimeout(SETTLE_MS)
  await expect(page.locator('.kk-fly')).toHaveCount(0)
})

test('the card sticks to the finger while it is carried', async ({ page }) => {
  const before = await deckCount(page)
  const from = await centre(page, '.kk-stack-wrap >> nth=0 >> .kk-stack')
  const to = await centre(page, '.kk-stack-wrap >> nth=1 >> .kk-stack')

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // a slow, wandering carry: right and a little down, then a little up
  await page.mouse.move(from.x + 60, from.y + 20, { steps: 6 })
  await page.waitForTimeout(80)

  const held = page.locator('.kk-fly.kk-held')
  await expect(held).toHaveCount(1)
  let t = await translation(page, '.kk-fly.kk-held')
  expect(Math.abs(t.x - 60), 'held card x follows the pointer').toBeLessThan(2)
  expect(Math.abs(t.y - 20), 'held card y follows the pointer').toBeLessThan(2)
  // the card is off the deck, so the deck shows one fewer while it is in her hand
  expect(await deckCount(page)).toBe(before - 1)

  await page.mouse.move(from.x + 100, from.y - 30, { steps: 6 })
  await page.waitForTimeout(80)
  t = await translation(page, '.kk-fly.kk-held')
  expect(Math.abs(t.x - 100)).toBeLessThan(2)
  expect(Math.abs(t.y + 30)).toBeLessThan(2)

  // and it still lands when carried the rest of the way, so the round is left consistent
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('.kk-stack-wrap').nth(1).locator('.kk-face-front')).toBeVisible()
  expect(await deckCount(page)).toBe(before - 1)
})

test('a short carry slides back onto the deck, and the next tap still flips one card', async ({ page }) => {
  const before = await deckCount(page)
  const from = await centre(page, '.kk-stack-wrap >> nth=0 >> .kk-stack')

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // 20px: past the lift slop, short of half the gap, and under FLICK_MIN_PX so the speed
  // of a scripted move cannot turn it into a toss
  await page.mouse.move(from.x + 20, from.y, { steps: 4 })
  await page.waitForTimeout(80)
  await expect(page.locator('.kk-fly.kk-held')).toHaveCount(1)
  await page.mouse.up()

  await page.waitForTimeout(SETTLE_MS)
  await expect(page.locator('.kk-fly')).toHaveCount(0)
  await expect(page.locator('.kk-stack-wrap').nth(1).locator('.kk-face-front')).toHaveCount(0)
  expect(await deckCount(page), 'nothing was counted').toBe(before)

  // The click that follows a drag's pointerup is swallowed; a real tap afterwards is not.
  await page.locator('.kk-face-back').first().click()
  await expect(page.locator('.kk-stack-wrap').nth(1).locator('.kk-face-front')).toBeVisible()
  await page.waitForTimeout(SETTLE_MS)
  expect(await deckCount(page), 'exactly one card flipped').toBe(before - 1)
  await expect(page.locator('.kk-fly')).toHaveCount(0)
})

test('a flick towards the other stack lands the card before it gets there', async ({ page }) => {
  const before = await deckCount(page)
  const from = await centre(page, '.kk-stack-wrap >> nth=0 >> .kk-stack')

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // 40px in one quick step: nowhere near the midpoint, plainly a toss
  await page.mouse.move(from.x + 40, from.y, { steps: 2 })
  await page.mouse.up()

  await expect(page.locator('.kk-stack-wrap').nth(1).locator('.kk-face-front')).toBeVisible()
  expect(await deckCount(page)).toBe(before - 1)
})
