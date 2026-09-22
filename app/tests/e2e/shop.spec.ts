import { test, expect, type Page } from '@playwright/test'
import { skipOnboarding } from './fixtures/onboarded'
import { installGems } from './fixtures/profile'

/**
 * The winkel: five slots, thirty items, one wallet.
 *
 * What is worth a browser here is the money and the persistence — that a tap buys exactly
 * once, that the gems actually leave the balance, and that what she is wearing survives a
 * reload. Whether each item *looks* right is an eyes job, and whether every item has art at
 * all is already a unit test (src/components/accessories.test.ts).
 */
function readAvatar(page: Page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('duolexie')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('kv').objectStore('kv').get('duolexie-avatar')
          req.onsuccess = () => {
            const raw = req.result
            resolve(typeof raw === 'string' ? JSON.parse(raw) : null)
          }
          req.onerror = () => reject(req.error)
        }
      }),
  ) as Promise<{ state?: { config?: { equipped?: Record<string, string> } } } | null>
}

const equippedIn = (blob: Awaited<ReturnType<typeof readAvatar>>) =>
  blob?.state?.config?.equipped ?? {}

test('every slot has its own tab, and each tab has something to sell', async ({ page }) => {
  await skipOnboarding(page)
  await installGems(page, 500)
  await page.goto('/#/winkel')

  for (const tab of ['Bril', 'Op je hoofd', 'Oorbellen', 'Sjaals', 'Jassen']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.locator('.shop-item').first()).toBeVisible()
    expect(await page.locator('.shop-item').count()).toBeGreaterThan(2)
  }
})

test('buying a jas costs its gems once, and she is still wearing it after a reload', async ({
  page,
}) => {
  await skipOnboarding(page)
  await installGems(page, 100)
  await page.goto('/#/winkel')

  await page.getByRole('button', { name: 'Jassen', exact: true }).click()
  const hoodie = page.locator('.shop-item').filter({ hasText: 'Hoodie' })
  await hoodie.click()

  await expect(hoodie).toContainText('Gedragen')
  await expect(page.locator('.shop-gems')).toHaveText('60')

  // A second tap takes it off again — it must not charge for it twice.
  await hoodie.click()
  await expect(hoodie).toContainText('Dragen')
  await expect(page.locator('.shop-gems')).toHaveText('60')

  await hoodie.click()
  await expect
    .poll(async () => equippedIn(await readAvatar(page)).jas)
    .toBe('jas-hoodie')

  // The open tab is component state, so a reload lands back on the first one.
  await page.reload()
  await expect(page.locator('.shop-gems')).toHaveText('60')
  await page.getByRole('button', { name: 'Jassen', exact: true }).click()
  await expect(page.locator('.shop-item').filter({ hasText: 'Hoodie' })).toContainText('Gedragen')
})

test('an item she cannot afford does nothing at all', async ({ page }) => {
  await skipOnboarding(page)
  await installGems(page, 30)
  await page.goto('/#/winkel')

  await page.getByRole('button', { name: 'Jassen', exact: true }).click()
  const ruimtepak = page.locator('.shop-item').filter({ hasText: 'Ruimtepak' })
  await expect(ruimtepak).toBeDisabled()
  await ruimtepak.click({ force: true })

  await expect(page.locator('.shop-gems')).toHaveText('30')
  await expect
    .poll(async () => equippedIn(await readAvatar(page)).jas ?? null)
    .toBeNull()
})

test('a sjaal and a jas are worn together, each in its own slot', async ({ page }) => {
  await skipOnboarding(page)
  await installGems(page, 500)
  await page.goto('/#/winkel')

  await page.getByRole('button', { name: 'Sjaals', exact: true }).click()
  await page.locator('.shop-item').filter({ hasText: 'Regenboogsjaal' }).click()
  await page.getByRole('button', { name: 'Jassen', exact: true }).click()
  await page.locator('.shop-item').filter({ hasText: 'Spijkerjasje' }).click()

  await expect
    .poll(async () => equippedIn(await readAvatar(page)))
    .toMatchObject({ sjaal: 'sjaal-regenboog', jas: 'jas-spijker' })
})
