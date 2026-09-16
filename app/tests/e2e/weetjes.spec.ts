import { test, expect, type Page } from '@playwright/test'
import { skipOnboarding } from './fixtures/onboarded'
import {
  BAD,
  DING,
  FART,
  effectsPlayed,
  installAutoReadOff,
  installCollected,
  installEffectSpy,
  installWeetjeNarration,
  webAudioAvailable,
  weetjeNarrated,
} from './fixtures/weetjesNarration'

/**
 * Weetjes end to end (docs/weetjes.md §10).
 *
 * Every test goes straight at a node's route, Proefronde-style: a Weetje node is the last
 * lesson of every unit, so `/#/les/<unit>-weetje` is the shortest way to one that does not
 * involve playing a unit first. The onboarding gate is only on "/", so a deep link works on
 * a profile that has never seen the welkom-flow — `skipOnboarding` is still called, because
 * quitting lands back on the path and that *is* gated.
 */
const NODE = '/#/les/fase1-a-e-o-u-i-weetje'

/**
 * The deal order in shared/curriculum/weetjes.json, reviewed cards only — the node hands out
 * the lowest-order cards she has not collected, so seeding her collection is how a test
 * chooses the card type it is about (§5).
 */
const ORDER = [
  'niet-alleen', // waar-niet-waar
  'slim', // waar-niet-waar
  'spiderman', // wie
  'ogen', // waar-niet-waar — the longest reviewed fact in the file
  'kok', // wie
  'extra-tijd', // waar-niet-waar
  'legolas', // wie
  'familie', // kies
  'lettertype', // kies
]

/** Everything before `id`, i.e. the collection that makes `id` the first card dealt. */
function upTo(id: string): string[] {
  return ORDER.slice(0, ORDER.indexOf(id))
}

function beat(page: Page, want: 'luister' | 'doe' | 'bewaar', timeout = 15_000) {
  return page.waitForFunction(
    (b) => document.querySelector('.weetje-screen')?.getAttribute('data-beat') === b,
    want,
    { timeout },
  )
}

async function bookCount(page: Page): Promise<number> {
  return parseInt(await page.locator('.weetje-book-count').innerText(), 10)
}

/** Verder is enabled only once the beat has been read aloud (§2) — wait for that, then go. */
async function verder(page: Page) {
  const button = page.locator('.weetje-verder')
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await button.click()
}

/** Drag the card, slowly enough that it is a deliberate drag rather than a flick. */
async function swipeCard(page: Page, dy: number) {
  const box = (await page.locator('.weetje-card').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy + dy, { steps: 8 })
  await page.mouse.up()
}

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return errors
}

test.beforeEach(async ({ page }) => {
  await installWeetjeNarration(page)
  await installEffectSpy(page)
  await skipOnboarding(page)
})

test('a myth swiped away: narrated, revealed, dinged, and kept', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto(NODE)

  // Luister — the fact reads itself aloud, and Verder waits for it.
  await beat(page, 'luister')
  await expect(page.locator('.weetje-fact')).toContainText('In een klas van 25 kinderen')
  await expect.poll(() => weetjeNarrated(page)).toContain('niet-alleen-fact')
  expect(await bookCount(page)).toBe(0)
  await verder(page)

  // Doe — the statement is read aloud too, so the card is playable without reading it.
  await beat(page, 'doe')
  await expect(page.locator('.weetje-statement')).toContainText('Jij bent de enige')
  await expect.poll(() => weetjeNarrated(page)).toContain('niet-alleen-doe')

  // Down is "Niet waar", which is what this statement is.
  await swipeCard(page, 140)

  await beat(page, 'bewaar')
  await expect(page.locator('.weetje-reveal')).toContainText('Heel veel kinderen hebben het')
  await expect(page.locator('.weetje-praise')).toHaveCount(0) // she had it right
  if (await webAudioAvailable(page)) expect(await effectsPlayed(page)).toContainEqual(DING)

  // The card goes into the book, and the book says so.
  await expect.poll(() => bookCount(page)).toBe(1)
  await expect(page.locator('.weetje-kept')).toContainText('in je Weetjesboek')
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([])
})

