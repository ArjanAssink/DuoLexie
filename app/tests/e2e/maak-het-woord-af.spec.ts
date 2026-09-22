import { test, expect } from '@playwright/test'
import {
  clearSpoken,
  installSpellingNarration,
  langerFor,
  ruleFor,
  spoken,
  wordIdFor,
} from './fixtures/spellingNarration'
import {
  ANSWER,
  OPTIONS,
  PAIR,
  TRY_DT,
  beatOf,
  nextCard,
  playCard,
  stemOf,
  tilesFor,
  waitForBeat,
} from './fixtures/spellingRound'

/**
 * Maak het woord af: the card, the carry and the correction (docs/maak-het-woord-af.md
 * §2–§4). Everything here is about the gesture, the CSS and the narration — the parts that
 * can differ between engines — so it runs on all three profiles.
 *
 * The round-level bookkeeping (ten distinct words, the reward screen, the keyboard) lives
 * in maak-het-woord-af-round.spec.ts, which is desktop-only: those are full rounds, and a
 * full round is the most expensive thing in this suite on CI's two-core WebKit runners.
 */
const LANGER = langerFor(PAIR)
const WORD_ID = wordIdFor(PAIR)

test.beforeEach(async ({ page }) => {
  await installSpellingNarration(page)
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
