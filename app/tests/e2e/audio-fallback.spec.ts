import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * A rejected play() used to leave the caller awaiting a promise that could never resolve —
 * the fallback speech ran, but the returned promise still waited on the clip's `ended`
 * event, which a clip that never played can never fire (audio.ts's playWithFallback). This
 * simulates the real trigger — iOS autoplay policy, or an interrupting load's AbortError —
 * with a genuinely playable clip and only `play()` itself forced to reject, not the network
 * layer.
 *
 * The rework raised the stakes: Hardop lezen now waits for narration *before* a card can be
 * graded at all, so a promise that never resolves no longer merely delays the next card, it
 * leaves the round permanently unfinishable. The phase attribute is the sharpest possible
 * assertion for that — it only advances if the audio promise resolved.
 *
 * Deliberately the one spec that does *not* use the narration fixture: that fixture makes
 * `play()` succeed, which is the opposite of the case under test. It also means the fallback
 * here is real browser speech, which on a runner with no nl-NL voice never fires `onend` and
 * leans on audio.ts's 6s SPEECH_TIMEOUT_MS instead — so the waits below have to clear that,
 * and are sized for it rather than for the ~1s a speaking engine would take. Whether the
 * word was audibly spoken is not asserted: patching speechSynthesis to find out does not
 * take effect under WebKit (see fixtures/narration.ts), and "the game did not hang" is the
 * property this test exists for.
 */

const LEZEN = '/#/les/fase1-m-s-k-r-t-l5'
// generated with: ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t 0.5 -b:a 64k silent.mp3
const SILENT_MP3 = readFileSync(fileURLToPath(new URL('./fixtures/silent.mp3', import.meta.url)))

/** Comfortably past audio.ts's 6s speech backstop, the slowest way this can resolve. */
const FALLBACK_MAX_MS = 10_000

test('a rejected play() falls back to speech instead of hanging the game', async ({ page }) => {
  test.slow() // every narration here waits out the 6s speech backstop
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
  const firstWord = await page.locator('.word-text').innerText()

  await page.locator('.reveal-btn').click()

  // The fallback has to actually let go of the caller: without that, the card never becomes
  // gradeable and the phase stays on "listening" forever.
  await page.waitForFunction(
    () => document.querySelector('.hardop-screen')?.getAttribute('data-phase') === 'judging',
    null,
    { timeout: FALLBACK_MAX_MS },
  )

  // "nog even" awaits playWord a second time, for reinforcement — the same hang, again
  await page.locator('.pile-nog-even').click()
  await expect
    .poll(() => page.locator('.word-text').innerText(), { timeout: FALLBACK_MAX_MS + 5_000 })
    .not.toBe(firstWord)

  // and the game keeps accepting input afterwards, not just this one card
  await expect(card).toHaveCSS('opacity', '1')
})
