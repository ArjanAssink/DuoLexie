import { test, expect, type Page } from '@playwright/test'
import { installFakeSpeech } from './fixtures/speech'

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
  await installFakeSpeech(page)
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

  // Sort the last card WRONG ("nog even"), then quit while its flight-out is visibly in
  // progress. This is the danger case the backlog names — commit()'s only-on-a-miss branch
  // replays the word before it finishes, which is why quitting there is worth a dedicated
  // test — and it also sidesteps a razor-thin race a correct sort has here: "goed" is only
  // held past the flight by its short landing beat, while "nog even" holds the card
  // invisible for several hundred ms more, giving a real window to observe. (Same "wait for
  // observable state, not a guessed delay" rule as the Flitsen test above.)
  await playCard(page, 'nogEven')
  await waitForOpacity(page, '0')
  await page.locator('.quit').click()

  await expect(page.locator('.coin-item').first()).toBeVisible()
  await page.waitForTimeout(1500)

  const after = await credited(page)
  expect(after.sessions, 'quitting mid-commit must not log a session').toBe(0)
  expect(after.gems).toBe(0)
  await expect(page.locator('.reward-screen')).toHaveCount(0)
})

test('Hardop lezen: finishing the round credits exactly one session', async ({ page }) => {
  test.slow() // a full ten-card round
  await installFakeSpeech(page)
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
