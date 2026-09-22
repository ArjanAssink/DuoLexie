/// <reference types="vite/client" />

/** Build timestamp injected via vite.config.ts's `define` — cache-busts audio URLs. */
declare const __AUDIO_VERSION__: string

/**
 * What is actually recorded, from the studio plugin's virtual module (vite-plugins/studio.ts).
 *
 * Sets rather than arrays, and the *same* Sets for the life of the page: in dev the plugin
 * refills them in place when a clip is written to public/audio/, so a clip the splitter wrote
 * a second ago is used by the next round with no dev-server restart and no page reload — the
 * report on screen survives (docs/recording-studio-v3.md §3.2). A production build gets the
 * same module with the lists read at build time and the update handler stripped out.
 */
declare module 'virtual:recorded-audio' {
  export const recordedSounds: ReadonlySet<string>
  export const recordedWords: ReadonlySet<string>
  export const recordedWeetjes: ReadonlySet<string>
  export const recordedSpelling: ReadonlySet<string>
}
