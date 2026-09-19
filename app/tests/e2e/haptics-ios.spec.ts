import { test, expect } from '@playwright/test'

/**
 * The iOS haptic path (docs/haptics.md): with no `navigator.vibrate`, a buzz is played as a
 * run of clicks on a hidden `<input type="checkbox" switch>` label. No browser here has the
 * Taptic Engine, so what is checked is the door being knocked on: the switch exists, the
 * clicks land on it, and there are as many of them as the pattern says.
 *
 * On Chromium the switch property is shimmed onto the input prototype (and vibrate removed)
 * so the detection takes the iOS branch; on WebKit both are already the case natively, so
 * the ipad/iphone CI projects run the real detection.
 */
const REWARD = '/#/beloning?goed=8&totaal=10'
/** tickOffsets([40, 50, 60, 50, 240]) — the hero buzz as ticks, see haptics.test.ts */
const HERO_TICKS = 6

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'vibrate', { value: undefined, configurable: true })
    if (!('switch' in document.createElement('input'))) {
      Object.defineProperty(HTMLInputElement.prototype, 'switch', {
        value: false,
        writable: true,
        configurable: true,
      })
    }
    const w = window as unknown as { __switchClicks: number }
    w.__switchClicks = 0
    document.addEventListener(
      'click',
      (e) => {
        if ((e.target as Element).matches?.('input[type="checkbox"][switch]')) w.__switchClicks++
      },
      true,
    )
  })
})

const clicks = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __switchClicks: number }).__switchClicks)

test('the test menu reports the iOS switch path and a sample buzz clicks the switch', async ({ page }) => {
  await page.goto('/#/proberen')
  await expect(page.locator('[data-haptic-backend]')).toHaveAttribute('data-haptic-backend', 'ios-switch')
  await page.getByRole('button', { name: 'Tikje (kaart draait om)' }).click()
  await expect.poll(() => clicks(page)).toBe(1)
  await expect(page.locator('input[type="checkbox"][switch]')).toHaveCount(1)
})

test('the celebration buzz becomes a rattle of switch ticks', async ({ page }) => {
  await page.goto(REWARD)
  await expect(page.locator('.reward-screen')).toBeVisible()
  await page.waitForFunction(
    () => document.querySelector('.reward-screen')?.getAttribute('data-beat') === 'card',
    null,
    { timeout: 8000 },
  )
  expect(await clicks(page)).toBe(HERO_TICKS)
})
