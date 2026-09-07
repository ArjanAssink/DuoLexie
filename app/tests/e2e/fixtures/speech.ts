import type { Page } from '@playwright/test'

/**
 * Replaces `speechSynthesis.speak` with a fake that records what was said and ends the
 * utterance promptly.
 *
 * Two reasons this is needed rather than nice to have:
 *
 * 1. **Speed.** Neither test browser has an nl-NL voice installed, so the real `speak()`
 *    never fires `onend` and audio.ts falls back to its 6s SPEECH_TIMEOUT_MS. Hardop lezen
 *    waits for narration before a card can be graded, so a ten-card round would spend a
 *    minute in that backstop.
 * 2. **Observability.** A wrapper that *delegates* to the real `speak()` proved unable to
 *    observe the app's own calls in Playwright's WebKit driver (see the note this replaces
 *    in reading-window.spec.ts). Replacing the method outright leaves no other
 *    implementation to reach, so what the app says is visible in both engines.
 */
export async function installFakeSpeech(page: Page, utteranceMs = 60): Promise<void> {
  await page.addInitScript((ms) => {
    const w = window as unknown as { __spoke: string[] }
    w.__spoke = []
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      synth.speak = (u: SpeechSynthesisUtterance) => {
        w.__spoke.push(u.text)
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), ms)
      }
      synth.cancel = () => {}
    } catch {
      // an engine that exposes no patchable speechSynthesis — nothing to install
    }
  }, utteranceMs)
}

/** Everything the app has said so far, in order. */
export function spoken(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __spoke: string[] }).__spoke)
}
