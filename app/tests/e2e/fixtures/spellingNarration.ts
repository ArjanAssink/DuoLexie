import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SpellingCurriculum } from '../../../../shared/src/types'

// the same half-second of silence the word and weetje fixtures serve; see fixtures/narration.ts
const SILENT_MP3 = readFileSync(fileURLToPath(new URL('./silent.mp3', import.meta.url)))

// Read rather than imported: Playwright's loader wants an `import ... with { type: 'json' }`
// attribute that the app's own Vite build does not use, and one spelling of this file's
// import is enough.
const curriculum = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../shared/curriculum/spelling.json', import.meta.url)),
    'utf8',
  ),
) as SpellingCurriculum

/**
 * Which tile is the right one for the stem on the card.
 *
 * A stem is unique inside a pair (the unit test over spelling.json pins that), and the
 * card shows nothing but the stem — so this is the whole of what a test needs to answer a
 * card on purpose rather than by luck.
 */
export function answersFor(pairId: string): Map<string, string> {
  return new Map(
    curriculum.words.filter((w) => w.pair === pairId).map((w) => [w.stem, w.ending]),
  )
}

export function langerFor(pairId: string): Map<string, string | null> {
  return new Map(
    curriculum.words.filter((w) => w.pair === pairId).map((w) => [w.stem, w.langer]),
  )
}

export function wordIdFor(pairId: string): Map<string, string> {
  return new Map(
    curriculum.words.filter((w) => w.pair === pairId).map((w) => [w.stem, w.wordId]),
  )
}

export function optionsFor(pairId: string): string[] {
  return curriculum.pairs.find((p) => p.id === pairId)!.options
}

export function ruleFor(pairId: string): string {
  return curriculum.pairs.find((p) => p.id === pairId)!.rule
}

/**
 * Makes Maak het woord af's narration fast and countable, on every engine.
 *
 * This is fixtures/narration.ts's trick pointed at two folders at once, and for the same
 * reason: `speechSynthesis.speak` cannot be patched in Playwright's WebKit driver, and the
 * real `speak()` there never fires `onend`, so a miss — which awaits the word *and* its
 * longer form — would sit out two six-second backstops before the next card dealt.
 *
 * Both folders have to go through one patch rather than two fixtures: there is a single
 * `HTMLMediaElement.prototype.play`, and a second init script wrapping the first would
 * hand `/audio/spelling/` clips to a handler that only knows about `/audio/words/`.
 *
 * What is recorded is `<folder>/<id>`, so a test can tell "the word was spoken" from "its
 * longer form was spoken" — which is the whole of what §4 and §5 are about.
 */
export async function installSpellingNarration(page: Page, clipMs = 60): Promise<void> {
  for (const folder of ['words', 'spelling']) {
    await page.route(`**/audio/${folder}/*.mp3*`, (route) =>
      route.fulfill({ status: 200, contentType: 'audio/mpeg', body: SILENT_MP3 }),
    )
  }
  await page.addInitScript((ms) => {
    const w = window as unknown as { __spoken: string[] }
    w.__spoken = []
    const realPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const match = /\/audio\/(words|spelling)\/([^/?]+)\.mp3/.exec(this.src ?? '')
      if (!match) return realPlay.call(this)
      w.__spoken.push(`${match[1]}/${decodeURIComponent(match[2])}`)
      setTimeout(() => this.dispatchEvent(new Event('ended')), ms)
      return Promise.resolve()
    }
  }, clipMs)
}

/** `words/hond`, `spelling/hond-langer`, `spelling/d-t-regel` — in the order they played. */
export function spoken(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)
}

export function clearSpoken(page: Page): Promise<void> {
  return page.evaluate(() => {
    ;(window as unknown as { __spoken: string[] }).__spoken = []
  })
}

/**
 * The opposite of `installSpellingNarration`: no clips, and a speech engine that accepts an
 * utterance and then never says another word about it.
 *
 * This is not a contrived case, it is **production**. `/audio/**` is a 404 on the live site
 * until the clips are put somewhere, so every word falls back to `utter()` — and `onend`
 * never fires on a device with no nl-NL voice installed, nor in Playwright's WebKit (see
 * the note in fixtures/narration.ts). The only thing that resolves an utterance there is
 * audio.ts's six-second backstop, and a verdict that awaits two of them in a row is a card
 * that sits on screen for fourteen seconds with nothing to press.
 */
export async function installDeadNarration(page: Page): Promise<void> {
  // `*/*.mp3*`, not `**`: a bare `audio/**` also matches the app's own src/audio/*.ts
  // modules in dev, and the page then never boots at all.
  await page.route('**/audio/*/*.mp3*', (route) =>
    route.fulfill({ status: 404, contentType: 'text/html', body: 'not found' }),
  )
  await page.addInitScript(() => {
    window.speechSynthesis.speak = () => {}
    window.speechSynthesis.cancel = () => {}
    window.speechSynthesis.getVoices = () => []
  })
}
