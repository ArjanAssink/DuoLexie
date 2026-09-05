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

// The "recorded clip plays instead of falling back to TTS" regression test used to live
// here, against Klankkaarten's card-landing sound. That narration was removed by request,
// and no other lesson currently auto-plays klank audio (Flitsen and Klankkaarten are both
// silent by design; Hardop lezen plays *word* audio, a separate code path). Re-add this
// test once a klank-audio game exists again (Welke klank? / Woordbouwer, plan.md Phase 2).
