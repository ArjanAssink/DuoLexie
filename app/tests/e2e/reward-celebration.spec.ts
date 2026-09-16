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
 * Almost every test here opens the screen directly from the probeermenu's
 * `/#/beloning?goed=…&totaal=…` rather than playing a round to reach it. The screen does not
 * care how she got there — it is handed a `DisplayReward` and renders it — and a full
 * ten-card round costs about twenty seconds on a desktop and a minute on CI's WebKit
 * profiles. Eight of them across three profiles was most of a doubled CI job for coverage
 * that a page load gives.
 *
 * What the preview cannot stand in for is the wiring: that the numbers on this screen are the
 * ones she actually earned. That is covered twice over and neither is touched here —
 * `hardop-lezen.spec.ts` asserts the tally, the chips and the gem total after a genuine round,
 * and `quit-mid-animation.spec.ts` asserts what was credited. The one test below that still
 * drives a real round is the one whose subject *is* the seam: tapping through the celebration
 * and leaving by Verder, which only exists on the path a real round takes.
 */

/** A round short enough to be honest about: the preview builds the same shape a real one does. */
function preview(goed: number, totaal = 10, extra = ''): string {
  return `/#/beloning?goed=${goed}&totaal=${totaal}${extra}`
}

/** BEATS.doneAt plus room for a slow runner — the sequence is ~4.3s end to end. */
const SEQUENCE_MS = 9000

/** Long enough for a ten-card round on CI's two-core WebKit runners, plus the celebration. */
const ROUND_TIMEOUT = 150_000

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
  await recordBeats(page)
  await page.goto(preview(10))

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
  // 5 for finishing + 1 per correct word + 3 for perfect
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+18')
})

test('seven out of ten reads Goed, 70%, and lists the three it missed', async ({ page }) => {
  await page.goto(preview(7))

  await expect(label(page)).toHaveText('Goed', { timeout: SEQUENCE_MS })
  await expect(page.locator('.reward-pct')).toHaveText('70%')
  expect(await barScaleX(page)).toBeCloseTo(0.7, 2)
  // the text the existing hardop-lezen spec pins, now living under the card's number
  await expect(page.locator('.reward-tally')).toHaveText('7 goed · 3 nog even')
  await expect(page.locator('.word-chip')).toHaveCount(3)
  await expect(page.locator('.reward-screen h1')).toHaveText('Goed gedaan!')
})

test('eight out of ten is Super, and 79% is still only Goed', async ({ page }) => {
  // The boundary the unit tests pin, checked once on the real screen: 80 is where the label
  // and the card's colours change, and it is the tier a good round actually lands on.
  await page.goto(preview(8))
  await expect(label(page)).toHaveText('Super', { timeout: SEQUENCE_MS })
  await expect(page.locator('.reward-pct')).toHaveText('80%')
  await expect(page.locator('.reward-screen h1')).toHaveText('Super gedaan!')

  await page.goto(preview(79, 100))
  await expect(label(page)).toHaveText('Goed', { timeout: SEQUENCE_MS })
  await expect(page.locator('.reward-pct')).toHaveText('79%')
})

test('a round she gets entirely wrong still celebrates, at Geoefend and 0%', async ({ page }) => {
  await page.goto(preview(0))

  await expect(label(page)).toHaveText('Geoefend', { timeout: SEQUENCE_MS })
  await expect(page.locator('.reward-pct')).toHaveText('0%')
  expect(await barScaleX(page), 'an empty bar, not a missing one').toBeCloseTo(0, 3)
  // never a failure message, and never nothing earned
  await expect(page.locator('.reward-screen h1')).not.toContainText('Perfect')
  await expect(page.locator('.reward-screen h1')).toHaveText('Lekker geoefend!')
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+5')
  // §5 — below half there is no streak and no confetti, just a quieter room
  await expect(page.locator('.reward-streak')).toHaveCount(0)
})

test('a tap jumps to the end with nothing left mid-animation', async ({ page }) => {
  await page.goto(preview(5))

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

  // The idle float is the one thing that is meant to keep going, and it is the only infinite
  // animation the final state has.
  expect(await runningAnimations(page)).toEqual(['fridaFloat'])
})

test('reduced motion mounts in the final state, with the gems still counting', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await installAudioSpy(page)
  await page.goto(preview(5))

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
   * §9.8, the reduced-motion half. Every oscillator counted since the screen appeared must be
   * a gem tick: `cardPop` would be one more and each `tierUp` two more, so a count at or below
   * the gem total is proof neither fired. (At or below rather than exactly, because the reset
   * above races the first tick or two — reduced motion starts the count-up at mount.)
   */
  const started = await oscillators(page)
  expect(started, 'the ticks reached the synthesiser').toBeGreaterThan(0)
  expect(started, 'and nothing else did').toBeLessThanOrEqual(gems)
})

