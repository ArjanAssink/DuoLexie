import { test, expect, type Page } from '@playwright/test'

/**
 * Unit ids are stable/sounds-derived (data/path.ts, backend-readiness A3):
 * l1 = Flitsen (card flip), l5 = Lezen (Hardop lezen). The first unit has no l5 —
 * vowels alone spell no words — so the swipe game comes from the second unit.
 */
const FLITSEN = '/#/les/fase1-a-e-o-u-i-l1'
const LEZEN = '/#/les/fase1-m-s-k-r-t-l5'

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
 * Polls the card's live computed opacity in-page, rather than `expect(locator)
 * .toHaveCSS(...)`: that assertion consistently failed to observe an opacity
 * that a plain `getComputedStyle` poll (this function) catches reliably and
 * repeatedly — confirmed by sampling every 50ms through the whole transition,
 * which shows a real ~170ms window where it's genuinely `0` before rebounding.
 * Whatever internal sampling `toHaveCSS` uses evidently isn't reading the same
 * live value at the same cadence for a fast CSS transition like this one.
 */
async function waitForOpacity(page: Page, target: string, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const opacity = await page
      .locator('.word-card')
      .evaluate((el) => getComputedStyle(el).opacity)
      .catch(() => null)
    if (opacity === target) return
    await page.waitForTimeout(20)
  }
  throw new Error(`.word-card opacity never reached "${target}" within ${timeoutMs}ms`)
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
  await page.goto(FLITSEN)
  await expect(page.locator('.kk-arena')).toBeVisible()

  const cards = parseInt(await page.locator('.kk-count').innerText(), 10)
  for (let i = 0; i < cards - 1; i++) {
    await page.locator('.kk-face-back').first().click()
    await page.waitForTimeout(480)
  }

  // Click the last card, then quit while ITS flight is still visibly in progress.
  // Waiting for .kk-fly to actually appear — rather than assuming a fixed 60ms
  // delay lands inside the 420ms flight — removes a race that showed up as
  // flakiness under CI/WebKit timing (the identical assumption, on unrelated
  // unchanged code, passed one run and failed the next): however fast or slow
  // the browser is, quitting right after the flight becomes visible is always
  // "mid-flight", never "before" or "after" it.
  await page.locator('.kk-face-back').first().click()
  await expect(page.locator('.kk-fly')).toBeVisible()
  await page.locator('.quit').click()

  await expect(page.locator('.coin-item').first()).toBeVisible() // back on the path
  await page.waitForTimeout(1200) // well past when the orphaned flight would have fired

  expect(await credited(page), 'quitting must not credit a lesson').toMatchObject({
    gems: 0,
    xp: 0,
    sessions: 0,
    lessons: 0,
  })
  await expect(page.locator('.reward-screen')).toHaveCount(0)
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

  // Swipe the last card WRONG ("nog even"), then quit while its opacity:0 flight-out
  // is visibly in progress. This is the actual danger case the backlog names —
  // commit()'s only-on-a-miss branch replays the word before it finishes, which is
  // why quitting there is worth a dedicated test — and it also sidesteps a razor-
  // thin race a correct swipe has here: for "goed", the fade-out duration and the
  // flying-state duration are both exactly 320ms, so opacity is only ever truly 0
  // for an instant before flipping straight back; for "nog even" the reinforcement
  // playback holds it at 0 for several hundred ms more, giving a real window to
  // observe (the same "wait for observable state, not a guessed delay" fix as the
  // Flitsen test above, and for the same reason: CI/WebKit timing variance made a
  // fixed-ms guess occasionally land after the window instead of inside it).
  await swipe(page, 'left')
  await waitForOpacity(page, '0')
  await page.locator('.quit').click()

  await expect(page.locator('.coin-item').first()).toBeVisible()
  await page.waitForTimeout(1500)

  const after = await credited(page)
  expect(after.sessions, 'quitting mid-commit must not log a session').toBe(0)
  expect(after.gems).toBe(0)
})
