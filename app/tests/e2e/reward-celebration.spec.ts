import { test, expect, type Page } from '@playwright/test'
import { installNarration } from './fixtures/narration'
import { installLearnedSwipe } from './fixtures/profile'
import { skipOnboarding } from './fixtures/onboarded'
import {
  beatsSeen,
  finishRound,
  installAudioSpy,
  oscillators,
  PROEFRONDE,
  recordBeats,
  resetAudioSpy,
  runningAnimations,
} from './fixtures/round'

/**
 * The celebration after a round (docs/reward-celebration.md §9).
 *
 * Every test here pays for a full ten-card round to reach the screen under test, which is
 * why they are written to cover as much per round as they honestly can rather than one
 * assertion each — and why they all carry a long timeout. `installLearnedSwipe` is on
 * everywhere: none of these are about being taught the gesture, and the demonstration costs
 * ~950ms a card.
 */

/** Long enough for a ten-card round on CI's two-core WebKit runners, plus the celebration. */
const ROUND_TIMEOUT = 150_000

/** BEATS.doneAt plus room for a slow runner — the sequence is ~4.3s end to end. */
const SEQUENCE_MS = 9000

async function startRound(page: Page) {
  await installNarration(page)
  await installLearnedSwipe(page)
  await page.goto(PROEFRONDE)
}

/** Everything the browser complained about, so a test can assert it complained about nothing. */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

function label(page: Page) {
  return page.locator('.reward-card-tier')
}

/** The bar's actual rendered scaleX, read off the computed matrix rather than the inline style. */
function barScaleX(page: Page): Promise<number> {
  return page.locator('.reward-bar-fill').evaluate((el) => {
    return new DOMMatrixReadOnly(getComputedStyle(el).transform).m11
  })
}

test('the beats advance in order, and a perfect round lands on Perfect!', async ({ page }) => {
  test.setTimeout(ROUND_TIMEOUT)
  await recordBeats(page)
  await startRound(page)
  await finishRound(page, 10)

  // §9.1 — the order is the acceptance criterion; the milliseconds are tuning, and CI's
  // ipad profile runs slow enough that asserting them would be asserting the runner.
  await expect
    .poll(() => beatsSeen(page), { timeout: SEQUENCE_MS })
    .toEqual(['hero', 'settle', 'card', 'strip', 'done'])

  // §9.2 — the headline, the tier the bar climbed to, the fill and the number.
  await expect(page.locator('.reward-screen h1')).toHaveText('Perfect!')
  await expect(label(page)).toHaveText('Perfect!')
  await expect(page.locator('.reward-pct')).toHaveText('100%')
  expect(await barScaleX(page), 'a perfect round fills the bar to the end').toBeCloseTo(1, 3)
  await expect(page.locator('.reward-tally')).toHaveText('10 goed · 0 nog even')
  await expect(page.locator('.word-chip')).toHaveCount(0)
  await expect(page.locator('.reward-verder')).toBeVisible()
})

test('seven out of ten reads Goed, 70%, and lists the three it missed', async ({ page }) => {
  test.setTimeout(ROUND_TIMEOUT)
  await startRound(page)
  const missed = await finishRound(page, 7)

  await expect(label(page)).toHaveText('Goed', { timeout: SEQUENCE_MS })
  await expect(page.locator('.reward-pct')).toHaveText('70%')
  expect(await barScaleX(page)).toBeCloseTo(0.7, 2)
  // the text the existing hardop-lezen spec pins, now living under the card's number
  await expect(page.locator('.reward-tally')).toHaveText('7 goed · 3 nog even')

  const chips = await page.locator('.word-chip').allInnerTexts()
  expect(chips).toHaveLength(3)
  expect(chips.map((c) => c.replace('🔊', '').trim()).sort()).toEqual([...missed].sort())
})

test('a round she gets entirely wrong still celebrates, at Geoefend and 0%', async ({ page }) => {
  test.setTimeout(ROUND_TIMEOUT)
  await startRound(page)
  await finishRound(page, 0)

  await expect(label(page)).toHaveText('Geoefend', { timeout: SEQUENCE_MS })
  await expect(page.locator('.reward-pct')).toHaveText('0%')
  expect(await barScaleX(page), 'an empty bar, not a missing one').toBeCloseTo(0, 3)
  // never a failure message, and never nothing earned
  await expect(page.locator('.reward-screen h1')).not.toContainText('Perfect')
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+5')
})

test('a tap jumps to the end, and Verder then leaves cleanly', async ({ page }) => {
  test.setTimeout(ROUND_TIMEOUT)
  const errors = collectErrors(page)
  // Verder goes to the leerpad, and a fresh profile would be bounced to the welkom-flow there
  await skipOnboarding(page)
  await startRound(page)
  await finishRound(page, 5)

  // §9.5 — tap early enough that the sequence is unmistakably mid-flight
  await page.waitForTimeout(300)
  await expect(page.locator('.reward-screen')).not.toHaveAttribute('data-beat', 'done')
  await page.locator('.reward-screen').click({ position: { x: 5, y: 5 } })

  await expect(page.locator('.reward-screen')).toHaveAttribute('data-beat', 'done', {
    timeout: 1000,
  })
  await expect(page.locator('.reward-pct')).toHaveText('50%')
  expect(await barScaleX(page), 'the bar is at its final width, not wherever it got to')
    .toBeCloseTo(0.5, 2)
  await expect(page.locator('.reward-verder')).toBeVisible()
  await expect(page.locator('.word-chip')).toHaveCount(5)

  // Nothing may be left mid-animation. The idle float is the one thing that is meant to
  // keep going, and it is the only infinite animation the final state has.
  expect(await runningAnimations(page)).toEqual(['fridaFloat'])

  // §9.6 — and the button works from here, with nothing broken behind it
  await page.locator('.reward-verder').click()
  await expect(page.locator('.coin-item').first()).toBeVisible()
  await expect(page.locator('.reward-screen')).toHaveCount(0)
  expect(errors, 'no console errors on the way out').toEqual([])
})

