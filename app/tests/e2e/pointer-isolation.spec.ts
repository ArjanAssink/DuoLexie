import { test, expect, type CDPSession, type Page } from '@playwright/test'

/**
 * HardopLezen's swipe tracked no pointerId: onPointerDown had no "already
 * dragging" guard and onPointerMove/onPointerUp read a single shared
 * `startX`/`dragging` regardless of which pointer fired them. A second finger
 * merely resting on the card (a 9-year-old's palm) overwrote `startX`, and
 * either finger lifting could commit a grade neither gesture intended.
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

async function ready(page: Page) {
  const card = page.locator('.word-card')
  await expect(card).toBeVisible()
  return { card, word: await card.innerText() }
}

test('a second finger resting on the card cannot steal the drag', async ({ page, context }) => {
  await page.goto(LEZEN)
  const { card, word } = await ready(page)
  const box = (await card.boundingBox())!
  const y = box.y + box.height / 2
  const thumbX = box.x + box.width * 0.6
  const fingerX = box.x + box.width * 0.2
  const cdp = await context.newCDPSession(page)

  await touch(cdp, 'touchStart', [{ id: THUMB_ID, x: thumbX, y }])
  await page.waitForTimeout(80)
  // a second finger touches down elsewhere on the card, thumb still resting
  await touch(cdp, 'touchStart', [
    { id: THUMB_ID, x: thumbX, y },
    { id: FINGER_ID, x: fingerX, y },
  ])
  await page.waitForTimeout(80)
  // the thumb barely twitches — 15px, well under the 90px swipe threshold
  await touch(cdp, 'touchMove', [
    { id: THUMB_ID, x: thumbX + 15, y },
    { id: FINGER_ID, x: fingerX, y },
  ])
  await page.waitForTimeout(80)
  // the second finger lifts
  await touch(cdp, 'touchEnd', [{ id: THUMB_ID, x: thumbX + 15, y }])
  await page.waitForTimeout(900)

  expect(await card.innerText(), 'the twitch + unrelated touch must not grade the word').toBe(word)
})

test('a genuine single-finger swipe still commits normally', async ({ page, context }) => {
  await page.goto(LEZEN)
  const { card, word } = await ready(page)
  const box = (await card.boundingBox())!
  const y = box.y + box.height / 2
  const startX = box.x + box.width * 0.3
  const cdp = await context.newCDPSession(page)

  await touch(cdp, 'touchStart', [{ id: THUMB_ID, x: startX, y }])
  await page.waitForTimeout(60)
  await touch(cdp, 'touchMove', [{ id: THUMB_ID, x: startX + 200, y }])
  await page.waitForTimeout(60)
  await touch(cdp, 'touchEnd', [])
  await page.waitForTimeout(900)

  expect(await card.innerText().catch(() => null)).not.toBe(word)
})

test('a cancelled gesture past the swipe threshold resets instead of grading', async ({ page, context }) => {
  await page.goto(LEZEN)
  const { card, word } = await ready(page)
  const box = (await card.boundingBox())!
  const y = box.y + box.height / 2
  const startX = box.x + box.width * 0.3
  const cdp = await context.newCDPSession(page)

  await touch(cdp, 'touchStart', [{ id: THUMB_ID, x: startX, y }])
  await page.waitForTimeout(60)
  await touch(cdp, 'touchMove', [{ id: THUMB_ID, x: startX + 200, y }]) // past the threshold
  await page.waitForTimeout(60)
  // the browser cancels the gesture (edge back-swipe, scroll takeover, an incoming call)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await page.waitForTimeout(900)

  expect(await card.innerText(), 'a cancelled gesture must not grade the word').toBe(word)
  await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)') // drag reset, not left mid-swipe
})
