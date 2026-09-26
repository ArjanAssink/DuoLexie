import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// the same half-second of silence the word fixture serves; see fixtures/narration.ts
const SILENT_MP3 = readFileSync(fileURLToPath(new URL('./silent.mp3', import.meta.url)))

/**
 * Makes the Weetjes narration fast and countable, on every engine.
 *
 * A Weetje beat gates *Verder* on having been read aloud, so a test has to know when the
 * narration happened and it must not take three real seconds per beat.
 *
 * This is fixtures/narration.ts's trick, pointed at the other folder, and for the same
 * reason: `speechSynthesis.speak` cannot be patched in Playwright's WebKit driver — not as a
 * wrapper and not as an outright replacement — and the real `speak()` there never fires
 * `onend`, so the app would correctly sit out audio.ts's 6s SPEECH_TIMEOUT_MS on every
 * single beat. Serving a real (silent) mp3 makes `loadWeetjeClip` resolve an element instead
 * of falling back to speech, and patching `HTMLMediaElement.prototype.play` — an ordinary
 * prototype method, reliably patchable — synthesises the `ended` event that resolves it.
 *
 * It also means the tests drive the path production will actually use once Arjan's
 * recordings exist, rather than the TTS fallback.
 */
export async function installWeetjeNarration(page: Page, clipMs = 60): Promise<void> {
  await page.route('**/audio/weetjes/*.mp3*', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/mpeg', body: SILENT_MP3 }),
  )
  await page.addInitScript((ms) => {
    const w = window as unknown as { __weetjeNarrated: string[] }
    w.__weetjeNarrated = []
    const realPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const match = /\/audio\/weetjes\/([^/?]+)\.mp3/.exec(this.src ?? '')
      if (!match) return realPlay.call(this)
      w.__weetjeNarrated.push(decodeURIComponent(match[1]))
      setTimeout(() => this.dispatchEvent(new Event('ended')), ms)
      return Promise.resolve()
    }
  }, clipMs)
}

/** The clip ids narrated so far, in order — one entry per time the beat was read. */
export function weetjeNarrated(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __weetjeNarrated: string[] }).__weetjeNarrated,
  )
}

/**
 * Turn auto-read off before the app boots (docs/weetjes.md §7).
 *
 * Merged into whatever is already stored rather than written blind, so it composes with
 * skipOnboarding's flag in the same blob — the two run in either order.
 */
export async function installAutoReadOff(page: Page): Promise<void> {
  await page.addInitScript(
    ({ dbName, store, key, version }) => {
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(store)
      req.onsuccess = () => {
        const objectStore = req.result.transaction(store, 'readwrite').objectStore(store)
        const read = objectStore.get(key)
        read.onsuccess = () => {
          const existing = typeof read.result === 'string' ? JSON.parse(read.result) : null
          objectStore.put(
            JSON.stringify({
              ...existing,
              state: {
                ...existing?.state,
                settings: { ...existing?.state?.settings, autoRead: false },
              },
              version,
            }),
            key,
          )
        }
      }
    },
    { dbName: 'duolexie', store: 'kv', key: 'duolexie-progress', version: 5 },
  )
}

/**
 * Start the test with a profile that has already kept `ids`.
 *
 * Which two cards a node deals is decided by what she has already collected
 * (docs/weetjes.md §5), so this is how a test picks the card type it is about: seeding the
 * first two cards deals the third and fourth, and so on. Merged, not written blind, for the
 * same reason as installAutoReadOff.
 */
export async function installCollected(page: Page, ids: string[]): Promise<void> {
  await page.addInitScript(
    ({ dbName, store, key, version, collected }) => {
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(store)
      req.onsuccess = () => {
        const objectStore = req.result.transaction(store, 'readwrite').objectStore(store)
        const read = objectStore.get(key)
        read.onsuccess = () => {
          const existing = typeof read.result === 'string' ? JSON.parse(read.result) : null
          objectStore.put(
            JSON.stringify({
              ...existing,
              state: { ...existing?.state, collectedWeetjes: collected },
              version,
            }),
            key,
          )
        }
      }
    },
    { dbName: 'duolexie', store: 'kv', key: 'duolexie-progress', version: 5, collected: ids },
  )
}

/**
 * Record which WebAudio effect was played, so a test can prove there was a `ding` — and,
 * more importantly, that there was never a failure sound (docs/weetjes.md §9).
 *
 * audio.ts's `playEffect` builds every sound out of oscillators, so the oscillator's wave
 * type and its first frequency identify it: `ding` is a sine at 984Hz (1046.5 × 0.94, the
 * little upward glide that makes it a bell rather than a beep), `pop` a sine at 440,
 * `bad` a triangle at 220 and `fart` a sawtooth at 150.
 */
export async function installEffectSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __effects: { type: string; hz: number }[] }
    w.__effects = []
    const Ctor = window.AudioContext
    if (!Ctor) return
    const realCreate = Ctor.prototype.createOscillator
    Ctor.prototype.createOscillator = function (this: AudioContext) {
      const osc = realCreate.call(this)
      let first: number | null = null
      const param = osc.frequency
      const realSet = param.setValueAtTime.bind(param)
      param.setValueAtTime = (value: number, time: number) => {
        if (first === null) first = value
        return realSet(value, time)
      }
      const realStart = osc.start.bind(osc)
      osc.start = (when?: number) => {
        w.__effects.push({ type: osc.type, hz: Math.round(first ?? param.value) })
        return realStart(when)
      }
      return osc
    }
  })
}

/**
 * Whether this engine has Web Audio at all.
 *
 * The negative assertions — that a miss never plays `bad` or `fart` — hold either way, and
 * they are the ones §9 is really about. The positive "a `ding` was played" needs an engine
 * that actually built the oscillator, and Playwright's Linux WebKit is not guaranteed to
 * have Web Audio compiled in. Checking rather than assuming keeps the test honest instead of
 * red for a reason that has nothing to do with the game.
 */
export function webAudioAvailable(page: Page): Promise<boolean> {
  return page.evaluate(() => typeof AudioContext !== 'undefined')
}

export function effectsPlayed(page: Page): Promise<{ type: string; hz: number }[]> {
  return page.evaluate(
    () => (window as unknown as { __effects: { type: string; hz: number }[] }).__effects,
  )
}

/** The signatures of the three sounds these tests care about. */
export const DING = { type: 'sine', hz: 984 }
export const BAD = { type: 'triangle', hz: 220 }
export const FART = { type: 'sawtooth', hz: 150 }
