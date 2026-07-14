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
  if (clipCache.has(soundId)) return clipCache.get(soundId)!
  const audio = new Audio(`/audio/sounds/${soundId}.mp3`)
  const result = await new Promise<HTMLAudioElement | null>((resolve) => {
    audio.oncanplaythrough = () => resolve(audio)
    audio.onerror = () => resolve(null)
    audio.load()
  })
  clipCache.set(soundId, result)
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

/** Short celebratory blip using WebAudio (no asset needed) */
let audioCtx: AudioContext | null = null
export function playEffect(kind: 'good' | 'bad' | 'fanfare'): void {
  try {
    audioCtx ??= new AudioContext()
    const notes = kind === 'good' ? [523, 659] : kind === 'bad' ? [220, 185] : [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator()
      const gain = audioCtx!.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.15, audioCtx!.currentTime + i * 0.12)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx!.currentTime + i * 0.12 + 0.25)
      osc.connect(gain).connect(audioCtx!.destination)
      osc.start(audioCtx!.currentTime + i * 0.12)
      osc.stop(audioCtx!.currentTime + i * 0.12 + 0.3)
    })
  } catch {
    // audio is never worth crashing a game over
  }
}
