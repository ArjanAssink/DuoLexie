/**
 * Haptics, with the one workaround iOS allows (docs/haptics.md).
 *
 * `navigator.vibrate` is the API, and Android Chrome has it. WebKit never implemented it, so
 * on an iPhone every buzz in the app was silent. What Safari *does* have, since 17.4, is a
 * non-standard `<input type="checkbox" switch>` whose toggle fires the system's light haptic
 * tick — and it fires when the switch is toggled by clicking its `<label>` from script. So
 * on iOS a vibrate pattern becomes a run of those ticks: one per short "on" segment, one every
 * TICK_SPACING_MS across a long one. The Taptic Engine only has the one light tap to offer
 * through this door, so a "rumble" is a rattle. That is still something where there was
 * nothing.
 *
 * Nothing helps an iPad: it has no vibration motor at all. The backend detection cannot see
 * that, so the switch path is taken there too and nothing is felt. `hapticBackend()` is what
 * the /proberen test button shows, so a real device can tell you which path it took.
 */

export type HapticBackend = 'vibrate' | 'ios-switch' | 'none'

/** One tick per this many ms of an "on" segment, so a long buzz becomes a fast rattle. */
export const TICK_SPACING_MS = 60
/**
 * Ticks per call, at most. The switch tick is a fixed light tap; a long run of them is not
 * a longer buzz but a longer rattle, and past ten it stops reading as one event.
 */
export const MAX_TICKS = 10

/**
 * When to tick, in ms from the start of the pattern, for a vibrate pattern played through
 * the switch. Pure, so it is unit-tested: `[on, off, on, ...]` like `navigator.vibrate`,
 * a bare number being one "on".
 */
export function tickOffsets(pattern: number | number[]): number[] {
  const segments = typeof pattern === 'number' ? [pattern] : pattern
  const offsets: number[] = []
  let t = 0
  segments.forEach((ms, i) => {
    const on = i % 2 === 0
    if (on && ms > 0) {
      const ticks = Math.max(1, Math.round(ms / TICK_SPACING_MS))
      for (let k = 0; k < ticks && offsets.length < MAX_TICKS; k++) {
        offsets.push(t + k * TICK_SPACING_MS)
      }
    }
    t += Math.max(0, ms)
  })
  return offsets
}

let detected: HapticBackend | null = null

function detect(): HapticBackend {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return 'none'
  if (typeof navigator.vibrate === 'function') return 'vibrate'
  // WebKit reflects the `switch` attribute as a property on the element; nobody else does.
  if ('switch' in document.createElement('input')) return 'ios-switch'
  return 'none'
}

/** Which way a buzz goes out on this device. Detected once, on first use. */
export function hapticBackend(): HapticBackend {
  detected ??= detect()
  return detected
}

let label: HTMLLabelElement | null = null

/**
 * The hidden switch, created on first use and kept. Off-screen rather than `display: none`:
 * Safari has to consider it rendered for the toggle to count. The label is what gets
 * clicked — clicking the input itself from script does not fire the haptic.
 */
function switchLabel(): HTMLLabelElement {
  if (label?.isConnected) return label
  const l = document.createElement('label')
  l.setAttribute('aria-hidden', 'true')
  l.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  l.appendChild(input)
  document.body.appendChild(l)
  label = l
  return l
}

let pending: number[] = []

function tick() {
  switchLabel().click()
}

function playTicks(pattern: number | number[]) {
  // Like vibrate(): a new pattern replaces whatever was still playing.
  for (const t of pending) window.clearTimeout(t)
  pending = []
  for (const at of tickOffsets(pattern)) {
    if (at === 0) tick()
    else pending.push(window.setTimeout(tick, at))
  }
}

/**
 * A buzz: `navigator.vibrate` where it exists, the iOS switch trick where that is all there
 * is, nothing anywhere else. Never throws — a haptic is a nice-to-have, never worth crashing
 * a game over.
 */
export function haptic(pattern: number | number[] = 12): void {
  try {
    switch (hapticBackend()) {
      case 'vibrate':
        navigator.vibrate(pattern)
        break
      case 'ios-switch':
        playTicks(pattern)
        break
    }
  } catch {
    // see above
  }
}
