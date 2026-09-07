import { test, expect, type Page } from '@playwright/test'
import { installNarration } from './fixtures/narration'

/**
 * Unit ids are stable/sounds-derived (data/path.ts, backend-readiness A3):
 * l1 = Flitsen (card flip), l5 = Lezen (Hardop lezen). The first unit has no l5 —
 * vowels alone spell no words — so the swipe game comes from the second unit.
 */
const FLITSEN = '/#/les/fase1-a-e-o-u-i-l1'
const LEZEN = '/#/les/fase1-m-s-k-r-t-l5'

/** Mirrors FLY_MS in src/games/Flitsen.tsx — the flight's setTimeout. */
const FLITSEN_FLY_MS = 420
/**
 * Everything HardopLezen.commit() can possibly be waiting on after a wrong sort: the 420ms
 * flight to the pile, the 220ms landing, audio.ts's 8000ms CLIP_TIMEOUT_MS backstop on the
 * replayed word (its 6000ms speech backstop is shorter, so the clip figure is the bound),
 * the 250ms pause after it, and — since this is the round's last card — the 600ms closing
 * beat before onComplete. Advancing the clock past the sum proves no orphaned continuation
 * is left that could still credit the lesson later.
 */
const HARDOP_COMMIT_MAX_MS = 420 + 220 + 8000 + 250 + 600

/*
 * Why these tests drive a fake clock (page.clock)
 * ------------------------------------------------
 * "Quit mid-animation" means tapping ✕ while a game-side setTimeout is still pending:
 * Flitsen's 420ms flight timer, or the awaits inside HardopLezen.commit(). Earlier
 * versions of these tests raced that window in real time — first with guessed fixed
 * delays, then by polling for the observable state and clicking as fast as possible.
 * Both broke in CI on WebKit, where the round-trips for Playwright's own actionability
 * checks (visible, enabled, stable) could eat the whole ~400ms window: the timer fired,
 * the lesson completed, the screen unmounted, and the click hit a detached node and
 * timed out. Three consecutive red runs on main (43a46e6, b3dc39c, 20fe921) were this.
 *
 * With Playwright's clock installed, the page's setTimeout/setInterval/rAF are faked.
 * The clock keeps pace with real time while the game is played up to the last card, then
 * is paused right before the decisive action. From that moment the pending timer cannot
 * fire — however slow the runner or the engine — until the test explicitly advances the
 * clock. So "click quit while the flight is pending" is no longer a race we try to win;
 * it's the only possible order of events. Advancing the clock afterwards, past the
 * timer's due time, then proves the quit really did cancel it. CSS animations/transitions
 * are unaffected by the fake clock, so the visible state is still real.
 */

interface Credited {
  gems: number
  xp: number
  sessions: number
  lessons: number
}

/** Read the persisted progress blob straight out of IndexedDB. */
async function credited(page: Page): Promise<Credited> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('duolexie')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const raw = await new Promise<unknown>((res, rej) => {
      const r = db.transaction('kv').objectStore('kv').get('duolexie-progress')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as
      | { state?: Record<string, unknown> }
      | null
    const s = parsed?.state ?? {}
    return {
      gems: (s.gems as number) ?? 0,
      xp: (s.xp as number) ?? 0,
      sessions: ((s.sessions as unknown[]) ?? []).length,
      lessons: Object.keys((s.completedLessons as object) ?? {}).length,
    }
  })
}

/**
 * Freeze the page's timers. `pauseAt` needs a target at or after the fake clock's
 * current time (it throws on a target in the past), and the fake clock trails the
 * test's own wall clock by at most one ~100ms sync tick, so a small forward jump is
 * the safe way to say "pause now". The jump is far too short to trip anything
 * long-running in the games (e.g. Hardop lezen's 5000ms reading window).
 */
async function freezeTimers(page: Page) {
  await page.clock.pauseAt(Date.now() + 500)
}


test('Flitsen: quitting during the last card flight credits nothing', async ({ page }) => {
  await page.clock.install()
  await page.goto(FLITSEN)
  await expect(page.locator('.kk-arena')).toBeVisible()

  const cards = parseInt(await page.locator('.kk-count').innerText(), 10)
  for (let i = 0; i < cards - 1; i++) {
    await page.locator('.kk-face-back').first().click()
    await page.waitForTimeout(FLITSEN_FLY_MS + 60)
  }

  // Freeze time, then flip the last card: its flight timer is now scheduled but can't
  // fire. Quitting here is guaranteed to be mid-flight — no fixed delay to guess, no
  // poll to win, nothing for a slow WebKit runner to lose.
  await freezeTimers(page)
  await page.locator('.kk-face-back').first().click()
  await expect(page.locator('.kk-fly')).toHaveCount(1)
  await page.locator('.quit').click()

  await expect(page.locator('.coin-item').first()).toBeVisible() // back on the path

  // Now let the orphaned flight's deadline pass. If quit() failed to cancel the timer,
  // this is exactly when it would fire onComplete and credit the lesson.
  await page.clock.runFor(FLITSEN_FLY_MS * 2)
  await page.clock.resume()
  await page.waitForTimeout(500) // room for a (wrongly) triggered persist to land in IndexedDB

  expect(await credited(page), 'quitting must not credit a lesson').toMatchObject({
    gems: 0,
    xp: 0,
    sessions: 0,
    lessons: 0,
  })
  await expect(page.locator('.reward-screen')).toHaveCount(0)
  await expect(page.locator('.coin-item').first()).toBeVisible() // still on the path
})

