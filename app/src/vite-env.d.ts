/// <reference types="vite/client" />

/** Build timestamp injected via vite.config.ts's `define` — cache-busts audio URLs. */
declare const __AUDIO_VERSION__: string

/** Word ids with a recorded clip in public/audio/words/, injected via vite.config.ts. */
declare const __RECORDED_WORDS__: string[]

/** Weetjes clip ids (`<card id>-fact|doe|reveal`) recorded in public/audio/weetjes/. */
declare const __RECORDED_WEETJES__: string[]
