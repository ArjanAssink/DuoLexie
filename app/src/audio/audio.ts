/**
 * Sound playback with graceful fallback:
 * 1. Family-recorded clip at /audio/sounds/{id}.mp3 (the real experience)
 * 2. Browser speech synthesis (nl-NL) as placeholder until clips are recorded
 */

const clipCache = new Map<string, HTMLAudioElement | null>()

/** Placeholder pronunciations for speechSynthesis — recordings replace these */
const TTS_TEXT: Record<string, string> = {
  uw: 'uuw', ng: 'ng', nk: 'nk', ch: 'g',
  b: 'bu', d: 'du', f: 'fff', g: 'gu', h: 'hu', j: 'ju', k: 'ku', l: 'lll',
  m: 'mmm', n: 'nnn', p: 'pu', r: 'rrr', s: 'sss', t: 'tu', v: 'vvv', w: 'wu', z: 'zzz',
}

/**
 * Cap on how long one utterance may keep a caller waiting.
 *
 * `onend`/`onerror` are the only way to know speech finished, and there are real setups
 * where neither ever fires: a device with no nl-NL voice installed, an engine that drops the
 * utterance silently, a backgrounded tab. That used to cost at most a delayed transition,
 * because nothing waited on speech to *continue*. Hardop lezen now gates grading on having
 * heard the word (games/HardopLezen.tsx `reveal`), so an utterance that never ends would
 * leave the card permanently ungradeable — the same shape of bug as the rejected `play()`
 * that playWithFallback's CLIP_TIMEOUT_MS guards against, and it needs the same backstop.
 */
const SPEECH_TIMEOUT_MS = 6000

/** Runs one utterance to completion, and always resolves — see SPEECH_TIMEOUT_MS. */
function utter(text: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    function finish() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, SPEECH_TIMEOUT_MS)
    // Wrapped because audio is never worth hanging a game over, and these calls are
    // fire-and-forget from the games: an uncaught throw here would be a silent, permanent
    // no-op rather than a crash.
    try {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'nl-NL'
      utterance.rate = rate
      const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('nl'))
      if (voice) utterance.voice = voice
      utterance.onend = finish
      utterance.onerror = finish
      speechSynthesis.cancel()
      speechSynthesis.speak(utterance)
    } catch {
      finish()
    }
  })
}

/** Stops anything currently being spoken — call it when a game unmounts mid-word. */
export function stopSpeech(): void {
  try {
    speechSynthesis.cancel()
  } catch {
    // nothing to stop, or no speechSynthesis at all
  }
}

function speak(soundId: string): Promise<void> {
  return utter(TTS_TEXT[soundId] ?? soundId, 0.7)
}

async function loadClip(soundId: string): Promise<HTMLAudioElement | null> {
  const cached = clipCache.get(soundId)
  if (cached) return cached
  const audio = new Audio(`/audio/sounds/${soundId}.mp3?v=${__AUDIO_VERSION__}`)
  const result = await new Promise<HTMLAudioElement | null>((resolve) => {
    audio.oncanplaythrough = () => resolve(audio)
    audio.onerror = () => resolve(null)
    audio.load()
  })
  // only cache success — a miss may just mean the clip hasn't been recorded
  // yet, and shouldn't be remembered as permanently missing for the session
  if (result) clipCache.set(soundId, result)
  return result
}

/**
 * Bound on how long a clip may take before this gives up on it and resolves
 * anyway — guards against a real element that never fires `ended` or `error`
 * (a backgrounded tab, odd browser behaviour) hanging a caller the same way a
 * rejected `play()` used to.
 */
const CLIP_TIMEOUT_MS = 8000

/**
 * Plays a clip, falling back to speech if `play()` rejects (iOS autoplay policy,
 * or an `AbortError` from an interrupting load) — and always resolves.
 *
 * The bug this replaces: the old code did
 *   `await clip.play().catch(() => speak(...)); return new Promise(r => clip.onended = r)`
 * — when `play()` rejected, the fallback ran, but the *returned* promise still
 * waited on the clip's `ended` event, which a clip that never played can never
 * fire. Every caller (Hardop lezen's `commit()`) awaits this, so that hung the
 * game forever with no way out but quitting. `.onended =` was also a plain
 * assignment, so two overlapping calls on the same cached element silently
 * dropped the first call's handler — the addEventListener/removeEventListener
 * pair below can't lose one call's listener to another's.
 */
async function playWithFallback(
  clip: HTMLAudioElement,
  fallback: () => Promise<void>,
): Promise<void> {
  clip.currentTime = 0
  return new Promise((resolve) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout>
    function finish() {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clip.removeEventListener('ended', finish)
      clip.removeEventListener('error', finish)
      resolve()
    }
    clip.addEventListener('ended', finish)
    clip.addEventListener('error', finish)
    timeout = setTimeout(finish, CLIP_TIMEOUT_MS)
    clip.play().catch(() => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clip.removeEventListener('ended', finish)
      clip.removeEventListener('error', finish)
      fallback().then(resolve)
    })
  })
}

