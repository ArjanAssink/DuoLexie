import { test, expect } from '@playwright/test'
import { HUM_WAV, fakeMicArgs } from './fixtures/fakeMic'

/**
 * §2.4, test 9, loud half: 50Hz mains hum.
 *
 * Its own spec because a microphone is a launch flag and Playwright only takes those per
 * file. The fixture is a 50Hz tone over a quiet floor, which is what a bad cable, a cheap USB
 * supply or a dimmer on the same circuit sounds like — and what the decode high-pass can only
 * take 6.8dB off, since reaching further down would cost a voice its own fundamental. The
 * answer to hum is not to record it, and this is what says so in time.
 */
test.use({ launchOptions: { args: fakeMicArgs(HUM_WAV) } })

test('50 Hz over a quiet floor is reported as brom', async ({ page }) => {
  await page.context().grantPermissions(['microphone'])
  await page.route('**/__studio/**', (route) => route.fulfill({ status: 404, body: 'off' }))

  await page.goto('/#/opnemen')
  await expect(page.locator('.studio-cell-id').first()).toBeVisible()
  await page.getByRole('button', { name: /Meet de stilte/ }).click()

  await expect(page.locator('.studio-hum')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.studio-hum')).toContainText('brom — kabel, USB-voeding, dimmer?')
  await expect(page.locator('.studio-hum')).toContainText('50 Hz')
})
