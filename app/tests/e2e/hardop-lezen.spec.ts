import { test, expect, type Page } from '@playwright/test'
import { installNarration } from './fixtures/narration'

/**
 * A full Hardop lezen round: ten different words, each read → heard → sorted onto a pile,
 * ending on a reward screen whose numbers match what she actually did
 * (docs/hardop-lezen-rework.md).
 *
 * The Proefronde is used rather than a path node: it draws on all of fase 1, so a round is
 * always ten distinct words regardless of her progress, and it is the same entry Arjan
 * launches from /#/proberen to try the game with her.
 */
const PROEFRONDE = '/#/les/proef-hardop-lezen'

function waitForPhase(page: Page, want: string, timeout = 15_000) {
  return page.waitForFunction(
    (p) => document.querySelector('.hardop-screen')?.getAttribute('data-phase') === p,
    want,
    { timeout },
  )
}

/** Reveal the current word, then sort it. Returns the word that was on the card. */
async function playCard(page: Page, verdict: 'goed' | 'nogEven'): Promise<string> {
  await waitForPhase(page, 'reading')
  const word = await page.locator('.word-text').innerText()
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)
  await page.locator(verdict === 'goed' ? '.pile-goed' : '.pile-nog-even').click()
  return word
}

async function pileCount(page: Page, pile: 'goed' | 'nogEven'): Promise<number> {
  const badge = page.locator(`${pile === 'goed' ? '.pile-goed' : '.pile-nog-even'} .pile-count`)
  return (await badge.count()) === 0 ? 0 : parseInt(await badge.innerText(), 10)
}

test.beforeEach(async ({ page }) => {
  await installNarration(page)
})

test('a round is ten different words', async ({ page }) => {
  test.setTimeout(120_000) // ten cards, each with a deal-in, a clip and a flight to the pile
  await page.goto(PROEFRONDE)
  await expect(page.locator('.word-card')).toBeVisible()
  await expect(page.locator('.pip')).toHaveCount(10)

  const seen: string[] = []
  for (let i = 0; i < 10; i++) {
    // Verdicts alternate rather than all being "goed". A ten-card correct round fires ten
    // confetti bursts and the biggest closing burst, and it was the heaviest test in the
    // suite — on CI's iphone profile the page died partway through it. Alternating keeps
    // the round honest (this test is about which words come up) and much lighter.
    seen.push(await playCard(page, i % 2 === 0 ? 'goed' : 'nogEven'))
    // One pip check, not ten: polling a locator count after every card added seconds per
    // card to no end, since distinctness is what this test is about.
    if (i === 4) {
      await expect.poll(() => page.locator('.pip-done').count(), { timeout: 10_000 }).toBe(5)
    }
  }
  // the tenth card ends the round, so the pips go with it — the reward screen is what
  // "all ten done" looks like from here
  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 15_000 })
  expect(new Set(seen).size, `no word may repeat in a round: ${seen.join(', ')}`).toBe(10)
})

test('cards stack on the pile she chose, and the reward screen counts both piles', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto(PROEFRONDE)
  await expect(page.locator('.word-card')).toBeVisible()

  // 7 goed, 3 nog even
  const verdicts: ('goed' | 'nogEven')[] = [
    'goed', 'goed', 'nogEven', 'goed', 'goed', 'goed', 'nogEven', 'goed', 'goed', 'nogEven',
  ]
  const missed: string[] = []
  for (const verdict of verdicts) {
    const word = await playCard(page, verdict)
    if (verdict === 'nogEven') missed.push(word)
    // no fixed wait: playCard's own wait for the next card's reading phase is the real
    // synchronisation, and padding every card pushed this past the default test timeout
  }

  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.reward-tally')).toContainText('7 goed')
  await expect(page.locator('.reward-tally')).toContainText('3 nog even')

  // the words she missed are listed so she and a parent can see what to practise
  const chips = await page.locator('.word-chip').allInnerTexts()
  expect(chips.map((c) => c.replace('🔊', '').trim()).sort()).toEqual([...missed].sort())

  // Gems: 5 for finishing + 1 per correct word, counted up one at a time. The generous
  // timeout is deliberate — this polls a running animation, and CI caught the count-up
  // still sitting at "+6" after 5s on the ipad profile, where the 90ms interval driving it
  // clearly does not run at 90ms. The number it settles on is what matters, not the pace.
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+12')
})

test('a round she gets entirely wrong still pays for finishing', async ({ page }) => {
  test.setTimeout(120_000) // every card replays the word before the next one deals in
  await page.goto(PROEFRONDE)
  await expect(page.locator('.word-card')).toBeVisible()

  for (let i = 0; i < 10; i++) {
    await playCard(page, 'nogEven')
  }

  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.reward-tally')).toContainText('0 goed')
  // never zero, and never a failure message
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+5')
  await expect(page.locator('.reward-screen h1')).not.toContainText('Perfect')
})

