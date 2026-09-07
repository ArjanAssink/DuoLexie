/// <reference types="vite/client" />

/** Build timestamp injected via vite.config.ts's `define` — cache-busts audio URLs. */
declare const __AUDIO_VERSION__: string

/** Word ids with a recorded clip in public/audio/words/, injected via vite.config.ts. */
declare const __RECORDED_WORDS__: string[]
