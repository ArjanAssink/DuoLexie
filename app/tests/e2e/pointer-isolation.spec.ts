import { test, expect, type CDPSession, type Page } from '@playwright/test'
import { installNarration } from './fixtures/narration'

/**
 * HardopLezen's swipe tracked no pointerId: onPointerDown had no "already
 * dragging" guard and onPointerMove/onPointerUp read a single shared
 * start point and `dragging` regardless of which pointer fired them. A second
 * finger merely resting on the card (a 9-year-old's palm) overwrote the gesture's
 * origin, and either finger lifting could commit a grade neither gesture intended.
 *
 * A plain `dispatchEvent(new PointerEvent(...))` can't reproduce this: Chromium
 * validates `setPointerCapture` against its real active-pointer table and
 * throws "No active pointer with the given id" for a synthetic id that was
 * never established by real input. CDP's Input.dispatchTouchEvent registers
 * genuine pointers, so these tests use that instead of page.mouse/touchscreen
 * (which only drive one pointer at a time).
 */

const LEZEN = '/#/les/fase1-m-s-k-r-t-l5'
const THUMB_ID = 0
const FINGER_ID = 1

async function touch(cdp: CDPSession, type: string, points: { id: number; x: number; y: number }[]) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 20, radiusY: 20 })),
  })
}

/**
 * Gets a card all the way to the phase where it can actually be dragged: the card is inert
 * until she has heard the word (docs/hardop-lezen-rework.md §2), so a drag test that starts
 * from a freshly dealt card would pass no matter how broken the pointer handling was.
 */
async function ready(page: Page) {
  const card = page.locator('.word-card')
  await expect(card).toBeVisible()
  await page.locator('.reveal-btn').click()
  await page.waitForFunction(
    () => document.querySelector('.hardop-screen')?.getAttribute('data-phase') === 'judging',
    null,
    { timeout: 6000 },
  )
  return { card, word: await page.locator('.word-text').innerText() }
}

/** Vertical translation of the card, in px — the axis a drag moves it on. */
async function translateY(page: Page): Promise<number> {
  return page.locator('.word-card').evaluate((el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return m.m42
  })
}

/** Cards graded so far. Zero means nothing was committed, whatever the card is showing. */
function graded(page: Page): Promise<number> {
  return page.locator('.pip-done').count()
}

test.beforeEach(async ({ page }) => {
  await installNarration(page)
})

test('a second finger resting on the card cannot steal the drag', async ({ page, context }) => {
  await page.goto(LEZEN)
  const { card, word } = await ready(page)
  const box = (await card.boundingBox())!
  const x = box.x + box.width / 2
  const thumbY = box.y + box.height * 0.6
  const fingerY = box.y + box.height * 0.2
  const cdp = await context.newCDPSession(page)

  await touch(cdp, 'touchStart', [{ id: THUMB_ID, x, y: thumbY }])
  await page.waitForTimeout(80)
  // a second finger touches down elsewhere on the card, thumb still resting
  await touch(cdp, 'touchStart', [
    { id: THUMB_ID, x, y: thumbY },
    { id: FINGER_ID, x, y: fingerY },
  ])
  await page.waitForTimeout(80)
  // The thumb barely twitches — 15px, under the 80px swipe distance and under the 24px a
  // flick needs before it counts as one, so neither route to a verdict is open.
  await touch(cdp, 'touchMove', [
    { id: THUMB_ID, x, y: thumbY + 15 },
    { id: FINGER_ID, x, y: fingerY },
  ])
  await page.waitForTimeout(80)
  // the second finger lifts
  await touch(cdp, 'touchEnd', [{ id: THUMB_ID, x, y: thumbY + 15 }])
  await page.waitForTimeout(900)

  expect(await graded(page), 'the twitch + unrelated touch must not grade the word').toBe(0)
  expect(await page.locator('.word-text').innerText()).toBe(word)
})

test('a genuine single-finger swipe still commits normally', async ({ page, context }) => {
  await page.goto(LEZEN)
  const { card } = await ready(page)
  const box = (await card.boundingBox())!
  const x = box.x + box.width / 2
  const startY = box.y + box.height * 0.7
  const cdp = await context.newCDPSession(page)

  await touch(cdp, 'touchStart', [{ id: THUMB_ID, x, y: startY }])
  await page.waitForTimeout(60)
  await touch(cdp, 'touchMove', [{ id: THUMB_ID, x, y: startY - 200 }])
  await page.waitForTimeout(60)
  await touch(cdp, 'touchEnd', [])

  await expect.poll(() => graded(page), { timeout: 4000 }).toBe(1)
})

test('a cancelled gesture past the swipe threshold resets instead of grading', async ({ page, context }) => {
  await page.goto(LEZEN)
  const { card, word } = await ready(page)
  const box = (await card.boundingBox())!
  const x = box.x + box.width / 2
  const startY = box.y + box.height * 0.7
  const cdp = await context.newCDPSession(page)

  await touch(cdp, 'touchStart', [{ id: THUMB_ID, x, y: startY }])
  await page.waitForTimeout(60)
  await touch(cdp, 'touchMove', [{ id: THUMB_ID, x, y: startY - 200 }]) // past the threshold
  await page.waitForTimeout(60)
  // the browser cancels the gesture (edge back-swipe, scroll takeover, an incoming call)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await page.waitForTimeout(900)

  expect(await graded(page), 'a cancelled gesture must not grade the word').toBe(0)
  expect(await page.locator('.word-text').innerText()).toBe(word)
  // The drag is reset, not left holding the card 200px off-centre. Checked as a tolerance
  // rather than an exact identity matrix: an ungrabbed card in this phase runs a slow ±3px
  // idle drift — now on the same axis the drag uses, which is why this reads it at rest,
  // after the 900ms above, rather than straight off the cancel.
  expect(Math.abs(await translateY(page))).toBeLessThan(5)
})