test('tapping the Niet waar label performs the swipe, and answers the same', async ({ page }) => {
  await page.goto(NODE)
  await beat(page, 'luister')
  await verder(page)
  await beat(page, 'doe')

  await page.locator('.weetje-label-niet').click()
  // The card travels the way her finger would have, before it commits (§2).
  await expect(page.locator('.weetje-card.demo-down')).toHaveCount(1)

  await beat(page, 'bewaar')
  await expect(page.locator('.weetje-reveal')).toContainText('Heel veel kinderen hebben het')
  if (await webAudioAvailable(page)) expect(await effectsPlayed(page)).toContainEqual(DING)
  await expect.poll(() => bookCount(page)).toBe(1)
})

test('a wrong answer costs nothing: no failure sound, the card is still kept, same gems', async ({
  page,
}) => {
  const errors = watchErrors(page)
  // Deal `familie` first — a kies card whose three options are not names.
  await installCollected(page, upTo('familie'))
  await page.goto(NODE)

  await beat(page, 'luister')
  await expect(page.locator('.weetje-fact')).toContainText('Dyslexie zit vaak in de familie')
  await verder(page)

  await beat(page, 'doe')
  await expect(page.locator('.weetje-option')).toHaveCount(3)
  // §2: three, stacked, full width, never under 56px.
  for (const option of await page.locator('.weetje-option').all()) {
    expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(56)
  }
  await page.locator('.weetje-option', { hasText: 'Je fiets' }).click() // deliberately wrong

  await beat(page, 'bewaar')
  await expect(page.locator('.weetje-praise')).toHaveText(/Goed geprobeerd!/)
  await expect(page.locator('.weetje-reveal')).toContainText('Papa, mama, opa of oma')

  const effects = await effectsPlayed(page)
  expect(effects, 'a miss must never play bad').not.toContainEqual(BAD)
  expect(effects, 'a miss must never play fart').not.toContainEqual(FART)

  // She keeps it anyway — there is no wrong answer here that costs anything.
  await expect.poll(() => bookCount(page)).toBe(upTo('familie').length + 1)

  // Second card, then the reward: the same flat eight gems a perfect round pays.
  await verder(page)
  await beat(page, 'luister')
  await verder(page)
  await beat(page, 'doe')
  await page.locator('.weetje-option').first().click()
  await beat(page, 'bewaar')
  await verder(page)

  await expect(page.locator('.reward-screen')).toBeVisible()
  await expect(page.locator('.reward-line').first()).toContainText('+8', { timeout: 10_000 })
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([])
})

test('auto-read off: nothing is read until she asks, and Verder waits a beat instead', async ({
  page,
}) => {
  await installAutoReadOff(page)
  await page.goto(NODE)
  await beat(page, 'luister')

  // Nothing plays by itself, and Verder is not available the instant the card lands.
  await expect(page.locator('.weetje-verder')).toBeDisabled()
  expect(await weetjeNarrated(page)).toEqual([])

  // ...but it opens on its own shortly after (SILENT_BEAT_MS = 1500).
  await expect(page.locator('.weetje-verder')).toBeEnabled({ timeout: 5000 })
  expect(await weetjeNarrated(page)).toEqual([])

  // 🔊 still reads it, which is the whole point of the button.
  await page.locator('.weetje-speak').click()
  await expect.poll(() => weetjeNarrated(page)).toContain('niet-alleen-fact')
})

test('the reward screen for a Weetje node has nothing to grade', async ({ page }) => {
  await page.goto(NODE)
  for (let card = 0; card < 2; card++) {
    await beat(page, 'luister')
    await verder(page)
    await beat(page, 'doe')
    await page.locator('.weetje-label-niet').click() // both opening cards are myths
    await beat(page, 'bewaar')
    await verder(page)
  }

  await expect(page.locator('.reward-screen')).toBeVisible()
  await expect(page.locator('.reward-screen h1')).toHaveText('Nu weet je dit ook!')
  await expect(page.locator('.reward-subline')).toHaveText(
    'Vertel het vanavond aan iemand thuis.',
  )
  // No percentage, no tally, no "x van y goed" — there is nothing here to be wrong about.
  await expect(page.locator('.reward-tally')).toHaveCount(0)
  await expect(page.locator('.reward-chips')).toHaveCount(0)
  await expect(page.locator('.reward-line').first()).toContainText('+8', { timeout: 10_000 })
})

