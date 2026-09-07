import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// generated with: ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t 0.5 -b:a 64k silent.mp3
const SILENT_MP3 = readFileSync(fileURLToPath(new URL('./silent.mp3', import.meta.url)))

/**
 * Makes Hardop lezen's word narration fast and countable, on every engine.
 *
 * Hardop lezen gates grading on having heard the word, so a test has to know when narration
 * happened — and it must not take seconds per card.
 *
 * **Why this works and patching speech didn't.** The obvious approach is to replace
 * `speechSynthesis.speak` and count the utterances. It does not take effect in Playwright's
 * WebKit driver: not as a delegating wrapper (the original attempt), and not as an outright
 * replacement of the method either (the second attempt — CI came back with ten failures, an
 * empty utterance list on every ipad and iphone run). Worse, the real `speak()` there never
 * fires `onend`, so the app correctly waited out audio.ts's 6s SPEECH_TIMEOUT_MS on every
 * single card and two ten-card tests ran out of budget.
 *
 * So this observes the clip path instead, which the same CI run proved does work under
 * WebKit — audio-fallback.spec.ts's route and its `HTMLMediaElement.prototype.play` patch
 * both took effect there:
 *
 * 1. `/audio/words/*.mp3` is served a real (silent) mp3, so `loadWordClip` resolves an
 *    element instead of falling back to speech.
 * 2. `HTMLMediaElement.prototype.play` — an ordinary prototype method, reliably patchable —
 *    records the word and synthesises the `ended` event after `clipMs`. That resolves
 *    `playWithFallback` without depending on real decoding, autoplay policy, or a voice
 *    being installed on the runner.
 *
 * It also means the tests exercise the path production will actually use once the family
 * recordings exist, rather than the TTS fallback.
 */
export async function installNarration(page: Page, clipMs = 80): Promise<void> {
  await page.route('**/audio/words/*.mp3*', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/mpeg', body: SILENT_MP3 }),
  )
  await page.addInitScript((ms) => {
    const w = window as unknown as { __narrated: string[] }
    w.__narrated = []
    const realPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const match = /\/audio\/words\/([^/?]+)\.mp3/.exec(this.src ?? '')
      if (!match) return realPlay.call(this)
      w.__narrated.push(decodeURIComponent(match[1]))
      setTimeout(() => this.dispatchEvent(new Event('ended')), ms)
      return Promise.resolve()
    }
  }, clipMs)
}

/** The words narrated so far, in order — one entry per time the word was played. */
export function narrated(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __narrated: string[] }).__narrated)
}
