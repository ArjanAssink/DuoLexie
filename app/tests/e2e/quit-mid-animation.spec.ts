import { test, expect, type Page } from '@playwright/test'

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
 * Everything HardopLezen.commit() can possibly be waiting on after a wrong swipe:
 * its 320ms fly-out, audio.ts's 8000ms CLIP_TIMEOUT_MS backstop on the replayed
 * word, and the 250ms pause after it. Advancing the clock past the sum proves that
 * no orphaned continuation is left that could still credit the lesson later.
 */
const HARDOP_COMMIT_MAX_MS = 320 + 8000 + 250

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

async function swipe(page: Page, direction: 'left' | 'right') {
  const card = page.locator('.word-card')
  const b = (await card.boundingBox())!
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + (direction === 'right' ? 180 : -180), cy, { steps: 8 })
  await page.mouse.up()
}
const swipeRight = (page: Page) => swipe(page, 'right')

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

async function progressFraction(page: Page): Promise<number> {
  return page.locator('.progress-fill').evaluate((el) => {
    const m = /matrix\(([^,]+),/.exec(getComputedStyle(el).transform)
    return m ? parseFloat(m[1]) : 0
  })
}

test('Hardop lezen: quitting during the feedback delay credits nothing', async ({ page }) => {
  await page.clock.install()
  await page.goto(LEZEN)
  await expect(page.locator('.word-card')).toBeVisible()

  // The lesson's word count isn't shown anywhere in the UI, and hardcoding a
  // percentage threshold to detect "one card left" breaks for shorter lessons
  // (e.g. total=4 never crosses 80%). Swipe once, then derive the exact total
  // from how far the bar moved for that one card (each swipe advances it by
  // exactly 1/total) — this works regardless of the lesson's actual length.
  await swipeRight(page)
  await page.waitForTimeout(700)
  const total = Math.round(1 / (await progressFraction(page)))
  expect(total).toBeGreaterThanOrEqual(2)

  // clear every word but the last (1 already done above)
  for (let done = 1; done < total - 1; done++) {
    await expect(page.locator('.word-card')).toBeVisible()
    await swipeRight(page)
    await page.waitForTimeout(700)
  }

  // exactly one card must remain (precision 2: getComputedStyle's matrix() string
  // is rounded, e.g. 0.799219 for an exact 0.8 — this only needs to catch a real
  // miscount, which would be off by a whole 1/total, far more than 0.005)
  await expect(page.locator('.word-card')).toBeVisible()
  expect(await progressFraction(page)).toBeCloseTo((total - 1) / total, 2)

  // Freeze time, then swipe the last card WRONG ("nog even"). commit() runs up to its
  // first `await setTimeout(320)` and parks there: the card is flying out (opacity 0,
  // a real CSS transition the fake clock doesn't touch), the answer is recorded, and
  // the continuation that would replay the word and call onComplete cannot run until
  // the clock moves. That is the "quit during the feedback delay" state, held open for
  // as long as the test needs it. The miss branch is the dangerous one — it's the only
  // path that awaits audio before finishing — which is why it's the one under test.
  await freezeTimers(page)
  await swipe(page, 'left')
  await expect(page.locator('.word-card')).toHaveCSS('opacity', '0')
  await page.locator('.quit').click()

  await expect(page.locator('.coin-item').first()).toBeVisible()

  // Advance past every await commit() could still be sitting on. If quit() failed to
  // cancel, the continuation resumes here, logs the session and credits the lesson.
  await page.clock.runFor(HARDOP_COMMIT_MAX_MS + 100)
  await page.clock.resume()
  await page.waitForTimeout(500) // room for a (wrongly) triggered persist to land in IndexedDB

  const after = await credited(page)
  expect(after.sessions, 'quitting mid-commit must not log a session').toBe(0)
  expect(after.gems).toBe(0)
  await expect(page.locator('.reward-screen')).toHaveCount(0)
})
