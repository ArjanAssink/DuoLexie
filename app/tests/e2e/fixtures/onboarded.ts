import { expect, type Page } from '@playwright/test'

/** Matches state/progress.ts's persist config and state/idbStorage.ts's database. */
const DB_NAME = 'duolexie'
const STORE = 'kv'
const KEY = 'duolexie-progress'
const VERSION = 3

/**
 * A blank page on the app's origin, served by route interception rather than by Vite.
 *
 * The seed needs a document whose IndexedDB it can write — but it must *not* be a document
 * that boots the app, because zustand's persist writes the whole blob back as soon as it
 * finishes hydrating. Seeding on an app route is therefore a race the seed regularly loses:
 * the write lands, the app's hydration write lands a moment later with onboardedAt back to
 * null, and the test finds the welkom-flow. (Observed exactly that way on the two
 * quit-mid-animation tests that install a fake clock, where the timing shifts.)
 */
const SEED_PATH = '/__seed-onboarded'

/**
 * Start the test with a profile that has already been through the welkom-flow.
 *
 * On a fresh profile `/` redirects to `/#/welkom` (docs/onboarding-welkom.md ss3.2), so every
 * test that lands on the leerpad — by visiting `/` or by quitting a game back to it — has to
 * set the flag first or it will find the onboarding where it expected the coins.
 *
 * Call it before the test's own `goto`; it navigates to the blank seed page above and leaves
 * the page there, so the caller's own navigation is what boots the app.
 *
 * **Why an awaited evaluate and not addInitScript.** The seed has to be committed *before*
 * the app opens the database, and only awaiting the write guarantees that ordering — an init
 * script racing the app's own hydration would sometimes lose, and a lost seed here looks
 * like a redirect bug rather than a flaky fixture.
 *
 * The write merges into whatever is stored rather than replacing it, and is repeated until a
 * fresh read confirms it stuck — installLearnedSwipe (fixtures/profile.ts) writes the same
 * blob from an init script at document start, and the two must compose in either order.
 */
export async function skipOnboarding(page: Page): Promise<void> {
  await page.route(SEED_PATH, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>seed</title>' }),
  )
  try {
    await page.goto(SEED_PATH)
    await expect
      .poll(() => page.evaluate(seedOnboarded, { dbName: DB_NAME, store: STORE, key: KEY, version: VERSION }))
      .toBeTruthy()
  } finally {
    await page.unroute(SEED_PATH)
  }
}

interface SeedArgs {
  dbName: string
  store: string
  key: string
  version: number
}

/** Runs in the page: merge the flag into the stored blob, then read it back in a fresh
 *  transaction and return what actually stuck. */
function seedOnboarded({ dbName, store, key, version }: SeedArgs): Promise<string | null> {
  return new Promise((resolve, reject) => {
    // Version 1 with the same object store zustand's storage creates, so the app's own
    // openDB() finds the database already in the shape it expects.
    const open = indexedDB.open(dbName, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(store)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const write = db.transaction(store, 'readwrite').objectStore(store)
      const read = write.get(key)
      read.onsuccess = () => {
        const existing = typeof read.result === 'string' ? JSON.parse(read.result) : null
        // The store's `merge` fills in every field left out here, which is why only the flag
        // needs writing. `version` must match progress.ts's, or `migrate` runs every test.
        const blob = {
          ...existing,
          state: {
            ...existing?.state,
            settings: { ...existing?.state?.settings, onboardedAt: new Date().toISOString() },
          },
          version,
        }
        write.put(JSON.stringify(blob), key)
        const verify = db.transaction(store, 'readonly').objectStore(store).get(key)
        verify.onsuccess = () => {
          const stored = typeof verify.result === 'string' ? JSON.parse(verify.result) : null
          resolve(stored?.state?.settings?.onboardedAt ?? null)
        }
        verify.onerror = () => reject(verify.error)
      }
      read.onerror = () => reject(read.error)
    }
  })
}