export async function playSound(soundId: string): Promise<void> {
  const clip = await loadClip(soundId)
  if (clip) return playWithFallback(clip, () => speak(soundId))
  return speak(soundId)
}

const wordClipCache = new Map<string, HTMLAudioElement | null>()

function speakWord(text: string): Promise<void> {
  return utter(text, 0.85)
}

async function loadWordClip(wordId: string): Promise<HTMLAudioElement | null> {
  const cached = wordClipCache.get(wordId)
  if (cached) return cached
  const audio = new Audio(`/audio/words/${wordId}.mp3?v=${__AUDIO_VERSION__}`)
  const result = await new Promise<HTMLAudioElement | null>((resolve) => {
    audio.oncanplaythrough = () => resolve(audio)
    audio.onerror = () => resolve(null)
    audio.load()
  })
  if (result) wordClipCache.set(wordId, result)
  return result
}

/** Same fallback strategy as playSound, but for whole words (own cache, own TTS text: the literal word). */
export async function playWord(wordId: string, text: string): Promise<void> {
  const clip = await loadWordClip(wordId)
  if (clip) return playWithFallback(clip, () => speakWord(text))
  return speakWord(text)
}

export type EffectKind =
  | 'good'
  | 'bad'
  | 'fanfare'
  | 'fart'
  /** Hardop lezen: a card landing on the "goed" pile — a bright bell, not the 2-note blip */
  | 'ding'
  /** a card dealing in */
  | 'swish'
  /** the reading window ending, just before the word is spoken */
  | 'pop'
  /** one gem on the reward screen's count-up; `step` walks it up a major triad */
  | 'tick'

/** Short celebratory blip using WebAudio (no asset needed) */
let audioCtx: AudioContext | null = null

/**
 * Nudges the AudioContext out of `suspended`, which is where iOS Safari keeps it until a
 * real user gesture. Called from the first pointerdown in a game, so the very first `ding`
 * of a round isn't the one that gets swallowed.
 */
export function resumeAudio(): void {
  try {
    audioCtx ??= new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
  } catch {
    // audio is never worth crashing a game over
  }
}

/**
 * @param step for `tick` only — which gem in the count-up this is, so the pitch climbs
 */
export function playEffect(kind: EffectKind, step = 0): void {
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx

    if (kind === 'ding') {
      // two partials an octave apart, struck together and decaying like a small bell; the
      // short upward glide on the fundamental is what makes it read as "ding" and not "beep"
      const now = ctx.currentTime
      for (const [freq, level, decay] of [
        [1046.5, 0.16, 0.62],
        [2093, 0.06, 0.42],
      ]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq * 0.94, now)
        osc.frequency.exponentialRampToValueAtTime(freq, now + 0.03)
        gain.gain.setValueAtTime(level, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + decay + 0.02)
      }
      return
    }

    if (kind === 'swish') {
      // filtered noise burst — a card sliding off a deck
      const now = ctx.currentTime
      const length = Math.floor(ctx.sampleRate * 0.09)
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.setValueAtTime(1200, now)
      band.frequency.exponentialRampToValueAtTime(3200, now + 0.09)
      band.Q.value = 0.8
      const gain = ctx.createGain()
      gain.gain.value = 0.09
      src.connect(band).connect(gain).connect(ctx.destination)
      src.start(now)
      return
    }

    if (kind === 'pop') {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.06)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.1)
      return
    }

    if (kind === 'tick') {
      // C5-E5-G5-C6 and up: each gem a step brighter than the last, capped so a long
      // count-up doesn't end in a whistle
      const now = ctx.currentTime
      const scale = [523.25, 659.25, 784, 1046.5, 1318.5]
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = scale[Math.min(step, scale.length - 1)]
      gain.gain.setValueAtTime(0.09, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.14)
      return
    }

    if (kind === 'fart') {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(150, now)
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.4)
      gain.gain.setValueAtTime(0.16, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42)
      // wobbly "buzz" via low-frequency modulation of the main oscillator's pitch
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.frequency.value = 35
      lfoGain.gain.value = 18
      lfo.connect(lfoGain).connect(osc.frequency)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      lfo.start(now)
      osc.stop(now + 0.45)
      lfo.stop(now + 0.45)
      return
    }

    const notes = kind === 'good' ? [523, 659] : kind === 'bad' ? [220, 185] : [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.12)
      osc.stop(ctx.currentTime + i * 0.12 + 0.3)
    })
  } catch {
    // audio is never worth crashing a game over
  }
}

/** Light haptic buzz where supported (Android Chrome); no-op on iOS Safari, which lacks the API. */
export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // vibration is a nice-to-have, never worth crashing a game over
  }
}