test('Flitsen: finishing normally still credits exactly once', async ({ page }) => {
  await page.goto(FLITSEN)
  await expect(page.locator('.kk-arena')).toBeVisible()

  const cards = parseInt(await page.locator('.kk-count').innerText(), 10)
  for (let i = 0; i < cards; i++) {
    await page.locator('.kk-face-back').first().click()
    await page.waitForTimeout(480)
  }

  await expect(page.locator('.reward-screen')).toBeVisible()
  await page.waitForTimeout(400)

  const after = await credited(page)
  expect(after.sessions, 'exactly one session logged').toBe(1)
  expect(after.lessons).toBe(1)
  expect(after.gems).toBeGreaterThan(0)
  expect(after.xp).toBeGreaterThan(0)
})

function waitForPhase(page: Page, want: string, timeout = 15_000) {
  return page.waitForFunction(
    (p) => document.querySelector('.hardop-screen')?.getAttribute('data-phase') === p,
    want,
    { timeout },
  )
}

/** Reveal the current word, then sort it onto a pile. */
async function playCard(page: Page, verdict: 'goed' | 'nogEven') {
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)
  await page.locator(verdict === 'goed' ? '.pile-goed' : '.pile-nog-even').click()
}

test('Hardop lezen: quitting during the feedback delay credits nothing', async ({ page }) => {
  test.slow() // clears a full round bar the last card before the case under test
  await installNarration(page)
  await page.clock.install()
  await page.goto(LEZEN)
  await expect(page.locator('.word-card')).toBeVisible()

  // The round's length is on screen now: one pip per card. (It used to have to be derived
  // from how far a progress bar moved for one swipe, because nothing showed the total.)
  const total = await page.locator('.pip').count()
  expect(total).toBeGreaterThanOrEqual(2)

  // clear every word but the last
  for (let done = 0; done < total - 1; done++) {
    await playCard(page, 'goed')
    await expect.poll(() => page.locator('.pip-done').count(), { timeout: 6000 }).toBe(done + 1)
  }
  await expect(page.locator('.word-card')).toBeVisible()

  // Bring the last card to the point where it can be graded *before* freezing anything:
  // getting there means hearing the word, and narration finishing is itself a timer.
  await waitForPhase(page, 'reading')
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)

  // Now freeze time and sort it WRONG ("nog even"). commit() runs up to its first
  // `await wait(FLY_MS)` and parks there: the card is flying out (a CSS animation, which
  // the fake clock doesn't touch), the answer is recorded, and the continuation that would
  // replay the word and call onComplete cannot run until the clock moves. That is the
  // "quit during the feedback delay" state, held open for as long as the test needs it.
  // The miss branch is the dangerous one — it's the only path that awaits audio before
  // finishing — which is why it's the one under test.
  await freezeTimers(page)
  await page.locator('.pile-nog-even').click()
  await expect(page.locator('.word-card')).toHaveCSS('opacity', '0')
  await page.locator('.quit').click()

  await expect(page.locator('.coin-item').first()).toBeVisible()

  // Advance past every await commit() could still be sitting on. If quit() failed to
  // cancel, the continuation resumes here, logs the session and credits the lesson.
  await page.clock.runFor(HARDOP_COMMIT_MAX_MS + 100)
  await page.clock.resume()
  /*
   * Then wait in REAL time, generously. Advancing the fake clock is not enough to let the
   * orphaned continuation run to completion here, because the rest of commit()'s chain is
   * not all timers: after the flight it awaits playWord(), which parks on a real media
   * event (no word mp3s exist, so the <audio> element has to actually load and fail), and
   * only then schedules its last two waits — 250ms and the 600ms closing beat — which are
   * now in resumed, real time. About 1.2s in total.
   *
   * This matters more than it looks. With 500ms here — the figure the Flitsen test above
   * can afford, its chain being a single timer — this test passed even with the
   * cancellation stripped out of the game entirely: the wrongful credit simply happened
   * after the assertions had already run. Re-verified in both directions at 2500ms:
   * fails (sessions 0->1, gems 0->13) with cancellation stripped, passes with it restored.
   */
  await page.waitForTimeout(2500)

  const after = await credited(page)
  expect(after.sessions, 'quitting mid-commit must not log a session').toBe(0)
  expect(after.gems).toBe(0)
  await expect(page.locator('.reward-screen')).toHaveCount(0)
})

test('Hardop lezen: finishing the round credits exactly one session', async ({ page }) => {
  test.slow() // a full ten-card round
  await installNarration(page)
  await page.goto(LEZEN)
  await expect(page.locator('.word-card')).toBeVisible()

  const total = await page.locator('.pip').count()
  for (let done = 0; done < total; done++) {
    await playCard(page, 'goed')
  }

  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 8000 })
  await page.waitForTimeout(2500) // let the gem count-up finish

  const after = await credited(page)
  expect(after.sessions, 'exactly one session logged').toBe(1)
  expect(after.lessons).toBe(1)
  // 5 for finishing + 1 per correct word, all correct here
  expect(after.gems).toBe(5 + total + 3)
})
