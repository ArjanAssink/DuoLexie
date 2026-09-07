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

async function swipeRight(page: Page) {
  const card = page.locator('.word-card')
  const b = (await card.boundingBox())!
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 180, cy, { steps: 8 })
  await page.mouse.up()
}

test('Flitsen: quitting during the last card flight credits nothing', async ({ page }) => {
  await page.goto(FLITSEN)
  await expect(page.locator('.kk-arena')).toBeVisible()

  const cards = parseInt(await page.locator('.kk-count').innerText(), 10)
  for (let i = 0; i < cards - 1; i++) {
    await page.locator('.kk-face-back').first().click()
    await page.waitForTimeout(480)
  }

  // tap ✕ inside the last card's 420ms flight
  await page.locator('.kk-face-back').first().click()
  await page.waitForTimeout(60)
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

test('Hardop lezen: quitting during the feedback delay credits nothing', async ({ page }) => {
  await page.goto(LEZEN)
  await expect(page.locator('.word-card')).toBeVisible()

  // clear all but the last word, so the next commit would otherwise complete the lesson
  const total = await page.locator('.word-card').count()
  expect(total).toBeGreaterThan(0)
  for (let i = 0; i < 20; i++) {
    const remaining = await page.locator('.word-card').count()
    if (remaining === 0) break
    // stop when this is the final card: the progress bar is at (n-1)/n
    const fill = await page.locator('.progress-fill').getAttribute('style')
    if (fill && /width:\s*(8[0-9]|9[0-9])(\.\d+)?%/.test(fill)) break
    await swipeRight(page)
    await page.waitForTimeout(700)
  }

  // swipe the last card, then quit inside commit()'s 320ms await
  await swipeRight(page)
  await page.waitForTimeout(80)
  await page.locator('.quit').click()

  await expect(page.locator('.coin-item').first()).toBeVisible()
  await page.waitForTimeout(1500)

  const after = await credited(page)
  expect(after.sessions, 'quitting mid-commit must not log a session').toBe(0)
  expect(after.gems).toBe(0)
})
