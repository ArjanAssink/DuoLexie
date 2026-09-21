import { test, expect, type Page } from '@playwright/test'
import { installNarration } from './fixtures/narration'
import { installLearnedSwipe } from './fixtures/profile'
import { skipOnboarding } from './fixtures/onboarded'
import { finishRound, PROEFRONDE, runningAnimations } from './fixtures/round'
import { BEATS } from '../../src/screens/rewardTimeline'

/**
 * The schatkist, and where its gems go (docs/kist-openen.md §6).
 *
 * Two halves, and the tests split the same way. The chest itself is exercised through the
 * preview route `/#/beloning`, for the reason `reward-celebration.spec.ts` gives: the screen
 * does not care how she got there, and a full round costs twenty seconds a test. The
 * *landing* cannot be — it is the seam between two screens, and the only way to produce a
 * real navigation carrying a real reward is to play a real round — so the one test that does
 * that is the one whose subject is the seam.
 *
 * Everything here runs on `page.clock` where it asserts about *when*, for the reason that
 * spec's beats test gives: on a loaded runner React coalesces state updates and a real-time
 * assertion about a beat becomes an assertion about the runner.
 */

const SEQUENCE_MS = 15_000

function preview(goed: number, totaal = 10, extra = ''): string {
  return `/#/beloning?goed=${goed}&totaal=${totaal}${extra}`
}

function chest(page: Page) {
  return page.locator('.reward-chest')
}

/** The gem line — the first of the strip's two, the same one the celebration spec reads. */
function gemLine(page: Page) {
  return page.locator('.reward-line').first()
}

/**
 * Watch the leerpad's gem counter take the gems, from before the page has loaded.
 *
 * Polling cannot see this and should not be asked to. The whole landing is 900ms long, and
 * on the far side of a route change from a screen that took a ten-card round to reach: on
 * CI's WebKit runners the statbar did not even *exist* three seconds after Verder, because
 * nothing renders until both stores have hydrated from IndexedDB, and by the time a poll
 * found the element the flag it was looking for had been and gone. That is the same problem
 * `recordBeats` exists for, solved the same way — an observer installed before the document
 * has an `<html>` element at all, recording what happened rather than sampling for it.
 *
 * Records three things at the moments they are true, rather than three separate races: what
 * the counter read while it was holding, how many gems were ever in the air, and whether the
 * pop that says it took them ever fired.
 */
async function recordLanding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __landing: { held: string | null; sprites: number; popped: boolean }
    }
    w.__landing = { held: null, sprites: 0, popped: false }
    const note = () => {
      const counter = document.querySelector('.statbar .stat.gems')
      // the first frame of the hold is the honest one: the counter has not taken them yet
      if (counter?.getAttribute('data-landing') === 'true' && w.__landing.held === null) {
        w.__landing.held = counter.textContent?.trim() ?? ''
      }
      if (counter?.getAttribute('data-landed') === 'true') w.__landing.popped = true
      // a peak, not a sample: the sprites mount a commit after the hold begins, because
      // GemFlight renders nothing until its layout effect has measured the counter
      const n = document.querySelectorAll('.gem-flight-gem').length
      if (n > w.__landing.sprites) w.__landing.sprites = n
    }
    // `document`, not `document.documentElement` — see recordBeats: an init script runs
    // before the document has an <html> element, and observing null throws silently.
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-landing', 'data-landed'],
    })
  })
}

/** What `recordLanding` saw. */
function landingSeen(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __landing: { held: string | null; sprites: number; popped: boolean } })
        .__landing,
  )
}

/** The animations actually running on the lid right now — the swing, when it is swinging. */
function lidAnimations(page: Page): Promise<string[]> {
  return page.locator('.chest-lid').evaluate((el) =>
    el.getAnimations().map((a) => (a as CSSAnimation).animationName ?? ''),
  )
}

/**
 * Step a paused clock until the screen reaches a beat, and no further.
 *
 * Stepping rather than jumping, and stopping on arrival rather than at a computed time, for
 * the same two reasons `walkTheClock` does it: each `runFor` is its own task so React has to
 * flush between them, and nothing here has to assume where the clock stood when the screen
 * mounted. The 100ms step is well under the 600ms that separates the closest two beats, so a
 * step can never carry the screen past the one being waited for.
 */
