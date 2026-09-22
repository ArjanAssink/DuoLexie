import { test, expect, type CDPSession, type Page } from '@playwright/test'
import { installNarration } from './fixtures/narration'
import { installSpellingNarration } from './fixtures/spellingNarration'

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
const FLITSEN = '/#/les/fase1-a-e-o-u-i-l1'
const SPELLING = '/#/les/proef-spel-d-t'
const THUMB_ID = 0
const FINGER_ID = 1

/** The four touch phases CDP accepts; `string` here let a typo through to runtime. */
type TouchType = 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel'

async function touch(
  cdp: CDPSession,
  type: TouchType,
  points: { id: number; x: number; y: number }[],
) {
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

/**
 * Flitsen's carry (docs/flitsen-swipe.md §3.3) has the same guards, and the same failure
 * mode if it lost them: a card that the browser took away from her mid-carry must go back
 * onto the deck, not count as turned over.
 */
test('Flitsen: a cancelled carry past the midpoint puts the card back on the deck', async ({
  page,
  context,
}) => {
  await page.goto(FLITSEN)
  await expect(page.locator('.kk-arena')).toBeVisible()
  const deck = page.locator('.kk-stack-wrap').nth(0)
  const before = parseInt(await deck.locator('.kk-count').innerText(), 10)
  const d = (await deck.locator('.kk-stack').boundingBox())!
  const t = (await page.locator('.kk-stack-wrap').nth(1).locator('.kk-stack').boundingBox())!
  const cdp = await context.newCDPSession(page)

  await touch(cdp, 'touchStart', [{ id: THUMB_ID, x: d.x + d.width / 2, y: d.y + d.height / 2 }])
  await page.waitForTimeout(60)
  // most of the way to the other stack, well past the midpoint that would commit
  await touch(cdp, 'touchMove', [{ id: THUMB_ID, x: t.x + t.width / 2, y: t.y + t.height / 2 }])
  await page.waitForTimeout(60)
  await expect(page.locator('.kk-fly.kk-held')).toHaveCount(1)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await page.waitForTimeout(600)

  await expect(page.locator('.kk-fly')).toHaveCount(0)
  await expect(page.locator('.kk-stack-wrap').nth(1).locator('.kk-face-front')).toHaveCount(0)
  expect(parseInt(await deck.locator('.kk-count').innerText(), 10), 'nothing counted').toBe(before)
})

/**
 * Maak het woord af carries a *tile* rather than a card, and the pointer capture lives on
 * the tile row rather than on either tile (docs/maak-het-woord-af.md §3) — precisely
 * because a tile re-renders mid-drag. The guards are the same ones, and so is the failure
 * mode if it lost them: a second finger anywhere on the row would take the gesture over and
 * either finger lifting could drop a letter into the gap she never chose.
 */
test('Maak het woord af: a second finger cannot steal the tile', async ({ page, context }) => {
  await installSpellingNarration(page)
  await page.goto(SPELLING)
  await page.waitForFunction(
    () => document.querySelector('.spel-screen')?.getAttribute('data-beat') === 'choose',
    null,
    { timeout: 15_000 },
  )
  const word = await page.locator('.word-text').evaluate((el) => el.textContent ?? '')

  const left = (await page.locator('.spel-tile').nth(0).boundingBox())!
  const right = (await page.locator('.spel-tile').nth(1).boundingBox())!
  const cdp = await context.newCDPSession(page)

  const thumb = { x: left.x + left.width / 2, y: left.y + left.height / 2 }
  const finger = { x: right.x + right.width / 2, y: right.y + right.height / 2 }

  // Her thumb picks up the left tile and holds it, barely moving.
  await touch(cdp, 'touchStart', [{ id: THUMB_ID, ...thumb }])
  await page.waitForTimeout(80)
  await touch(cdp, 'touchMove', [{ id: THUMB_ID, x: thumb.x, y: thumb.y - 12 }])
  await page.waitForTimeout(80)

  // A second finger lands on the *other* tile and makes what would, on its own, be a
  // perfectly good commit: 200px straight up, then lifts. It must count for nothing —
  // this drag belongs to the thumb.
  await touch(cdp, 'touchStart', [
    { id: THUMB_ID, x: thumb.x, y: thumb.y - 12 },
    { id: FINGER_ID, ...finger },
  ])
  await page.waitForTimeout(60)
  await touch(cdp, 'touchMove', [
    { id: THUMB_ID, x: thumb.x, y: thumb.y - 12 },
    { id: FINGER_ID, x: finger.x, y: finger.y - 200 },
  ])
  await page.waitForTimeout(60)
  await touch(cdp, 'touchEnd', [{ id: FINGER_ID, x: finger.x, y: finger.y - 200 }])
  await page.waitForTimeout(400)

  expect(await page.locator('.pip-done').count(), 'the second finger grades nothing').toBe(0)

  // The thumb then lifts, still 12px from where it started: under the 24px a flick needs
  // and nowhere near the gap, so its own gesture commits nothing either.
  await touch(cdp, 'touchEnd', [{ id: THUMB_ID, x: thumb.x, y: thumb.y - 12 }])
  await page.waitForTimeout(900)

  expect(await page.locator('.pip-done').count(), 'nothing may be graded').toBe(0)
  expect(await page.getAttribute('.spel-screen', 'data-beat')).toBe('choose')
  expect(await page.locator('.word-text').evaluate((el) => el.textContent ?? '')).toBe(word)
  await expect(page.locator('.gap.filled')).toHaveCount(0)
})
