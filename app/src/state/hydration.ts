import { useEffect, useState } from 'react'
import { useProgress } from './progress'
import { useAvatar } from './avatar'

/** The slice of zustand's persist API this needs — enough to accept both stores as one list. */
interface Hydratable {
  persist: {
    hasHydrated: () => boolean
    onFinishHydration: (fn: () => void) => () => void
  }
}

const STORES: Hydratable[] = [useProgress, useAvatar]

/**
 * True once *both* persisted stores have finished loading from IndexedDB.
 *
 * Both stores read their blob asynchronously, so on the very first render every field holds
 * its default — including `settings.onboardedAt`, which is `null` for a returning player
 * whose real value is still in flight. Anything that branches on persisted state before
 * hydration is therefore reading a value that is about to change: the onboarding gate in
 * PathScreen would send a returning player to /welkom for a frame or two, and because the
 * gate navigates rather than merely renders, that wrong screen sticks.
 *
 * So App.tsx holds every route back until this is true (docs/onboarding-welkom.md ss3.3).
 * Loading from IndexedDB takes tens of milliseconds; the gap is covered by the app's own
 * background colour rather than a spinner, which at that duration would be a flash of its own.
 */
export function useHydrated(): boolean {
  // Read synchronously first: a store that persisted nothing resolves almost immediately,
  // and on a warm navigation both may already be done before this ever mounts — in which
  // case onFinishHydration would never fire again and the gate would never open.
  const [hydrated, setHydrated] = useState(() => STORES.every((s) => s.persist.hasHydrated()))

  useEffect(() => {
    if (hydrated) return
    const unsubscribes = STORES.map((s) =>
      s.persist.onFinishHydration(() => {
        if (STORES.every((other) => other.persist.hasHydrated())) setHydrated(true)
      }),
    )
    // A store can finish between the initial read above and these subscriptions landing.
    if (STORES.every((s) => s.persist.hasHydrated())) setHydrated(true)
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [hydrated])

  return hydrated
}
