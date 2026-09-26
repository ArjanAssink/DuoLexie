import { test, expect, devices, type Page } from '@playwright/test'
import { answersFor, installSpellingNarration, optionsFor } from './fixtures/spellingNarration'

/**
 * Not a test: the screenshots for the pull request (docs/maak-het-woord-af.md §8, §11).
 *
 * Four moments — a dealt card, a tile mid-carry, the wrong-tile bounce, the right-tile
 * landing — at her two real sizes. §8's iPhone fit rule is checked by *looking*, not by
 * arithmetic, which is what these are for.
 *
 * **On Chromium, not WebKit.** The `iphone` and `ipad` projects are WebKit, and WebKit does
 * not run on this machine — Playwright's host check wants libicu/libxml/libflite it cannot
 * find on Arch (the same wall docs/kist-openen.md's notes ran into). So this runs on the
 * `desktop` project, which is Chromium, wearing the devices' own descriptors: viewport,
 * device pixel ratio, isMobile and hasTouch. Only `defaultBrowserType` is dropped — a
 * `browserName` cannot be set per describe block, and the engine is what CI is for.
 *
 * Its own file rather than a block in shots.spec.ts so that its `test.use` cannot change
 * the viewport of the Weetjes and reward shots that live there.
 *
 * Behind `SHOTS=1`, because it writes into docs/media/ and asserts nothing:
 *
 *   SHOTS=1 npx playwright test shots-spelling.spec.ts --project=desktop
 */
const TRY_DT = '/#/les/proef-spel-d-t'
const OUT = '../docs/media/maak-het-woord-af'

const ANSWER = answersFor('d-t')
const OPTIONS = optionsFor('d-t')

/** Her two devices, minus the browser engine this host cannot run. */
function profileOf(name: 'iPhone 13' | 'iPad Pro 11') {
  const { defaultBrowserType: _engine, ...rest } = devices[name]
  return rest
}

const PROFILES: [string, ReturnType<typeof profileOf>][] = [
  ['iphone', profileOf('iPhone 13')],
  ['ipad', profileOf('iPad Pro 11')],
]

test.skip(!process.env.SHOTS, 'screenshot run only; set SHOTS=1')

function beat(page: Page, want: string, timeout = 20_000) {
  return page.waitForFunction(
    (b) => document.querySelector('.spel-screen')?.getAttribute('data-beat') === b,
    want,
    { timeout },
  )
}

async function tiles(page: Page) {
  const stem = await page.locator('.word-text').evaluate((el) => el.textContent ?? '')
  const right = OPTIONS.indexOf(ANSWER.get(stem)!)
  return { stem, right, wrong: 1 - right }
}

/** Pick a tile up and carry it, leaving the pointer down over the gap. */
async function carryToGap(page: Page, tile: number) {
  const t = (await page.locator('.spel-tile').nth(tile).boundingBox())!
  const g = (await page.locator('.gap').boundingBox())!
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
  await page.mouse.down()
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2 - 40, { steps: 4 })
  return { t, g }
}

for (const [device, profile] of PROFILES) {
test.describe(device, () => {
test.use(profile)
test(`shots: maak het woord af — ${device}`, async ({ page }) => {
  test.setTimeout(120_000)
  await installSpellingNarration(page)
  await page.goto(TRY_DT)
  await beat(page, 'choose')
  await page.waitForTimeout(500) // let the deal and the screen-enter animation settle

  await page.screenshot({ path: `${OUT}/1-kaart-${device}.png` })

  // Mid-carry: the tile is lifted, the gap is lit, the card has risen a touch.
  const first = await tiles(page)
  const { g } = await carryToGap(page, first.right)
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - 30, { steps: 6 })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${OUT}/2-tegel-onderweg-${device}.png` })

  // …and dropped in: the word is whole and green.
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect(page.locator('.spel-card.landed')).toHaveCount(1)
  await page.waitForTimeout(220)
  await page.screenshot({ path: `${OUT}/4-goed-${device}.png` })

  // The next card, answered wrong: the tile bumps the gap and the card flashes orange.
  await beat(page, 'choose')
  const second = await tiles(page)
  const { g: g2 } = await carryToGap(page, second.wrong)
  await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('.spel-tile.bumping')).toHaveCount(1)
  await page.waitForTimeout(150) // into the bump, before the correction slides in
  await page.screenshot({ path: `${OUT}/3-fout-${device}.png` })
})
})
}
