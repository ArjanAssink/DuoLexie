import { test, expect, type Page } from '@playwright/test'
import { skipOnboarding } from './fixtures/onboarded'

/** A silent, deep-linkable lesson — the gate must never stand between a link and a game. */
const FLITSEN = '/#/les/fase1-a-e-o-u-i-l1'

/** How long to allow for the ~900ms closing beat plus the redirect, on the slowest runner. */
const BEAT_TIMEOUT = 20_000

/**
 * Run this test on the desktop project only.
 *
 * docs/onboarding-welkom.md ss8 asks for the desktop project plus ipad/iphone "for the layout
 * assertions", and that split is worth keeping to: the ipad and iphone projects are two WebKit
 * contexts on a two-core runner, and the suite there is already close enough to its budget to
 * have a documented contention flake (playwright.config.ts). What is left running on all three
 * is everything about routing, hydration and layout — which is where the engines actually
 * differ, and where this flow has already been bitten once.
 */
function behaviourOnly(projectName: string) {
  test.skip(projectName !== 'desktop', 'behaviour, not layout or routing — one engine is enough')
}

/** The persisted progress blob, straight out of IndexedDB. */
function readProgress(page: Page) {
  return page.evaluate(() => readStore('duolexie-progress'))
}
function readAvatar(page: Page) {
  return page.evaluate(() => readStore('duolexie-avatar'))
}

/*
 * Both readers share one page-side helper, installed before every navigation so it survives
 * the reload in "finishing lands on the leerpad".
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).readStore = (key: string) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('duolexie')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('kv').objectStore('kv').get(key)
          req.onsuccess = () => {
            const raw = req.result
            resolve(typeof raw === 'string' ? JSON.parse(raw) : null)
          }
          req.onerror = () => reject(req.error)
        }
      })
  })
})

declare function readStore(key: string): Promise<{ state?: Record<string, never> } | null>

const settingsOf = (blob: Awaited<ReturnType<typeof readProgress>>) =>
  (blob?.state?.settings ?? {}) as { playerName?: string; onboardedAt?: string | null }

// ---------------------------------------------------------------- the gate

test('a first visit to / lands on the welkom-flow', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')

  await expect(page).toHaveURL(/#\/welkom$/)
  await expect(page.locator('.welkom')).toBeVisible()
  await expect(page.locator('.frida-says-hero img')).toBeVisible()
  await expect(page.locator('.welkom h1')).toHaveText('Lezen oefenen, maar dan leuk.')
  await expect(page.locator('.coach-bubble')).toHaveText('Hoi! Ik ben Frida.')
  await expect(page.getByRole('button', { name: 'Aan de slag' })).toBeVisible()
  // one dot filled, three in total
  await expect(page.locator('.welkom-dot')).toHaveCount(3)
  await expect(page.locator('.welkom-dot.on')).toHaveCount(1)

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([])
})

test('an onboarded profile never passes through the welkom-flow', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/')

  /*
   * The hydration test (docs/onboarding-welkom.md ss3.3). Both stores load from IndexedDB
   * asynchronously, so on the first render onboardedAt is null for *everyone* — a gate that
   * reads it then would navigate a returning player to /welkom and leave her there. Polling
   * the URL rather than waiting for the leerpad is what makes this a test of the gate and
   * not just of the destination: a flash that self-corrects would still pass the latter.
   */
  const deadline = Date.now() + 500
  while (Date.now() < deadline) {
    expect(page.url(), 'flashed the welkom-flow at a returning player').not.toContain('/welkom')
    await page.waitForTimeout(25)
  }

  await expect(page.locator('.coin-item.active')).toBeVisible()
})

