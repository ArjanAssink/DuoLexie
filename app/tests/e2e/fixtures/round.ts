import { expect, type Page } from '@playwright/test'

/**
 * The Proefronde: all of fase 1 as one pool, so a round is always ten distinct words
 * regardless of her progress. It is also the entry Arjan launches from /#/proberen to try
 * the game with her, and — unlike a path node — it needs no onboarding flag to reach.
 */
export const PROEFRONDE = '/#/les/proef-hardop-lezen'

export function waitForPhase(page: Page, want: string, timeout = 15_000) {
  return page.waitForFunction(
    (p) => document.querySelector('.hardop-screen')?.getAttribute('data-phase') === p,
    want,
    { timeout },
  )
}

/** Reveal the current word, then sort it onto a pile. Returns the word that was on the card. */
export async function playCard(page: Page, verdict: 'goed' | 'nogEven'): Promise<string> {
  await waitForPhase(page, 'reading')
  const word = await page.locator('.word-text').innerText()
  await page.locator('.reveal-btn').click()
  await waitForPhase(page, 'judging', 6000)
  await page.locator(verdict === 'goed' ? '.pile-goed' : '.pile-nog-even').click()
  return word
}

/**
 * Play a whole Hardop lezen round to a given score and stop the moment the reward screen is
 * up — the setup line for every test about the celebration that follows.
 *
 * The correct cards are played *last*. A round ends on its final card, and a wrong card's
 * commit chain replays the word before the next one deals in; putting the quick ones at the
 * end keeps the gap between the last tap and the reward screen short and even, which matters
 * when a test is about what happens in the first 300ms of that screen.
 *
 * Caller supplies `installNarration` and (unless the test is about being taught the swipe)
 * `installLearnedSwipe`, and has already navigated to PROEFRONDE.
 *
 * @param correct how many of the round's cards go on the Goed pile
 * @returns the words that went on "nog even", which are the chips the reward screen lists
 */
export async function finishRound(page: Page, correct: number): Promise<string[]> {
  await expect(page.locator('.word-card')).toBeVisible()
  const total = await page.locator('.pip').count()
  expect(total, 'the Proefronde deals a full round').toBeGreaterThanOrEqual(2)
  expect(correct).toBeLessThanOrEqual(total)

  const missed: string[] = []
  for (let i = 0; i < total; i++) {
    const goed = i >= total - correct
    const word = await playCard(page, goed ? 'goed' : 'nogEven')
    if (!goed) missed.push(word)
  }

  await expect(page.locator('.reward-screen')).toBeVisible({ timeout: 15_000 })
  return missed
}

/**
 * Record every `data-beat` the reward screen passes through, in order.
 *
 * Polling for the beats from the test side cannot see them all: `settle` is 600ms wide but
 * `card` and `strip` are separated by 1.3s and a slow ipad runner can miss a transition
 * between two round-trips. A MutationObserver installed before the app boots sees each one
 * as it happens, so the assertion is about the *order* the screen really went through
 * rather than about what the test managed to catch.
 *
 * **Why it reads `oldValue` and not just the current attribute.** An observer callback is a
 * microtask that runs once per checkpoint, however many mutations landed in it — and on CI's
 * ipad profile two beat timers really do fire back to back, late and batched, often enough
 * that the first version of this dropped `settle` (and once `strip`) on three runs out of
 * three. Reading the live attribute in the callback only ever sees where the screen has got
 * to, so a beat that came and went inside one checkpoint leaves no trace. Every record
 * carries its own `oldValue`, so walking the records and then appending the current value
 * reconstructs the chain exactly, however they were batched.
 */
export async function recordBeats(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __beats: string[] }
    w.__beats = []
    const push = (beat: string | null | undefined) => {
      if (beat && w.__beats[w.__beats.length - 1] !== beat) w.__beats.push(beat)
    }
    const note = (records: MutationRecord[]) => {
      for (const r of records) if (r.type === 'attributes') push(r.oldValue)
      push(document.querySelector('.reward-screen')?.getAttribute('data-beat'))
    }
    // `document`, not `document.documentElement`: an init script runs before the document
    // has an <html> element, and observing null throws — silently, since nothing awaits an
    // init script — leaving an empty list that looks like a screen with no beats at all.
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-beat'],
      attributeOldValue: true,
    })
  })
}

/** The beats seen so far, in order, without repeats. */
export function beatsSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __beats: string[] }).__beats)
}

/**
 * Count calls to `AudioContext.createOscillator`.
 *
 * Sound cannot be heard in CI, so what a test can check is that the celebration *reaches*
 * the synthesiser: `cardPop` is one oscillator and each `tierUp` is two, so a round that
 * climbs three tiers is audibly — and countably — busier than one that climbs none.
 * `whoosh` deliberately does not show up here: it is noise through a buffer source, not an
 * oscillator, which is itself worth knowing when reading the numbers.
 */
export async function installAudioSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __oscStarts: number }
    w.__oscStarts = 0
    const Ctx = window.AudioContext
    if (!Ctx) return
    const real = Ctx.prototype.createOscillator
    Ctx.prototype.createOscillator = function (this: AudioContext) {
      w.__oscStarts += 1
      return real.call(this)
    }
  })
}

/** Oscillators created so far. `resetAudioSpy` is how a test scopes this to one screen. */
export function oscillators(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __oscStarts: number }).__oscStarts)
}

/**
 * Zero the counter. Called once the reward screen is up, so what follows counts only the
 * celebration's own sounds — the round itself fires a ding, a buzz or a pop per card, and
 * the closing fanfare lands in the same tick the reward screen is created.
 */
export function resetAudioSpy(page: Page): Promise<void> {
  return page.evaluate(() => {
    ;(window as unknown as { __oscStarts: number }).__oscStarts = 0
  })
}

/** Animations actually running in the reward screen's subtree, by keyframe name. */
export function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.reward-screen')
    if (!root) return ['<no reward screen>']
    return root
      .getAnimations({ subtree: true })
      .filter((a) => a.playState === 'running')
      .map((a) => (a as CSSAnimation).animationName ?? a.constructor.name)
  })
}
