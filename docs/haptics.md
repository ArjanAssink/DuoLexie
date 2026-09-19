# Haptics, and how they reach an iPhone

**Status:** built by Claude Fable 5.1 (session
[012C52p53S3dATWRG7puuGvK](https://claude.ai/code/session_012C52p53S3dATWRG7puuGvK)), after the
Flitsen carry (docs/flitsen-swipe.md) and the celebration buzz (docs/reward-celebration.md §6)
turned out to be silent on the devices she actually plays on.

## 1. The situation

Every buzz in the app goes through one helper, `haptic(pattern)`, now in
`app/src/audio/haptics.ts` and re-exported from `audio/audio.ts` so the games did not change.
The pattern is the Vibration API's: `[on, off, on, ...]` in ms, or a bare number for one "on".

| Device | What happens |
|---|---|
| Android Chrome | `navigator.vibrate(pattern)`, exactly as written |
| iPhone, Safari 17.4+ | the **switch trick** (§2): the pattern becomes a run of the system's light haptic ticks |
| iPad | **nothing, ever** — an iPad has no vibration motor. The code cannot tell and takes the switch path; nothing is felt |
| Desktop | nothing |

WebKit has never implemented the Vibration API and, as of September 2026, still has not.

## 2. The switch trick

Safari 17.4 added a non-standard `<input type="checkbox" switch>`. Toggling it fires the
Taptic Engine's light tick, and it also fires when the toggle happens because script clicked
the switch's `<label>` (Ionic uses exactly this for its toggle on iOS 18+; clicking the input
itself from script does not fire it). `haptics.ts` therefore keeps one hidden switch-in-a-label
off-screen and, on iOS, plays a pattern as label clicks:

- one tick per short "on" segment;
- across a long "on", one tick every `TICK_SPACING_MS` (60ms), so a 240ms rumble is four
  ticks;
- at most `MAX_TICKS` (10) per call, and a new pattern cancels the ticks still scheduled, as
  `vibrate()` does.

`tickOffsets()` is the pure part and is unit-tested (`haptics.test.ts`). `hapticBackend()`
reports which path was taken: `vibrate`, `ios-switch` or `none`. Detection is
`'switch' in document.createElement('input')`, which only WebKit reflects.

What this cannot do: intensity, duration or shape. The only thing behind the door is one light
tap, so a long buzz is a fast rattle of taps, not a rumble. It is still something where there
was nothing.

## 3. Checking it on her phone

`/#/proberen` has a **Trillen** section: it prints which backend this device took, and three
buttons play the app's three shapes of buzz (the Flitsen flip tick, the round-end tap, the
celebration rattle). That is the whole test. Two things to look for:

1. The line says *via de iOS-schakelaartruc* on the iPhone. If it says *niet beschikbaar*,
   the detection missed (§5).
2. The buttons are felt. If the line is right but nothing is felt, see §5.

## 4. Tests

- `app/src/audio/haptics.test.ts` — `tickOffsets` for the patterns the app uses, the cap,
  and the zero cases.
- `app/tests/e2e/haptics-ios.spec.ts` — with `vibrate` removed (and, on Chromium, `switch`
  shimmed onto the input prototype), the test menu reports `ios-switch`, a sample button
  clicks the hidden switch once, and the celebration's hero buzz lands six clicks on it. On
  the ipad/iphone CI projects WebKit takes the real detection path.

Nothing here can check that a tick is *felt*: no browser in the test matrix has a Taptic
Engine. §3 is the only test of that.

## 5. What can go wrong, and the way out

- **Apple closes the door.** This is a quirk, not an API. One report says script-triggered
  toggles stopped firing in iOS 26.5, another library claims to work on 26.5 and later;
  neither could be verified from the sandbox. If the buttons in §3 are silent on a phone
  where the backend line is right, that is what happened. The fallback is then a no-op, which
  is where iOS was before.
- **User activation.** It is possible that Safari only fires the tick within a short window
  after a real touch. The Flitsen ticks happen under her finger; the celebration's hero buzz
  fires from a timer about 250ms after the reward screen mounts, which is within a second or
  two of her last tap in the game. If the first is felt and the second is not, this is why.
- **The hidden element.** It is off-screen at 1×1px with opacity 0, not `display: none`, on
  the assumption that Safari wants it rendered. If nothing is felt, try making it visible
  first.
- **The real fix** is a native shell (Capacitor, its Haptics plugin gives impact, notification
  and timed vibration). That is a distribution decision, not a haptics one, and is parked.