test('the Weetjesboek shows what she has, face-down what she has not, and reads one back', async ({
  page,
}) => {
  await installCollected(page, ['niet-alleen', 'slim'])
  await page.goto('/#/weetjes')

  await expect(page.locator('.weetjesboek-card:not(.facedown)')).toHaveCount(2)
  expect(await page.locator('.weetjesboek-card.facedown').count()).toBeGreaterThan(0)
  await expect(page.locator('.weetjesboek-empty')).toHaveCount(0)

  await page.locator('.weetjesboek-card:not(.facedown)').first().click()
  await expect(page.locator('.weetjesboek-open')).toBeVisible()
  await expect(page.locator('.weetjesboek-open .weetje-reveal')).toContainText(
    'Heel veel kinderen hebben het',
  )
  await expect.poll(() => weetjeNarrated(page)).toContain('niet-alleen-fact')
})

test('the Weetjesboek is honest when it is empty', async ({ page }) => {
  await page.goto('/#/weetjes')
  await expect(page.locator('.weetjesboek-empty')).toContainText(
    'Speel een Weetje op het pad. Dan komt het hier.',
  )
  await expect(page.locator('.weetjesboek-card:not(.facedown)')).toHaveCount(0)
})

test('quitting mid-narration stops the reading and credits nothing', async ({ page }) => {
  const errors = watchErrors(page)
  // A long clip, so the quit certainly lands while the reveal is still being read.
  await installWeetjeNarration(page, 4000)
  await page.goto(NODE)

  await beat(page, 'luister')
  // Mid-narration: the beat is still being read, so Verder is not open yet.
  await expect(page.locator('.weetje-verder')).toBeDisabled()
  await page.locator('.quit').click()

  await expect(page.locator('.coin-item').first()).toBeVisible() // back on the path
  await page.waitForTimeout(1200) // room for a (wrongly) triggered persist to land

  expect(await credited(page)).toMatchObject({ gems: 0, sessions: 0, collected: 0 })
  // Nothing is still playing at her on the path screen.
  expect(await playingMedia(page)).toBe(0)
  await expect(page.locator('.reward-screen')).toHaveCount(0)
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([])
})

test.describe('on an iPhone', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('every beat of the longest card fits without scrolling', async ({ page }) => {
    // `ogen` has the longest reviewed fact in the file, and `kok` the longest reveal.
    await installCollected(page, upTo('ogen'))
    await page.goto(NODE)

    for (let card = 0; card < 2; card++) {
      await beat(page, 'luister')
      await expectNoScroll(page, `card ${card} luister`)
      await verder(page)

      await beat(page, 'doe')
      await expectNoScroll(page, `card ${card} doe`)
      const swipeable = await page.locator('.weetje-label-niet').count()
      if (swipeable) await page.locator('.weetje-label-niet').click()
      else await page.locator('.weetje-option').first().click()

      await beat(page, 'bewaar')
      await expectNoScroll(page, `card ${card} bewaar`)
      await verder(page)
    }
  })
})

/**
 * Polled rather than measured once: `.game-screen` enters with a 14px translateY
 * (@keyframes screenEnter), and that transform counts towards scrollHeight for the third of
 * a second it is running. Measuring immediately would fail every beat by exactly the enter
 * animation's offset, which is not what §10.11 is about.
 */
async function expectNoScroll(page: Page, where: string) {
  await expect
    .poll(
      () => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
      { message: `${where} must fit without scrolling` },
    )
    .toBeLessThanOrEqual(1)
}

/** How many media elements are actually playing right now. */
function playingMedia(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll('audio')].filter((a) => !a.paused && !a.ended).length,
  )
}

/** What the persisted profile says she earned and kept. */
function credited(page: Page): Promise<{ gems: number; sessions: number; collected: number }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('duolexie')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const raw = await new Promise<unknown>((res, rej) => {
      const r = db.transaction('kv').objectStore('kv').get('duolexie-progress')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as
      | { state?: Record<string, unknown> }
      | null
    const s = parsed?.state ?? {}
    return {
      gems: (s.gems as number) ?? 0,
      sessions: ((s.sessions as unknown[]) ?? []).length,
      collected: ((s.collectedWeetjes as unknown[]) ?? []).length,
    }
  })
}
