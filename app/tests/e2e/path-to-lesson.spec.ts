import { test, expect } from '@playwright/test'

test('clicking the active lesson coin opens the game', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')

  const activeCoin = page.locator('.coin-item.active .coin')
  await expect(activeCoin).toBeVisible()
  await expect(activeCoin).toBeEnabled()

  await activeCoin.click()

  await expect(page).toHaveURL(/#\/les\//)
  await expect(page.locator('.game-screen')).toBeVisible()

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([])
})

test('the first lesson is Klankkaarten and flipping the deck lands a card', async ({ page }) => {
  await page.goto('/')
  await page.locator('.coin-item.active .coin').click()

  const deckButton = page.locator('.kk-stack-wrap').first().locator('.kk-face-back')
  await expect(deckButton).toBeVisible()
  await deckButton.click()
  // flipping should land a card face-up in the discard pile, not do nothing
  await expect(page.locator('.kk-stack-wrap').nth(1).locator('.kk-face-front')).toBeVisible()
})

test('the recorded clip plays instead of falling back to TTS', async ({ page }) => {
  const requestedUrls: string[] = []
  page.on('response', (res) => {
    if (res.url().includes('/audio/sounds/')) requestedUrls.push(`${res.status()} ${res.url()}`)
  })

  await page.goto('/')
  await page.locator('.coin-item.active .coin').click()
  await page.locator('.kk-stack-wrap').first().locator('.kk-face-back').click()

  // the card lands ~420ms after the tap and plays its sound then; give the <audio> a moment to request it.
  // <audio> issues range requests, so a successful load is 200 or 206, never a fallback 404.
  await expect.poll(() => requestedUrls.length).toBeGreaterThan(0)
  const ok = requestedUrls.every((u) => /^(200|206) .*\/audio\/sounds\/[a-z]+\.mp3/.test(u))
  expect(ok, requestedUrls.join('\n')).toBe(true)
})
