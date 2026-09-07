import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * A rejected play() used to leave commit() awaiting a promise that could never
 * resolve — the fallback speech ran, but the returned promise still waited on
 * the clip's `ended` event, which a clip that never played can never fire.
 * That hung Hardop lezen forever after any "nog even" swipe (audio.ts's
 * playWithFallback). This simulates the real trigger — iOS autoplay policy, or
 * an interrupting load's AbortError — with a genuinely playable clip and only
 * `play()` itself forced to reject, not the network layer.
 */

const LEZEN = '/#/les/fase1-m-s-k-r-t-l5'
// generated with: ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t 0.5 -b:a 64k silent.mp3
const SILENT_MP3 = readFileSync(fileURLToPath(new URL('./fixtures/silent.mp3', import.meta.url)))

test('a rejected play() falls back to speech instead of hanging the game', async ({ page }) => {
  await page.route('**/audio/words/*.mp3*', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/mpeg', body: SILENT_MP3 }),
  )
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException('simulated interruption', 'AbortError'))
  })

  await page.goto(LEZEN)
  const card = page.locator('.word-card')
  await expect(card).toBeVisible()
  const firstWord = await card.innerText()

  // "nog even" (left) is the branch that awaits playWord() for reinforcement —
  // the one the old code could hang inside. "goed" never calls it here.
  const b = (await card.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 - 200, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()

  // well past commit()'s normal ~570ms, and far short of playWithFallback's 8s backstop
  await expect(async () => {
    expect(await card.innerText()).not.toBe(firstWord)
  }).toPass({ timeout: 3000 })

  // and the game keeps accepting input afterwards, not just this one card
  await expect(card).toHaveCSS('opacity', '1')
})