test('a perfect round is audibly busier than an all-wrong one', async ({ page }) => {
  // §9.8. Sound cannot be heard in CI, so the check is that the celebration reaches the
  // synthesiser at all: three tier chimes of two partials each, plus a count-up more than
  // three times as long. An all-wrong round crosses no tier boundary, so it chimes not once.
  await installAudioSpy(page)
  expect(
    await page.evaluate(() => typeof window.AudioContext !== 'undefined'),
    'the spy needs a real AudioContext to patch',
  ).toBe(true)

  await page.goto(preview(10))
  await resetAudioSpy(page)
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+18')
  const perfect = await oscillators(page)

  await page.goto(preview(0))
  await resetAudioSpy(page)
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+5')
  const allWrong = await oscillators(page)

  expect(perfect, `perfect ${perfect} vs all-wrong ${allWrong}`).toBeGreaterThan(allWrong)
})

test('a Tijdrit record shows the banner instead of the subline', async ({ page }) => {
  // The one case the reading preview cannot produce — Hardop lezen is untimed by design, so
  // `newRecord` only ever comes from a klank game.
  await page.goto(preview(9, 10, '&spel=klank&score=48&record=1'))
  await expect(page.locator('.record-banner')).toHaveText('NIEUW RECORD!', {
    timeout: SEQUENCE_MS,
  })
  await expect(page.locator('.reward-subline')).toHaveCount(0)
  await expect(page.locator('.reward-score')).toContainText('48 klanken per minuut')
  // per-klank scoring, so the card counts answers rather than words
  await expect(page.locator('.reward-tally')).toHaveText('9 van 10 goed')
})

test('the preview credits nothing — it is a screen, not a round', async ({ page }) => {
  /*
   * The hazard this route introduces, pinned. `/#/beloning` renders a real reward with real
   * numbers, and the only thing keeping it from paying them out is that it calls the pure
   * `computeReward` and never `completeLesson`. If that ever slipped, opening the preview
   * would quietly credit gems for a round she did not play — into the same profile she plays
   * on, since this is a route in the shipped app and not a test-only door.
   */
  await page.goto(preview(10))
  await expect(page.locator('.reward-verder')).toBeVisible({ timeout: SEQUENCE_MS })
  await expect
    .poll(() => page.locator('.reward-line').first().innerText(), { timeout: 20_000 })
    .toContain('+18')
  await page.waitForTimeout(400) // room for a (wrongly) triggered persist to land

  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase | null>((res) => {
      const r = indexedDB.open('duolexie')
      r.onsuccess = () => res(r.result)
      r.onerror = () => res(null)
    })
    if (!db || !db.objectStoreNames.contains('kv')) return null
    const raw = await new Promise<unknown>((res) => {
      const r = db.transaction('kv').objectStore('kv').get('duolexie-progress')
      r.onsuccess = () => res(r.result)
      r.onerror = () => res(null)
    })
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as
      | { state?: Record<string, unknown> }
      | null
    const st = parsed?.state ?? {}
    return {
      gems: (st.gems as number) ?? 0,
      xp: (st.xp as number) ?? 0,
      sessions: ((st.sessions as unknown[]) ?? []).length,
    }
  })
  // null when the store was never written at all, which is just as good an answer
  if (stored) expect(stored).toMatchObject({ gems: 0, xp: 0, sessions: 0 })
})

test.describe('on an iPhone SE', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('the done state fits without scrolling, and the hero never scrolls sideways', async ({
    page,
  }) => {
    await page.goto(preview(6))

    /*
     * The hero is a 2.2x Frida over a band 160% of the width. Both overhang, and on a phone a
     * page that can be pushed sideways under her thumb mid-celebration is the kind of bug that
     * only ever shows up on the device. Polled through the whole sequence rather than checked
     * once at the end, because the overhang exists only while it is happening.
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

/**
 * The one test here that still plays a real round, because its subject is the seam rather
 * than the screen: after a genuine Hardop lezen round, tapping through the celebration and
 * leaving by Verder has to land her back on the leerpad with nothing broken behind it. The
 * preview's Verder goes back to the probeermenu, which proves nothing about that path.
 */
test('after a real round, a tap and then Verder leaves cleanly', async ({ page }) => {
  test.setTimeout(ROUND_TIMEOUT)
  const errors = collectErrors(page)
  // Verder goes to the leerpad, and a fresh profile would be bounced to the welkom-flow there
  await skipOnboarding(page)
  await installNarration(page)
  await installLearnedSwipe(page)
  await page.goto(PROEFRONDE)
  await finishRound(page, 7)

  // the numbers are the ones the round produced, not a preview's
  await expect(page.locator('.reward-tally')).toHaveText('7 goed · 3 nog even')

  await page.locator('.reward-screen').click({ position: { x: 5, y: 5 } })
  await expect(page.locator('.reward-screen')).toHaveAttribute('data-beat', 'done', {
    timeout: 1000,
  })
  await expect(page.locator('.reward-verder')).toBeVisible()

  // §9.6
  await page.locator('.reward-verder').click()
  await expect(page.locator('.coin-item').first()).toBeVisible()
  await expect(page.locator('.reward-screen')).toHaveCount(0)
  expect(errors, 'no console errors on the way out').toEqual([])
})
