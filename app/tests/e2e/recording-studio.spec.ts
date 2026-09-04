import { test, expect } from '@playwright/test'

test.describe('recording studio auto-chain', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone'])
    // simulate every sound already having a take on disk — this is the exact
    // situation (redoing a bad batch) where the auto-chain used to silently
    // stop instead of advancing, because it only chained across *gaps*
    await page.route('**/audio/sounds/*.mp3', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([]) }),
    )
    // stub the File System Access directory picker — no real OS dialog in CI/headless
    await page.addInitScript(() => {
      ;(window as any).showDirectoryPicker = async () => ({
        name: 'fake-sounds-dir',
        async getFileHandle() {
          return {
            async createWritable() {
              return { async write() {}, async close() {} }
            },
          }
        },
      })
    })
  })

  test('stop-and-continue advances to the next sound and keeps recording, even when every sound already has a take', async ({ page }) => {
    await page.goto('/#/opnemen')
    await page.getByRole('button', { name: /Kies map/ }).click()
    await expect(page.getByText('Map gekozen')).toBeVisible()
    await expect(page.getByText('45/45 klanken opgenomen')).toBeVisible()

    const bigSound = page.locator('.big-sound')
    const firstSound = await bigSound.textContent()

    await page.getByRole('button', { name: '🔴 Opnemen' }).click()
    const primaryButton = page.getByRole('button', { name: /Klaar → volgende/ })
    await expect(primaryButton).toBeVisible()

    await primaryButton.click()

    // the chain should save the first take, move to the next sound, and
    // immediately start recording it again — no separate click needed
    await expect(page.getByRole('button', { name: /Klaar → volgende/ })).toBeVisible()
    await expect(bigSound).not.toHaveText(firstSound ?? '')
  })

  test('stoppen zonder door te gaan halts the chain without advancing', async ({ page }) => {
    await page.goto('/#/opnemen')
    await page.getByRole('button', { name: /Kies map/ }).click()
    await expect(page.getByText('Map gekozen')).toBeVisible()

    const bigSound = page.locator('.big-sound')
    const firstSound = await bigSound.textContent()

    await page.getByRole('button', { name: '🔴 Opnemen' }).click()
    await page.getByRole('button', { name: 'stoppen zonder door te gaan' }).click()

    await expect(page.getByRole('button', { name: '🔴 Opnemen' })).toBeVisible()
    await expect(bigSound).toHaveText(firstSound ?? '')
  })
})
