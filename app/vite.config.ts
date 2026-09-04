import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

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
  },
})