test('swiping the card up sorts it, the same as tapping a pile', async ({ page }) => {
  await page.goto(PROEFRONDE)
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  const card = page.locator('.word-card')
  const b = (await card.boundingBox())!
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  // far enough for the stamp to show, still short of the 80px commit threshold
  await page.mouse.move(cx, cy - 60, { steps: 4 })
  expect(
    Number(await page.locator('.swipe-stamp-goed').evaluate((el) => getComputedStyle(el).opacity)),
    'the GOED! stamp fades in as she drags toward it',
  ).toBeGreaterThan(0.4)
  await page.mouse.move(cx, cy - 200, { steps: 6 })
  await page.mouse.up()

  await expect.poll(() => pileCount(page, 'goed'), { timeout: 4000 }).toBe(1)
  expect(await pileCount(page, 'nogEven')).toBe(0)
})

test('a short, hesitant drag springs back instead of grading', async ({ page }) => {
  await page.goto(PROEFRONDE)
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  const card = page.locator('.word-card')
  const b = (await card.boundingBox())!
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  // Under the 80px threshold *and* slow, which takes both routes to a verdict away. The
  // pauses are the point: page.mouse.move() fires its steps back to back, and 40px covered
  // in a couple of milliseconds is a flick by any measure — games/swipe.ts would commit it,
  // rightly. A finger that moves 40px over a third of a second is the hesitation this test
  // is actually about.
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(cx, cy - i * 10)
    await page.waitForTimeout(80)
  }
  await page.mouse.up()

  await page.waitForTimeout(600)
  expect(await pileCount(page, 'goed')).toBe(0)
  expect(await pileCount(page, 'nogEven')).toBe(0)
  expect(await page.locator('.pip-done').count()).toBe(0)
})

test('a sideways drag never lands on a pile, however far it goes', async ({ page }) => {
  await page.goto(PROEFRONDE)
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  const card = page.locator('.word-card')
  const b = (await card.boundingBox())!
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  // a sloppy diagonal, mostly sideways: it must spring back rather than be rounded onto
  // whichever pile happens to be nearer
  await page.mouse.move(cx + 240, cy - 120, { steps: 8 })
  await page.mouse.up()

  await page.waitForTimeout(600)
  expect(await page.locator('.pip-done').count()).toBe(0)
})

test('the arrow keys sort a card, for building and reviewing on a desktop', async ({ page }) => {
  await page.goto(PROEFRONDE)
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  await page.keyboard.press('ArrowDown')
  await expect.poll(() => pileCount(page, 'nogEven'), { timeout: 4000 }).toBe(1)
})

/**
 * The teaching layers (docs/hardop-lezen-swipe-v2.md §4). A fresh Playwright context is a
 * fresh profile, so `settings.selfSwipes` starts at 0 in every one of these and she counts
 * as still learning the gesture.
 */

/** Card translation in px — negative is up, towards the Goed! pocket. */
function translateY(page: Page): Promise<number> {
  return page.locator('.word-card').evaluate((el) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return m.m42
  })
}

test('tapping a pile performs the swipe before the card lands, in both directions', async ({
  page,
}) => {
  await page.goto(PROEFRONDE)
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  // up: the card travels towards the pocket with a finger-shaped dot on it
  await page.locator('.pile-goed').click()
  await expect(page.locator('.touch-dot')).toBeVisible()
  await expect.poll(() => translateY(page), { timeout: 2000 }).toBeLessThan(-20)
  await expect.poll(() => pileCount(page, 'goed'), { timeout: 5000 }).toBe(1)

  // down: the same, the other way, onto the tray
  await waitForPhase(page, 'reading', 10_000)
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)
  await page.locator('.pile-nog-even').click()
  await expect(page.locator('.touch-dot')).toBeVisible()
  await expect.poll(() => translateY(page), { timeout: 2000 }).toBeGreaterThan(20)
  await expect.poll(() => pileCount(page, 'nogEven'), { timeout: 8000 }).toBe(1)
})

test('five swipes she makes herself switch the teaching off', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(PROEFRONDE)

  for (let i = 0; i < 5; i++) {
    await waitForPhase(page, 'reading', 12_000)
    await page.locator('.reveal-btn').click()
    await waitForPhase(page, 'judging', 6000)
    const b = (await page.locator('.word-card').boundingBox())!
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 200, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => page.locator('.pip-done').count(), { timeout: 6000 }).toBe(i + 1)
  }

  // The sixth card: she has swiped five, so nothing is trying to teach her any more.
  await waitForPhase(page, 'reading', 12_000)
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)
  expect(
    await page.locator('.chevrons.pointing').count(),
    'the chevrons stop once she knows which way the card goes',
  ).toBe(0)

  const tapped = Date.now()
  await page.locator('.pile-goed').click()
  expect(await page.locator('.touch-dot').count(), 'no demonstration on a taught tap').toBe(0)
  await expect.poll(() => pileCount(page, 'goed'), { timeout: 5000 }).toBe(6)
  expect(Date.now() - tapped, 'a tap is the quick flight again, not the ~1.4s lesson').toBeLessThan(
    1800,
  )
})
