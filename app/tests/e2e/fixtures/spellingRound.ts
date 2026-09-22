import { expect, type Page } from '@playwright/test'
import { answersFor, optionsFor } from './spellingNarration'

/**
 * The d/t try-round from `/#/proberen` (data/path.ts SPELLING_TRY_LESSONS).
 *
 * Not a path node, on purpose: a path node only appears once the seed words are
 * `reviewed: true` (docs/maak-het-woord-af.md §6 rule 5, §12.1), and until Arjan has been
 * through that list there is nothing on the path to drive. The try-round deals the drafts,
 * which is exactly what it exists for — and it needs no onboarding flag to reach.
 */
export const TRY_DT = '/#/les/proef-spel-d-t'
export const PAIR = 'd-t'

export const ANSWER = answersFor(PAIR)
export const OPTIONS = optionsFor(PAIR)

export function waitForBeat(page: Page, want: string, timeout = 15_000) {
  return page.waitForFunction(
    (b) => document.querySelector('.spel-screen')?.getAttribute('data-beat') === b,
    want,
    { timeout },
  )
}

export function beatOf(page: Page): Promise<string | null> {
  return page.getAttribute('.spel-screen', 'data-beat')
}

/**
 * The stem on the card. `textContent`, not `innerText`: the gap's width is held by a
 * pseudo-element, so nothing but the stem (and, once a tile has landed, the ending) is in
 * the DOM at all — which is what makes "the wrong spelling was never on screen" a question
 * the DOM can answer.
 */
export function stemOf(page: Page): Promise<string> {
  return page.locator('.word-text').evaluate((el) => el.textContent ?? '')
}

/** Which tile is right for the stem now on the card, and which is not. */
export async function tilesFor(
  page: Page,
): Promise<{ stem: string; right: number; wrong: number }> {
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
export async function playCard(page: Page, correct: boolean): Promise<string> {
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
export async function nextCard(page: Page): Promise<void> {
  await waitForBeat(page, 'choose', 20_000)
}
