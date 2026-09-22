import { test, expect } from '@playwright/test'
import {
  clearSpoken,
  installSpellingNarration,
  spoken,
  wordIdFor,
} from './fixtures/spellingNarration'
import {
  ANSWER,
  PAIR,
  TRY_DT,
  nextCard,
  playCard,
  stemOf,
  tilesFor,
  waitForBeat,
} from './fixtures/spellingRound'

/**
 * Maak het woord af, a whole round at a time: ten distinct words to the reward screen, the
 * keyboard, and what a missed-word chip says (docs/maak-het-woord-af.md §5).
 *
 * **Desktop only** (playwright.config.ts's `testIgnore` for ipad/iphone). A ten-card round
 * is the most expensive shape in this suite, and running two of them on each of CI's two
 * WebKit profiles pushed the whole job from sixteen minutes to twenty-two and took three
 * unrelated WebKit tests down with it — the same weight problem `installLearnedSwipe` and
 * the reward-screen preview were introduced to solve. None of what these three check is
 * engine-specific: it is queue bookkeeping, a keydown handler and which clip a chip plays.
 * What *is* engine-specific — the carry, the bump, the pseudo-element gap — stays in
 * maak-het-woord-af.spec.ts and runs everywhere.
 */
const WORD_ID = wordIdFor(PAIR)

test.beforeEach(async ({ page }) => {
  await installSpellingNarration(page)
})

test('a round is ten distinct words and ends on the reward screen', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(TRY_DT)
  await expect(page.locator('.spel-card')).toBeVisible()

  const total = await page.locator('.pip').count()
  expect(total, 'the try-round deals a full round').toBe(10)

  const stems: string[] = []
  for (let i = 0; i < total; i++) {
    stems.push(await playCard(page, true))
    if (i < total - 1) await nextCard(page)
  }

  expect(new Set(stems).size, 'every card is a different word').toBe(total)
  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 20_000 })
  // ten right: 5 for finishing + 10 + the 3 for a clean round
  await expect(page.locator('.reward-tally')).toHaveText('10 goed · 0 nog even')
})


test('the arrow keys choose the left and the right tile', async ({ page }) => {
  await page.goto(TRY_DT)
  await waitForBeat(page, 'choose')
  const { stem, right } = await tilesFor(page)

  await page.keyboard.press(right === 0 ? 'ArrowLeft' : 'ArrowRight')
  await expect(page.locator('.spel-card.landed')).toHaveCount(1)
  expect(await stemOf(page)).toBe(stem + ANSWER.get(stem))

  // …and the other key picks the other tile, which on the next card is a miss half the
  // time — so this only asserts that it committed *something*.
  await nextCard(page)
  const next = await tilesFor(page)
  await page.keyboard.press(next.wrong === 0 ? 'ArrowLeft' : 'ArrowRight')
  await expect(page.locator('.spel-screen[data-beat="wrong"]')).toHaveCount(1)
})


test('a missed-word chip on the reward screen speaks the word and its longer form', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto(TRY_DT)
  await expect(page.locator('.spel-card')).toBeVisible()

  // Miss the first card, get everything else right. The missed word comes back once, so
  // the round is eleven cards for ten distinct words.
  const missed = await playCard(page, false)
  const missedId = WORD_ID.get(missed)!
  for (let i = 0; i < 10; i++) {
    await nextCard(page)
    await playCard(page, true)
  }

  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.reward-tally')).toHaveText('9 goed · 1 nog even')
  const chips = page.locator('.word-chip')
  await expect(chips).toHaveCount(1)
  await expect(chips.first()).toContainText(missed + ANSWER.get(missed))

  await clearSpoken(page)
  await chips.first().click()
  // The strategy rides along one last time, for exactly the word she got wrong (§5).
  await expect.poll(() => spoken(page), { timeout: 10_000 }).toEqual([
    `words/${missedId}`,
    `spelling/${missedId}-langer`,
  ])
})