async function runToBeat(page: Page, wanted: string) {
  for (let i = 0; i < 120; i++) {
    if (await page.locator(`.reward-screen[data-beat="${wanted}"]`).count()) return
    await page.clock.runFor(100)
  }
  throw new Error(`the celebration never reached "${wanted}"`)
}

test('the chest arrives shut, and her tap is what opens it', async ({ page }) => {
  await page.clock.install()
  await page.goto(preview(10))
  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: SEQUENCE_MS })

  await runToBeat(page, 'strip')

  // §3: the strip brings it on screen closed. A chest that is open when she first sees it is
  // a picture of a chest.
  await expect(chest(page)).toHaveAttribute('data-open', 'false')
  await expect(gemLine(page), 'and not a gem before it opens').toHaveText('💎 +0')

  await chest(page).click()
  await expect(chest(page)).toHaveAttribute('data-open', 'true')

  /*
   * It was the tap that opened it, and not the auto-open catching up inside the click.
   *
   * That distinction cannot be made from the clock, which is what the first version of this
   * test tried: a click is not free on a paused clock — Playwright's actionability wait
   * drives it forward, and further here than almost anywhere else in the suite, because the
   * closed chest wobbles to invite the tap and a wobbling element is never "stable" until
   * the quiet stretch of its keyframes. On Chromium that is about a second, which left room.
   * On WebKit it was 2.7s, which did not: the auto-open fired *inside* the `click()` meant
   * to beat it and the test reported the timer's work as hers. `data-opened-by` exists
   * because of that failure, and makes the claim exactly rather than by inference.
   */
  await expect(chest(page)).toHaveAttribute('data-opened-by', 'tap')

  /*
   * The half that is easy to lose. The screen's own tap-to-skip sets `data-skipped`, which
   * turns every animation off — so if the chest's tap propagated, the one tap this whole
   * feature exists for would be the one tap whose lid never swings. The chest stops the
   * event; the sequence carries on underneath it.
   */
  await expect(page.locator('.reward-screen')).not.toHaveAttribute('data-skipped', 'true')
  await expect
    .poll(() => lidAnimations(page), { timeout: 2000 })
    .toContain('chestLidOpen')

  // and the gems she opened it for arrive: 5 for finishing + 10 correct + 3 for perfect
  await page.clock.runFor(4000)
  await expect(gemLine(page)).toHaveText('💎 +18')
})

test('left alone, the chest opens by itself — after Verder is already up', async ({ page }) => {
  await page.clock.install()
  await page.goto(preview(10))
  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: SEQUENCE_MS })

  /*
   * §3's two guarantees, on the real screen. She is never held by the chest — the button out
   * is up and usable while it is still shut — and she is never stuck behind it either: a
   * child who does not tap still gets her gems, without having to do anything.
   */
  await runToBeat(page, 'done')
  await expect(page.locator('.reward-verder')).toBeVisible()
  await expect(chest(page), 'still hers to open at the moment Verder appears').toHaveAttribute(
    'data-open',
    'false',
  )

  await page.clock.runFor(BEATS.chestAt - BEATS.doneAt + 300)
  await expect(chest(page)).toHaveAttribute('data-open', 'true')
  await expect(chest(page), 'and the timer is what did it').toHaveAttribute(
    'data-opened-by',
    'auto',
  )
  await page.clock.runFor(4000)
  await expect(gemLine(page)).toHaveText('💎 +18')
})

test('a tap anywhere else opens it too, with nothing left mid-animation', async ({ page }) => {
  // The skip guarantee (docs/reward-celebration.md §2) now has a chest inside it: "everything
  // at its final value" has to include the lid, or the tap she just made is the one thing on
  // the screen that did nothing. It opens without its swing, which is the guarantee working
  // rather than failing.
  await page.goto(preview(5))
  await page.waitForTimeout(300)
  await page.locator('.reward-screen').click({ position: { x: 5, y: 5 } })

  await expect(page.locator('.reward-screen')).toHaveAttribute('data-beat', 'done', {
    timeout: 1000,
  })
  await expect(chest(page)).toHaveAttribute('data-open', 'true')
  await expect(chest(page)).toHaveAttribute('data-opened-by', 'skip')
  expect(
    await runningAnimations(page),
    'the idle float is still the only thing moving',
  ).toEqual(['fridaFloat'])
})

