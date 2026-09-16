import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { normalizePlayerName, MAX_PLAYER_NAME, useProgress } from './progress'

/**
 * The name rules and the onboarding flag, from the store's own actions.
 *
 * Small, but the trimming is where a stray space in "Hoi, {naam}!" would come from, and the
 * idempotence is what stops re-watching the intro from Profiel rewriting when she first
 * arrived (docs/onboarding-welkom.md ss8).
 *
 * The store's persist middleware writes to IndexedDB on every set(), which this node
 * environment has none of, so the storage is swapped for a Map first. Nothing here is about
 * persistence — it just has to go somewhere that is not a rejected promise per assertion.
 */
describe('normalizePlayerName', () => {
  it('trims the ends and collapses whitespace inside', () => {
    expect(normalizePlayerName('  Lotte  ')).toBe('Lotte')
    expect(normalizePlayerName('Anne   Marie')).toBe('Anne Marie')
    expect(normalizePlayerName('\tLotte\n')).toBe('Lotte')
  })

  it('treats whitespace-only as no name at all', () => {
    expect(normalizePlayerName('   ')).toBe('')
    expect(normalizePlayerName('')).toBe('')
  })

  it('caps at MAX_PLAYER_NAME without leaving a trailing space behind', () => {
    const long = 'Abcdefghijklmnopqrs Tuvwxyz' // 20th character is the space
    expect(long[MAX_PLAYER_NAME - 1]).toBe(' ')
    expect(normalizePlayerName(long)).toBe('Abcdefghijklmnopqrs')
    expect(normalizePlayerName('x'.repeat(40))).toHaveLength(MAX_PLAYER_NAME)
  })
})

describe('settings.playerName / onboardedAt', () => {
  beforeAll(() => {
    const mem = new Map<string, string>()
    useProgress.persist.setOptions({
      storage: createJSONStorage(() => ({
        getItem: (name) => mem.get(name) ?? null,
        setItem: (name, value) => void mem.set(name, value),
        removeItem: (name) => void mem.delete(name),
      })),
    })
  })

  beforeEach(() => {
    useProgress.setState((s) => ({ settings: { ...s.settings, playerName: '', onboardedAt: null } }))
  })

  it('setPlayerName stores the normalized name', () => {
    useProgress.getState().setPlayerName('  lotte   maria  ')
    expect(useProgress.getState().settings.playerName).toBe('lotte maria')
  })

  it('setPlayerName with nothing in it clears the name', () => {
    useProgress.getState().setPlayerName('Lotte')
    useProgress.getState().setPlayerName('   ')
    expect(useProgress.getState().settings.playerName).toBe('')
  })

  it('setPlayerName leaves the rest of settings alone', () => {
    useProgress.getState().toggleFont()
    useProgress.getState().noteSelfSwipe()
    useProgress.getState().setPlayerName('Lotte')
    expect(useProgress.getState().settings.font).toBe('dyslexie')
    expect(useProgress.getState().settings.selfSwipes).toBe(1)
    useProgress.getState().toggleFont() // back to the default for the next test
  })

  it('completeOnboarding records an ISO instant', () => {
    useProgress.getState().completeOnboarding()
    const at = useProgress.getState().settings.onboardedAt
    expect(at).toBeTruthy()
    expect(new Date(at!).toISOString()).toBe(at)
  })

  it('completeOnboarding is idempotent — a second run keeps the first timestamp', () => {
    useProgress.getState().completeOnboarding()
    const first = useProgress.getState().settings.onboardedAt
    useProgress.getState().completeOnboarding()
    expect(useProgress.getState().settings.onboardedAt).toBe(first)
  })
})
