import { test, expect, type Page } from '@playwright/test'
import { installFakeSpeech } from './fixtures/speech'

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
  await installFakeSpeech(page)
})

test('a round is ten different words', async ({ page }) => {
  test.slow() // ten cards, each with a deal-in, a clip and a flight to the pile
  await page.goto(PROEFRONDE)
  await expect(page.locator('.word-card')).toBeVisible()
  await expect(page.locator('.pip')).toHaveCount(10)

  const seen: string[] = []
  for (let i = 0; i < 10; i++) {
    seen.push(await playCard(page, 'goed'))
    if (i < 9) {
      // the pips track cards done, and each card lands before the next deals in
      await expect.poll(() => page.locator('.pip-done').count(), { timeout: 6000 }).toBe(i + 1)
    } else {
      // the tenth card ends the round, so the pips go with it — the reward screen is what
      // "all ten done" looks like from here
      await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 8000 })
    }
  }
  expect(new Set(seen).size, `no word may repeat in a round: ${seen.join(', ')}`).toBe(10)
})

test('cards stack on the pile she chose, and the reward screen counts both piles', async ({
  page,
}) => {
  test.slow()
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

  // gems: 5 for finishing + 1 per correct word, counted up one at a time
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 5000 })
    .toContain('+12')
})

test('a round she gets entirely wrong still pays for finishing', async ({ page }) => {
  test.slow() // every card replays the word before the next one deals in
  await page.goto(PROEFRONDE)
  await expect(page.locator('.word-card')).toBeVisible()

  for (let i = 0; i < 10; i++) {
    await playCard(page, 'nogEven')
  }

  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.reward-tally')).toContainText('0 goed')
  // never zero, and never a failure message
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 5000 })
    .toContain('+5')
  await expect(page.locator('.reward-screen h1')).not.toContainText('Perfect')
})

test('swiping the card sorts it, the same as tapping a pile', async ({ page }) => {
  await page.goto(PROEFRONDE)
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  const card = page.locator('.word-card')
  const b = (await card.boundingBox())!
  const cy = b.y + b.height / 2
  await page.mouse.move(b.x + b.width / 2, cy)
  await page.mouse.down()
  // far enough for the stamp to show, still short of the 90px commit threshold
  await page.mouse.move(b.x + b.width / 2 + 60, cy, { steps: 4 })
  expect(
    Number(await page.locator('.swipe-stamp-right').evaluate((el) => getComputedStyle(el).opacity)),
    'the GOED! stamp fades in as she drags toward it',
  ).toBeGreaterThan(0.4)
  await page.mouse.move(b.x + b.width / 2 + 200, cy, { steps: 6 })
  await page.mouse.up()

  await expect.poll(() => pileCount(page, 'goed'), { timeout: 4000 }).toBe(1)
  expect(await pileCount(page, 'nogEven')).toBe(0)
})

test('a short drag springs back instead of grading', async ({ page }) => {
  await page.goto(PROEFRONDE)
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  const card = page.locator('.word-card')
  const b = (await card.boundingBox())!
  const cy = b.y + b.height / 2
  await page.mouse.move(b.x + b.width / 2, cy)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 40, cy, { steps: 4 }) // under the 90px threshold
  await page.mouse.up()

  await page.waitForTimeout(600)
  expect(await pileCount(page, 'goed')).toBe(0)
  expect(await pileCount(page, 'nogEven')).toBe(0)
  expect(await page.locator('.pip-done').count()).toBe(0)
})

test('the arrow keys sort a card, for building and reviewing on a desktop', async ({ page }) => {
  await page.goto(PROEFRONDE)
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => pileCount(page, 'nogEven'), { timeout: 4000 }).toBe(1)
})
