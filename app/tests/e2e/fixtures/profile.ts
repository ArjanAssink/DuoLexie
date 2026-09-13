import type { Page } from '@playwright/test'

/** Matches state/progress.ts's persist config: same store name, same version. */
const DB_NAME = 'duolexie'
const STORE = 'kv'
const KEY = 'duolexie-progress'
const VERSION = 3

/**
 * Start the test with a profile that has already learned the swipe.
 *
 * Hardop lezen teaches the gesture by *performing* it whenever she taps a pile, until she
 * has swiped five cards herself (docs/hardop-lezen-swipe-v2.md §4). That demonstration is
 * ~950ms per card, and a fresh Playwright context is a profile that has never swiped — so
 * every ten-card round test was paying ten seconds to be taught something it is not testing.
 * On CI's two-core WebKit runners that is the difference between a comfortable round and one
 * that trips a per-step timeout; it is the same weight problem the round tests have already
 * been lightened for once (see playwright.config.ts's note on retries).
 *
 * So: tests *about* the teaching use a fresh profile and get taught. Tests about words,
 * counts, gems or crediting call this and get the quick flight.
 *
 * Writing the blob straight into IndexedDB is enough because the store subscribes to
 * `settings.selfSwipes` rather than reading it once at mount — if rehydration lands after
 * the game has mounted, the teaching still switches itself off.
 *
 * The write merges into whatever is already stored rather than replacing it. This runs on
 * *every* navigation, and a test that also calls skipOnboarding (fixtures/onboarded.ts) has
 * an onboarding flag sitting in that same blob — a blind put would drop it on the next
 * `goto` and bounce the test to the welkom-flow.
 */
export async function installLearnedSwipe(page: Page): Promise<void> {
  await page.addInitScript(
    ({ dbName, store, key, version }) => {
      // Opened at version 1 with the same object store zustand's storage creates, so the
      // app's own openDB() finds the database already in the shape it expects.
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(store)
      req.onsuccess = () => {
        const objectStore = req.result.transaction(store, 'readwrite').objectStore(store)
        const read = objectStore.get(key)
        read.onsuccess = () => {
          const existing = typeof read.result === 'string' ? JSON.parse(read.result) : null
          const blob = {
            ...existing,
            state: {
              ...existing?.state,
              settings: { font: 'standaard', ...existing?.state?.settings, selfSwipes: 5 },
            },
            version,
          }
          objectStore.put(JSON.stringify(blob), key)
        }
      }
    },
    { dbName: DB_NAME, store: STORE, key: KEY, version: VERSION },
  )
}
