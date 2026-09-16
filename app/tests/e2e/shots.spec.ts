import { test, expect, type Page } from '@playwright/test'
import { skipOnboarding } from './fixtures/onboarded'
import { installCollected, installWeetjeNarration } from './fixtures/weetjesNarration'

/**
 * Not a test: the screenshots for the pull request (docs/weetjes.md §10), three beats × three
 * card types × three widths, plus the Weetjesboek.
 *
 * It lives behind `SHOTS=1` because it writes files into docs/media/ and asserts nothing —
 * `npm run test:e2e` must not produce a diff. Run it with:
 *
 *   SHOTS=1 npx playwright test shots.spec.ts --project=desktop
 */
const NODE = '/#/les/fase1-a-e-o-u-i-weetje'
const OUT = '../docs/media/weetjes'

/** The collection that puts a card of each type first in the deck (see weetjes.spec.ts). */
const BEFORE: Record<string, string[]> = {
  'waar-niet-waar': [],
  wie: ['niet-alleen', 'slim'],
  kies: ['niet-alleen', 'slim', 'spiderman', 'ogen', 'kok', 'extra-tijd', 'legolas'],
}

const WIDTHS = [375, 820, 1280]

function beat(page: Page, want: string) {
  return page.waitForFunction(
    (b) => document.querySelector('.weetje-screen')?.getAttribute('data-beat') === b,
    want,
    { timeout: 15_000 },
  )
}

async function verder(page: Page) {
  await expect(page.locator('.weetje-verder')).toBeEnabled({ timeout: 15_000 })
  await page.locator('.weetje-verder').click()
}

test.skip(!process.env.SHOTS, 'screenshot run only; set SHOTS=1')

for (const [type, collected] of Object.entries(BEFORE)) {
  for (const width of WIDTHS) {
    test(`shots: ${type} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 375 ? 667 : 900 })
      await installWeetjeNarration(page)
      await skipOnboarding(page)
      if (collected.length) await installCollected(page, collected)
      await page.goto(NODE)

      await beat(page, 'luister')
      await page.waitForTimeout(500) // let the screen-enter animation settle
      await page.screenshot({ path: `${OUT}/${type}-1-luister-${width}.png` })
      await verder(page)

      await beat(page, 'doe')
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${OUT}/${type}-2-doe-${width}.png` })

      if (type === 'waar-niet-waar') await page.locator('.weetje-label-niet').click()
      else await page.locator('.weetje-option').first().click()

      await beat(page, 'bewaar')
      await page.waitForTimeout(900) // through the flight, so the book shows its new count
      await page.screenshot({ path: `${OUT}/${type}-3-bewaar-${width}.png` })
    })
  }
}

for (const width of WIDTHS) {
  test(`shots: weetjesboek at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 900 })
    await installWeetjeNarration(page)
    await skipOnboarding(page)
    await installCollected(page, ['niet-alleen', 'slim', 'spiderman', 'ogen', 'kok'])
    await page.goto('/#/weetjes')
    await expect(page.locator('.weetjesboek-card').first()).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/weetjesboek-${width}.png` })
  })
}

test('shots: weetjesboek open card', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await installWeetjeNarration(page)
  await skipOnboarding(page)
  await installCollected(page, ['niet-alleen', 'slim', 'spiderman', 'ogen', 'kok'])
  await page.goto('/#/weetjes')
  await page.locator('.weetjesboek-card:not(.facedown)').first().click()
  await expect(page.locator('.weetjesboek-open')).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/weetjesboek-open-375.png` })
})

/**
 * The celebration after a round (docs/reward-celebration.md §10). Driven from the
 * probeermenu's preview rather than by playing a round, for the same reason its tests are.
 */
const REWARD_OUT = '../docs/media/reward-celebration'

for (const width of WIDTHS) {
  test(`shots: beloning done at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 900 })
    await page.goto('/#/beloning?goed=6&totaal=10')
    await page.waitForFunction(
      () => document.querySelector('.reward-screen')?.getAttribute('data-beat') === 'done',
      undefined,
      { timeout: 15_000 },
    )
    await page.waitForTimeout(2200) // let the gem count-up finish
    await page.screenshot({ path: `${REWARD_OUT}/done-${width}.png` })
  })
}

test('shots: weetjesboek empty', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await skipOnboarding(page)
  await page.goto('/#/weetjes')
  await expect(page.locator('.weetjesboek-empty')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/weetjesboek-leeg-375.png` })
})
