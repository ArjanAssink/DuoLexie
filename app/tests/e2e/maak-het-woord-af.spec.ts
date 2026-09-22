import { test, expect, type Page } from '@playwright/test'
import {
  answersFor,
  clearSpoken,
  installSpellingNarration,
  langerFor,
  optionsFor,
  ruleFor,
  spoken,
  wordIdFor,
} from './fixtures/spellingNarration'

/**
 * The d/t try-round from `/#/proberen` (data/path.ts SPELLING_TRY_LESSONS).
 *
 * Not a path node, on purpose: a path node only appears once the seed words are
 * `reviewed: true` (docs/maak-het-woord-af.md §6 rule 5, §12.1), and until Arjan has been
 * through that list there is nothing on the path to drive. The try-round deals the drafts,
 * which is exactly what it exists for — and it needs no onboarding flag to reach.
 */
const TRY_DT = '/#/les/proef-spel-d-t'
const PAIR = 'd-t'
const ANSWER = answersFor(PAIR)
const LANGER = langerFor(PAIR)
const WORD_ID = wordIdFor(PAIR)
const OPTIONS = optionsFor(PAIR)

function waitForBeat(page: Page, want: string, timeout = 15_000) {
  return page.waitForFunction(
    (b) => document.querySelector('.spel-screen')?.getAttribute('data-beat') === b,
    want,
    { timeout },
  )
}

function beatOf(page: Page): Promise<string | null> {
  return page.getAttribute('.spel-screen', 'data-beat')
}

/**
 * The stem on the card. `textContent`, not `innerText`: the gap's width is held by a
 * pseudo-element, so nothing but the stem (and, once a tile has landed, the ending) is in
 * the DOM at all — which is what makes "the wrong spelling was never on screen" a question
 * the DOM can answer.
 */
function stemOf(page: Page): Promise<string> {
  return page.locator('.word-text').evaluate((el) => el.textContent ?? '')
}

/** Which tile is right for the stem now on the card, and which is not. */
async function tilesFor(page: Page): Promise<{ stem: string; right: number; wrong: number }> {
  const stem = await stemOf(page)
  const ending = ANSWER.get(stem)
  expect(ending, `no seed word has the stem "${stem}"`).toBeTruthy()
  const right = OPTIONS.indexOf(ending!)
  return { stem, right, wrong: 1 - right }
}

/**
 * Answer the card on screen, right or wrong, by tapping a tile. Returns its stem.
 *
 * It waits for the card to stop being answerable before returning, which is load-bearing:
 * a tapped tile takes 260ms to travel into the gap before anything is committed, so a
 * caller that read the next card straight after the click would read the *same* one again
 * and think the round was repeating itself.
 */
async function playCard(page: Page, correct: boolean): Promise<string> {
  await waitForBeat(page, 'choose')
  const { stem, right, wrong } = await tilesFor(page)
  await page.locator('.spel-tile').nth(correct ? right : wrong).click()
  await page.waitForFunction(
    () => document.querySelector('.spel-screen')?.getAttribute('data-beat') !== 'choose',
    null,
    { timeout: 15_000 },
  )
  return stem
}

/** Wait until the verdict has played out and the next card is answerable. */
async function nextCard(page: Page): Promise<void> {
  await waitForBeat(page, 'choose', 20_000)
}

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

test('carrying the right tile into the gap turns the word green', async ({ page }) => {
  await page.goto(TRY_DT)
  await waitForBeat(page, 'choose')
  const { stem, right } = await tilesFor(page)

  const tile = page.locator('.spel-tile').nth(right)
  const gap = page.locator('.gap')
  const t = (await tile.boundingBox())!
  const g = (await gap.boundingBox())!

  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
  await page.mouse.down()
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 - 30, { steps: 4 })
  // The gap lights up while the tile is over it — the carry's only feedback that this is
  // the target (§3).
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 8 })
  await expect(page.locator('.gap.targeted')).toHaveCount(1)
  await page.mouse.up()

  await expect(page.locator('.spel-card.landed')).toHaveCount(1)
  expect(await stemOf(page), 'the ending is in the word now').toBe(stem + ANSWER.get(stem))
  // --teal, the colour the whole app says "goed" in
  await expect(page.locator('.word-text')).toHaveCSS('color', 'rgb(47, 167, 155)')
  await expect(page.locator('.pip-done')).toHaveCount(1)
})

test('releasing a tile away from the gap springs it back and grades nothing', async ({ page }) => {
  await page.goto(TRY_DT)
  await waitForBeat(page, 'choose')
  const { stem, right } = await tilesFor(page)

  const tile = page.locator('.spel-tile').nth(right)
  const t = (await tile.boundingBox())!
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
  await page.mouse.down()
  // Sideways and down — nowhere near the gap, and mostly on the axis a flick means nothing
  // on, so neither route to a verdict is open.
  await page.mouse.move(t.x + t.width / 2 + 120, t.y + t.height / 2 + 30, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)

  expect(await beatOf(page)).toBe('choose')
  expect(await stemOf(page)).toBe(stem)
  await expect(page.locator('.pip-done')).toHaveCount(0)
  // back in its slot, not left hanging 120px to the right
  const after = (await tile.boundingBox())!
  expect(Math.abs(after.x - t.x)).toBeLessThan(2)
})

