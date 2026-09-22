import { describe, it, expect } from 'vitest'
import { HAIR_GROUPS, HAIRSTYLES } from './hair'

/**
 * The catalogue itself, not the drawing — whether a kapsel *looks* right is a browser job.
 *
 * TypeScript already refuses a HairStyle id that no entry claims (see the `Catalogued`
 * guard in hair.tsx). What it cannot see is an entry that claims an id and then draws
 * nothing, or a shelf that has quietly shrunk below the ten options each one is meant to
 * offer — both of which show up as a bald head in the picker rather than as a build error.
 */
const paint = { hair: '#6B4226', shadow: '#2B2118' }

describe('kapsel catalogue', () => {
  const entries = HAIR_GROUPS.flatMap((g) => g.styles)

  it('offers at least ten kapsels per groep', () => {
    for (const { label, styles } of HAIR_GROUPS) {
      expect(styles.length, label).toBeGreaterThanOrEqual(10)
    }
  })

  it('has one entry per id, in the same order as HAIRSTYLES', () => {
    const ids = entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(HAIRSTYLES).toEqual(ids)
  })

  it('gives every kapsel its own label', () => {
    const labels = entries.map((e) => e.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('draws something for every kapsel', () => {
    for (const { id, back, front } of entries) {
      const drawn = [back?.(paint), front?.(paint)].filter(Boolean)
      expect(drawn.length, id).toBeGreaterThan(0)
    }
  })
})
