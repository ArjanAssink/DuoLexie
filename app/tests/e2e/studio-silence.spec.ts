import { test, expect } from '@playwright/test'
import { SILENT_WAV, fakeMicArgs } from './fixtures/fakeMic'

/**
 * §2.4, test 9, quiet half: *Meet de stilte* on a silent room.
 *
 * The noise floor is the number the splitter's silence threshold is derived from — it sits
 * about 12dB above it — so a floor at -45 puts the threshold where a Dutch final consonant
 * lives and the cut starts eating the end of every word. Measuring it takes two seconds and
 * can only be done before the take.
 */
test.use({ launchOptions: { args: fakeMicArgs(SILENT_WAV) } })

test('a silent room measures as stil, with no hum', async ({ page }) => {
  await page.context().grantPermissions(['microphone'])
  await page.route('**/__studio/**', (route) => route.fulfill({ status: 404, body: 'off' }))

  await page.goto('/#/opnemen')
  await expect(page.locator('.studio-cell-id').first()).toBeVisible()
  await page.getByRole('button', { name: /Meet de stilte/ }).click()

  await expect(page.locator('.studio-silence')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.studio-silence')).toContainText('stil — hier kun je opnemen')
  await expect(page.locator('.studio-hum')).toHaveCount(0)
})