test('reduced motion mounts in the final state, with the gems still counting', async ({
  page,
}) => {
  test.setTimeout(ROUND_TIMEOUT)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installAudioSpy(page)
  await startRound(page)
  await finishRound(page, 5)

  // §9.7 — no sequence at all: the first paint is the last frame.
  await expect(page.locator('.reward-screen')).toHaveAttribute('data-beat', 'done')
  await resetAudioSpy(page)
  await expect(page.locator('.reward-pct')).toHaveText('50%')
  await expect(page.locator('.reward-verder')).toBeVisible()
  expect(await runningAnimations(page), 'nothing moves, not even the idle float').toEqual([])

  // the count-up is numbers changing rather than motion, so it stays (§7)
  const gems = 5 + 5 // finish bonus + one per correct word
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain(`+${gems}`)

  /*
   * §9.8, the reduced-motion half. Every oscillator counted since the screen appeared must
   * be a gem tick: `cardPop` would be one more and each `tierUp` two more, so a count at or
   * below the gem total is proof neither fired. (At or below rather than exactly, because
   * the reset above races the first tick or two — reduced motion starts the count-up at
   * mount.)
   */
  const started = await oscillators(page)
  expect(started, 'the ticks reached the synthesiser').toBeGreaterThan(0)
  expect(started, 'and nothing else did').toBeLessThanOrEqual(gems)
})

test('a perfect round is audibly busier than an all-wrong one', async ({ page }) => {
  // §9.8 — two rounds in one test, because the assertion is a comparison between them.
  test.setTimeout(ROUND_TIMEOUT * 2)
  await installAudioSpy(page)
  expect(
    await page.evaluate(() => typeof window.AudioContext !== 'undefined'),
    'the spy needs a real AudioContext to patch',
  ).toBe(true)

  await startRound(page)
  await finishRound(page, 10)
  await resetAudioSpy(page)
  await expect(page.locator('.reward-verder')).toBeVisible({ timeout: SEQUENCE_MS })
  // 18 gems at 90ms, plus the chimes — wait for the count-up to have finished
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+18')
  const perfect = await oscillators(page)

  // reload, not goto: the URL is already PROEFRONDE and a same-hash navigation is a no-op,
  // so the reward screen would simply still be sitting there
  await page.reload()
  await finishRound(page, 0)
  await resetAudioSpy(page)
  await expect(page.locator('.reward-verder')).toBeVisible({ timeout: SEQUENCE_MS })
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+5')
  const allWrong = await oscillators(page)

  // Geoefend -> Goed -> Super -> Perfect! is three chimes of two partials each, on top of a
  // count-up more than three times as long. An all-wrong round crosses no boundary at all.
  expect(perfect, `perfect ${perfect} vs all-wrong ${allWrong}`).toBeGreaterThan(allWrong)
})

test.describe('on an iPhone SE', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('the done state fits without scrolling, and the hero never scrolls sideways', async ({
    page,
  }) => {
    test.setTimeout(ROUND_TIMEOUT)
    await startRound(page)
    await finishRound(page, 6) // 4 chips — the most §3 promises to fit

    /*
     * The hero is a 2.2x Frida over a band 160% of the width. Both overhang, and on a phone
     * a page that can be pushed sideways under her thumb mid-celebration is the kind of bug
     * that only ever shows up on the device. Polled through the whole sequence rather than
     * checked once at the end, because the overhang exists only while it is happening.
     */
    const deadline = Date.now() + SEQUENCE_MS
    let widest = 0
    while (Date.now() < deadline) {
      widest = Math.max(
        widest,
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      if (await page.locator('.reward-screen[data-beat="done"]').count()) break
    }
    expect(widest, 'no horizontal overflow at any point in the sequence').toBeLessThanOrEqual(1)

    // §9.10 — and in the final state, with four chips, nothing scrolls at all
    await expect(page.locator('.reward-screen')).toHaveAttribute('data-beat', 'done')
    await expect(page.locator('.word-chip')).toHaveCount(4)
    await expect(page.locator('.reward-verder')).toBeVisible()
    const fits = await page.evaluate(() => {
      const doc = document.scrollingElement!
      const screen = document.querySelector('.reward-screen')!
      return {
        page: doc.scrollHeight - doc.clientHeight,
        screen: screen.scrollHeight - screen.clientHeight,
      }
    })
    expect(fits.page, 'the page itself does not scroll').toBeLessThanOrEqual(1)
    expect(fits.screen, 'and neither does the reward screen inside it').toBeLessThanOrEqual(1)
  })
})
