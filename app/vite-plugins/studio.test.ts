import { describe, it, expect } from 'vitest'
import { AUDIO_FOLDERS, safeBasename, safeFolder, safeId } from './studio.ts'

/**
 * §5 test 5. These three functions are the only thing between a string typed into a URL and a
 * path on Arjan's disk, and the middleware they guard runs with his user's permissions on a
 * server that is listening on the network whenever he uses `vite --host` to try a clip on the
 * iPad. Everything else in the plugin is I/O whose behaviour is Node's; this is the part that
 * is ours to get right.
 */
describe('safeBasename', () => {
  it('accepts the names the studio actually writes', () => {
    expect(safeBasename('woorden-2026-09-14-1902')).toBe('woorden-2026-09-14-1902')
    expect(safeBasename('klanken-2026-01-05-0704')).toBe('klanken-2026-01-05-0704')
    expect(safeBasename('weetjes-2026-09-16-2033')).toBe('weetjes-2026-09-16-2033')
  })

  it('refuses anything that could climb out of recordings/', () => {
    for (const bad of [
      '..', '../secrets', 'a/../..', '..%2f..', 'take/../..',
      '../../etc/passwd', 'a..b', 'x/..',
    ]) {
      expect(safeBasename(bad), bad).toBeNull()
    }
  })

  it('refuses a path rather than a name', () => {
    for (const bad of ['a/b', 'a\\b', '/etc/passwd', 'C:\\take', './take', 'sub/take']) {
      expect(safeBasename(bad), bad).toBeNull()
    }
  })

  it('refuses an absolute path even when it has no dots in it', () => {
    expect(safeBasename('/tmp/take')).toBeNull()
    expect(safeBasename('//server/share')).toBeNull()
  })

  it('refuses names that are not names', () => {
    for (const bad of ['', ' ', 'take ', ' take', 'take\n', 'take\0', '.hidden', '-lead', 'a'.repeat(121)]) {
      expect(safeBasename(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('refuses anything that is not a string, including the shapes a query string can yield', () => {
    for (const bad of [null, undefined, 42, {}, [], ['take'], true]) {
      expect(safeBasename(bad), String(bad)).toBeNull()
    }
  })
})

describe('safeFolder', () => {
  it('accepts exactly the three folders under public/audio', () => {
    expect(AUDIO_FOLDERS).toEqual(['sounds', 'words', 'weetjes', 'spelling'])
    for (const folder of AUDIO_FOLDERS) expect(safeFolder(folder)).toBe(folder)
  })

  it('refuses anything else, including a folder that merely exists', () => {
    for (const bad of ['', 'audio', 'public', '..', '../words', 'Words', 'raw-webm', null, 42, {}]) {
      expect(safeFolder(bad), String(bad)).toBeNull()
    }
  })
})

describe('safeId', () => {
  it('accepts word, klank and Weetjes clip ids', () => {
    expect(safeId('kat')).toBe('kat')
    expect(safeId('ij')).toBe('ij')
    expect(safeId('slim-doe')).toBe('slim-doe')
    expect(safeId('niet-alleen-reveal')).toBe('niet-alleen-reveal')
  })

  it('refuses an id that is really a path', () => {
    // the reject route joins this straight onto public/audio/<folder>/ and then renames it
    for (const bad of ['../../app/src/main', 'kat/../../x', 'kat.mp3/..', '/kat', 'a\\b']) {
      expect(safeId(bad), bad).toBeNull()
    }
  })
})
