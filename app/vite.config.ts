import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

/**
 * Word ids that have a recorded clip in public/audio/words/.
 *
 * Read from the directory at config time rather than globbed from src: these files live in
 * `public/`, so they are already copied verbatim, and an `import.meta.glob` over them would
 * emit a second bundled copy of every mp3. The app uses this to prefer recorded words when
 * filling a reading round (engine/exerciseSelector.ts), so the first rounds she plays are in
 * a family voice rather than browser speech.
 *
 * Caveat: it is a snapshot taken when Vite starts, so a clip recorded during a dev session
 * needs a dev-server restart to be noticed. Production builds always read it fresh.
 */
function recordedWords(): string[] {
  try {
    return readdirSync(fileURLToPath(new URL('./public/audio/words', import.meta.url)))
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => f.replace(/\.mp3$/, ''))
  } catch {
    return [] // the directory may not exist yet
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  define: {
    // cache-busts /audio/sounds/*.mp3 on every deploy — iOS Safari holds
    // onto cached media resources more stubbornly than Cache-Control implies
    __AUDIO_VERSION__: JSON.stringify(String(Date.now())),
    __RECORDED_WORDS__: JSON.stringify(recordedWords()),
  },
})