test('a flick upwards commits, even short of the gap', async ({ page }) => {
  await page.goto(TRY_DT)
  await waitForBeat(page, 'choose')
  const { stem, right } = await tilesFor(page)

  const tile = page.locator('.spel-tile').nth(right)
  const t = (await tile.boundingBox())!
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
  await page.mouse.down()
  // Straight up and well past the card, so the tile's centre is nowhere near the gap when
  // it is released: only the flick rule can commit this one.
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 - 320, { steps: 3 })
  await page.mouse.up()

  await expect(page.locator('.spel-card.landed')).toHaveCount(1)
  expect(await stemOf(page)).toBe(stem + ANSWER.get(stem))
})

test('a wrong tile bounces, the right one slides in, and the word comes back three cards later', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto(TRY_DT)
  await waitForBeat(page, 'choose')

  const { stem, wrong } = await tilesFor(page)
  const wrongWord = stem + OPTIONS[wrong]

  /*
   * Watch the word for the whole of the wrong beat, from inside the page. Polling from the
   * test side could miss the frames that matter: the bounce is 420ms and the correction
   * slides in right behind it. This is the acceptance criterion the entire design exists
   * for (§1) — `hont` must never be formed, not even for one frame.
   */
  await page.evaluate(() => {
    const w = window as unknown as { __seen: string[] }
    w.__seen = []
    const note = () => {
      const text = document.querySelector('.word-text')?.textContent ?? ''
      if (text && w.__seen[w.__seen.length - 1] !== text) w.__seen.push(text)
    }
    note()
    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  })

  await page.locator('.spel-tile').nth(wrong).click()

  await waitForBeat(page, 'wrong')
  // The tile knocks against the gap rather than entering it.
  await expect(page.locator('.spel-tile.bumping')).toHaveCount(1)
  // …and then the *correct* one arrives on its own and the word is whole and green.
  await expect(page.locator('.spel-card.landed')).toHaveCount(1, { timeout: 5000 })
  expect(await stemOf(page)).toBe(stem + ANSWER.get(stem))

  const seen: string[] = await page.evaluate(
    () => (window as unknown as { __seen: string[] }).__seen,
  )
  expect(seen, `"${wrongWord}" must never be on screen`).not.toContain(wrongWord)
  expect(seen[0]).toBe(stem)
  expect(seen[seen.length - 1]).toBe(stem + ANSWER.get(stem))

  // A miss does not cost a pip — the round is ten distinct words either way (§5).
  await expect(page.locator('.pip')).toHaveCount(10)
  await expect(page.locator('.pip-done')).toHaveCount(1)

  // Three cards later it is back, once.
  const after: string[] = []
  for (let i = 0; i < 3; i++) {
    await nextCard(page)
    after.push(await playCard(page, true))
  }
  expect(after[after.length - 1], 'the missed word is the third card after it').toBe(stem)
})

test('the strategy badge prompts first and reveals on the second tap', async ({ page }) => {
  await page.goto(TRY_DT)
  await waitForBeat(page, 'choose')
  const stem = await stemOf(page)
  const langer = LANGER.get(stem)!
  const wordId = WORD_ID.get(stem)!
  await clearSpoken(page)

  // First tap: Frida asks her to make the word longer, and waits. Nothing is revealed —
  // the move RID teaches is that *she* produces it (§4).
  await page.locator('.strategy-btn').click()
  await expect(page.locator('.coach-bubble')).toHaveText('Maak het woord langer. Zeg het maar.')
  await expect(page.locator('.spel-langer')).toHaveCount(0)
  await expect.poll(() => spoken(page)).toContain(`spelling/${PAIR}-regel`)
  expect(await spoken(page)).not.toContain(`spelling/${wordId}-langer`)

  // Second tap: the longer form appears under the stem and is spoken.
  await page.locator('.strategy-btn').click()
  await expect(page.locator('.spel-langer')).toHaveText(langer)
  await expect(page.locator('.coach-bubble')).toHaveText(ruleFor(PAIR))
  await expect.poll(() => spoken(page)).toContain(`spelling/${wordId}-langer`)

  // Free, and never scored: the badge changed nothing about the round.
  await expect(page.locator('.pip-done')).toHaveCount(0)
  expect(await beatOf(page)).toBe('choose')
})

test('after a miss the strategy opens by itself, straight at the reveal', async ({ page }) => {
  await page.goto(TRY_DT)
  await waitForBeat(page, 'choose')
  const { stem, wrong } = await tilesFor(page)
  const langer = LANGER.get(stem)!
  const wordId = WORD_ID.get(stem)!
  await clearSpoken(page)

  await page.locator('.spel-tile').nth(wrong).click()
  await waitForBeat(page, 'wrong')

  // Straight to the reveal, never to the question: a correction is not the moment to quiz
  // her (§4). So the longer form is on the card and the prompt was never said.
  await expect(page.locator('.spel-langer')).toHaveText(langer, { timeout: 5000 })
  await expect.poll(() => spoken(page), { timeout: 10_000 }).toEqual([
    `words/${wordId}`,
    `spelling/${wordId}-langer`,
  ])
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