test('a deep link into a lesson never redirects, onboarded or not', async ({ page }) => {
  await page.goto(FLITSEN)

  await expect(page.locator('.game-screen')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${FLITSEN.replace('/#', '#')}$`))
})

test('?test=true opens the leerpad without a detour', async ({ page }) => {
  await page.goto('/?test=true#/')

  await expect(page.locator('.coin-item').first()).toBeVisible()
  expect(page.url()).not.toContain('/welkom')
})

// ---------------------------------------------------------------- the flow

test('the GitHub link opens in a new tab', async ({ page }, testInfo) => {
  behaviourOnly(testInfo.project.name)

  await page.goto('/#/welkom')

  const link = page.locator('.wip-note a')
  await expect(link).toHaveAttribute('href', 'https://github.com/ArjanAssink/DuoLexie/issues')
  await expect(link).toHaveAttribute('target', '_blank')
  expect(await link.getAttribute('rel')).toContain('noopener')
})

test("Frida's bubble reacts to every keystroke, and Verder waits for a name", async ({
  page,
}, testInfo) => {
  behaviourOnly(testInfo.project.name)

  await page.goto('/#/welkom')
  await page.getByRole('button', { name: 'Aan de slag' }).click()

  await expect(page.locator('.welkom h1')).toHaveText('Hoe mogen we je noemen?')
  await expect(page.locator('.welkom-dot.on')).toHaveCount(2)

  const bubble = page.locator('.coach-bubble')
  const verder = page.getByRole('button', { name: 'Verder' })
  const input = page.locator('.welkom-name-input')

  await expect(bubble).toHaveText('Hoe heet jij?')
  await expect(verder).toBeDisabled()

  await input.fill('lotte')
  await expect(bubble).toHaveText('Hoi, lotte!')
  await expect(verder).toBeEnabled()

  await input.fill('')
  await expect(bubble).toHaveText('Hoe heet jij?')
  await expect(verder).toBeDisabled()
})

test('Liever geen naam continues with no name at all', async ({ page }, testInfo) => {
  behaviourOnly(testInfo.project.name)

  await page.goto('/#/welkom')
  await page.getByRole('button', { name: 'Aan de slag' }).click()
  await page.getByRole('button', { name: 'Liever geen naam' }).click()

  await expect(page.locator('.welkom h1')).toHaveText('Maak je eigen avatar')
  await expect(page.locator('.coach-bubble')).toHaveText('Mooi zo!')
  await expect(page.locator('.welkom-dot.on')).toHaveCount(3)
  await expect
    .poll(async () => settingsOf(await readProgress(page)).playerName ?? '')
    .toBe('')
})

test('an avatar choice on step 3 is written straight to the avatar store', async ({
  page,
}, testInfo) => {
  behaviourOnly(testInfo.project.name)

  await page.goto('/#/welkom')
  await page.getByRole('button', { name: 'Aan de slag' }).click()
  await page.getByRole('button', { name: 'Liever geen naam' }).click()

  await page.getByRole('button', { name: 'Krullen' }).click()

  await expect(page.getByRole('button', { name: 'Krullen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect
    .poll(async () => {
      const blob = (await readAvatar(page)) as { state?: { config?: { hairstyle?: string } } } | null
      return blob?.state?.config?.hairstyle
    })
    .toBe('krullen')
})

test('finishing the flow lands on the leerpad, with her name, and stays there', async ({
  page,
}) => {
  await page.goto('/#/welkom')
  await page.getByRole('button', { name: 'Aan de slag' }).click()
  await page.locator('.welkom-name-input').fill('Lotte')
  await page.getByRole('button', { name: 'Verder' }).click()
  await page.getByRole('button', { name: 'Klaar!' }).click()

  await expect(page.locator('.coach-bubble')).toHaveText('Veel plezier, Lotte!')

  // Wait on the destination, generously, rather than on the beat's nominal 900ms: on a CI
  // runner holding two WebKit contexts on two cores, getting through the confetti and
  // committing the redirect has taken several seconds.
  await expect(page.locator('.coin-item.active')).toBeVisible({ timeout: BEAT_TIMEOUT })
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('.path-greeting')).toHaveText('Hoi, Lotte!')

  await page.reload()
  await expect(page.locator('.coin-item.active')).toBeVisible({ timeout: BEAT_TIMEOUT })
  expect(page.url()).not.toContain('/welkom')

  const settings = settingsOf(await readProgress(page))
  expect(settings.playerName).toBe('Lotte')
  expect(settings.onboardedAt, 'onboardedAt must survive the reload').toBeTruthy()
})

test('Profiel can re-open the intro, and finishing it returns to the leerpad', async ({ page }) => {
  await skipOnboarding(page)
  await page.goto('/#/avatar')

  await page.getByRole('button', { name: 'Introductie opnieuw bekijken' }).click()
  await expect(page).toHaveURL(/#\/welkom$/)
  await expect(page.locator('.welkom h1')).toHaveText('Lezen oefenen, maar dan leuk.')

  await page.getByRole('button', { name: 'Aan de slag' }).click()
  await page.getByRole('button', { name: 'Liever geen naam' }).click()
  await page.getByRole('button', { name: 'Klaar!' }).click()

  await expect(page.locator('.coin-item.active')).toBeVisible({ timeout: BEAT_TIMEOUT })
  await expect(page).toHaveURL(/#\/$/)
})

// ---------------------------------------------------------------- layout and motion

test('the name step keeps its CTA on screen with the input focused', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'about the phone viewport specifically')

  await page.goto('/#/welkom')
  await page.getByRole('button', { name: 'Aan de slag' }).click()
  await page.locator('.welkom-name-input').focus()

  const viewport = page.viewportSize()!
  const cta = await page.getByRole('button', { name: 'Verder' }).boundingBox()
  expect(cta, 'Verder has no box').not.toBeNull()
  expect(cta!.y, 'Verder starts above the viewport').toBeGreaterThanOrEqual(0)
  expect(
    cta!.y + cta!.height,
    'Verder is pushed below the fold with the input focused',
  ).toBeLessThanOrEqual(viewport.height)
})

test('the first two steps fit a phone screen without scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'about the phone viewport specifically')

  // docs/onboarding-welkom.md ss2: every step fits one phone screen except step 3, whose
  // pickers may scroll. A couple of pixels of tolerance for sub-pixel text metrics; anything
  // real (a third line of headline, a bullet pushed under the fold) is far larger than that.
  const overflow = () =>
    page.locator('.welkom-body').evaluate((el) => el.scrollHeight - el.clientHeight)

  await page.goto('/#/welkom')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('.welkom-bullets li')).toHaveCount(3)
  expect(await overflow(), 'step 1 does not fit the phone screen').toBeLessThanOrEqual(4)

  await page.getByRole('button', { name: 'Aan de slag' }).click()
  await expect(page.locator('.welkom-name-input')).toBeVisible()
  expect(await overflow(), 'step 2 does not fit the phone screen').toBeLessThanOrEqual(4)

  // and the footer under the CTA is on screen too, not just the CTA
  const viewport = page.viewportSize()!
  const footer = await page.locator('.welkom-skip').boundingBox()
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height)
})

test('every tap target in the flow is at least 44px', async ({ page }) => {
  await page.goto('/#/welkom')
  await page.getByRole('button', { name: 'Aan de slag' }).click()

  for (const name of ['Terug', 'Verder', 'Liever geen naam']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box, `${name} has no box`).not.toBeNull()
    expect(box!.height, `${name} is shorter than 44px`).toBeGreaterThanOrEqual(44)
  }
})

test('respects prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/welkom')

  const frida = page.locator('.frida-says-hero img')
  await expect(frida).toBeVisible()
  expect(await frida.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  expect(
    await page.locator('.coach-bubble').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none')
})
