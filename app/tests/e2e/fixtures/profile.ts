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
 */
export async function installLearnedSwipe(page: Page): Promise<void> {
  await page.addInitScript(
    ({ dbName, store, key, version }) => {
      const blob = JSON.stringify({
        state: { settings: { font: 'standaard', selfSwipes: 5 } },
        version,
      })
      // Opened at version 1 with the same object store zustand's storage creates, so the
      // app's own openDB() finds the database already in the shape it expects.
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(store)
      req.onsuccess = () => {
        const db = req.result
        db.transaction(store, 'readwrite').objectStore(store).put(blob, key)
      }
    },
    { dbName: DB_NAME, store: STORE, key: KEY, version: VERSION },
  )
}