test('reduced motion mounts the chest already open', async ({ page }) => {
  // §5. There is no swing to watch and no reason to make her tap for a number the screen
  // could simply be showing her.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(preview(5))

  await expect(page.locator('.reward-screen')).toHaveAttribute('data-beat', 'done')
  await expect(chest(page)).toHaveAttribute('data-open', 'true')
  await expect(chest(page)).toHaveAttribute('data-opened-by', 'reduced')
  expect(await runningAnimations(page), 'and nothing moves, chest included').toEqual([])
  await expect.poll(() => gemLine(page).innerText(), { timeout: 20_000 }).toBe('💎 +10')
})

test('the chest is a real button, reachable and announced', async ({ page }) => {
  // It is the only thing on this screen that does something. A tappable div would be
  // invisible to a screen reader and unreachable from a keyboard, and "she can always tap
  // anywhere" is not an answer for either.
  await page.goto(preview(10))
  await expect(chest(page)).toHaveAttribute('aria-label', 'Open de schatkist')
  await chest(page).press('Enter')
  await expect(chest(page)).toHaveAttribute('data-open', 'true')
  await expect(chest(page)).toHaveAttribute('aria-label', 'De schatkist is open')
})

/**
 * The seam. Everything above is about a screen; this is about two of them, and the whole
 * point of the feature is the line between them — so this one plays a real round.
 */
test('after a real round, the gems fly out of the chest and into the jar', async ({ page }) => {
  // a ten-card round costs 15s on a desktop and up to 38s on CI's two-core WebKit runners
  test.setTimeout(150_000)
  await recordLanding(page)
  await skipOnboarding(page)
  await installNarration(page)
  await installLearnedSwipe(page)
  await page.goto(PROEFRONDE)
  // 5 for finishing + 7 correct, into a profile that started at nothing
  await finishRound(page, 7)

  await page.locator('.reward-screen').click({ position: { x: 5, y: 5 } })
  await expect(page.locator('.reward-verder')).toBeVisible()
  await page.locator('.reward-verder').click()

  const counter = page.locator('.statbar .stat.gems')

  // the end state first, because it is the one that waits for you
  await expect(counter).toContainText('12', { timeout: 30_000 })
  await expect(counter).not.toHaveAttribute('data-landing', 'true')
  await expect(page.locator('.gem-flight-gem')).toHaveCount(0)

  /*
   * And now what the observer saw on the way there. §4, and the bug it exists for:
   * `completeLesson` credited these gems a beat before the reward screen even mounted, so
   * without the handoff the counter is *already* at twelve when the gems she watched come
   * out of the chest arrive — and they land on a number that has nothing left to change.
   */
  const seen = await landingSeen(page)
  expect(seen.held, 'the counter held at the old total while they were in the air').toBe('0')
  expect(seen.sprites, 'and seven gems were in it — gemSpriteCount(12)').toBe(7)
  expect(seen.popped, 'and it popped when it took them').toBe(true)
})

test('the leerpad reached any other way just shows the total', async ({ page }) => {
  // A real round, so the same budget as the test above it. Without this it inherits the 30s
  // default and fails on the slower profiles for no reason but the clock: the round alone
  // takes 25-38s on CI's WebKit runners.
  test.setTimeout(150_000)
  /*
   * The other half of §4's contract, and the one a reader has to be able to trust: a landing
   * belongs to one navigation and nothing else. Reaching the leerpad by reload, by deep link
   * or by the back gesture must show her what she has, immediately, with nothing in the air —
   * a counter that held itself back on a cold start would be showing her the wrong number for
   * no reason at all.
   */
  await skipOnboarding(page)
  await installNarration(page)
  await installLearnedSwipe(page)
  await page.goto(PROEFRONDE)
  await finishRound(page, 7)
  await page.locator('.reward-screen').click({ position: { x: 5, y: 5 } })
  await page.locator('.reward-verder').click()
  await expect(page.locator('.statbar .stat.gems')).toContainText('12', { timeout: 6000 })

  await page.reload()
  await expect(page.locator('.statbar .stat.gems')).toContainText('12')
  await expect(page.locator('.statbar .stat.gems')).not.toHaveAttribute('data-landing', 'true')
  await expect(page.locator('.gem-flight-gem')).toHaveCount(0)
})
