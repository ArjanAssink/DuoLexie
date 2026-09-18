import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { studioPlugin } from './vite-plugins/studio.ts'

// https://vite.dev/config/
export default defineConfig({
  // The studio plugin serves `virtual:recorded-audio` in both dev and build, and adds the
  // dev-only /__studio/ middleware that lets the recording studio write a take, run the
  // splitter and read the report back without a terminal (docs/recording-studio-v3.md §3).
  // Its middleware lives in configureServer, which a build never calls, so nothing under
  // /__studio reaches dist/.
  plugins: [react(), studioPlugin()],
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
  },
})
