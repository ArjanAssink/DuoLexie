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

function speak(soundId: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(TTS_TEXT[soundId] ?? soundId)
    utterance.lang = 'nl-NL'
    utterance.rate = 0.7
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('nl'))
    if (voice) utterance.voice = voice
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  })
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

export async function playSound(soundId: string): Promise<void> {
  const clip = await loadClip(soundId)
  if (clip) {
    clip.currentTime = 0
    await clip.play().catch(() => speak(soundId))
    return new Promise((resolve) => {
      clip.onended = () => resolve()
    })
  }
  return speak(soundId)
}

const wordClipCache = new Map<string, HTMLAudioElement | null>()

function speakWord(text: string): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'nl-NL'
    utterance.rate = 0.85
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('nl'))
    if (voice) utterance.voice = voice
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  })
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
  if (clip) {
    clip.currentTime = 0
    await clip.play().catch(() => speakWord(text))
    return new Promise((resolve) => {
      clip.onended = () => resolve()
    })
  }
  return speakWord(text)
}

/** Short celebratory blip using WebAudio (no asset needed) */
let audioCtx: AudioContext | null = null
export function playEffect(kind: 'good' | 'bad' | 'fanfare' | 'fart'): void {
  try {
    audioCtx ??= new AudioContext()
    const ctx = audioCtx

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
