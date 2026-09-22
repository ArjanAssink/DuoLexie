import { describe, it, expect } from 'vitest'
import { DRAWN_ITEM_IDS, earrings, glasses, hat, scarfLayer, torso } from './accessories'
import { shopItems, SHOP_SLOTS, itemsForSlot } from '../shop'

/**
 * The shop's two halves have to stay level: a price list in
 * `shared/curriculum/shopItems.json` and the art in accessories.tsx, joined only by a
 * string id. Nothing in the type system connects them, and either kind of drift is silent
 * in a way a player still pays for — an item with no art is a tile she buys that puts
 * nothing on, and art with no item is work nobody can reach.
 */
describe('shop catalogue', () => {
  it('draws every item on sale, and sells every item it draws', () => {
    expect([...DRAWN_ITEM_IDS].sort()).toEqual(shopItems.map((i) => i.id).sort())
  })

  it('has a tab for every slot, and items in every tab', () => {
    for (const { slot, label } of SHOP_SLOTS) {
      expect(itemsForSlot(slot).length, label).toBeGreaterThan(0)
    }
    expect(new Set(shopItems.map((i) => i.slot))).toEqual(new Set(SHOP_SLOTS.map((s) => s.slot)))
  })

  it('gives every item its own id, its own name and a price worth saving for', () => {
    expect(new Set(shopItems.map((i) => i.id)).size).toBe(shopItems.length)
    expect(new Set(shopItems.map((i) => i.name)).size).toBe(shopItems.length)
    for (const item of shopItems) {
      expect(item.price, item.id).toBeGreaterThan(0)
    }
  })

  it('renders something for every id, through the call the rig actually makes', () => {
    const layerFor = { oorbellen: earrings, bril: glasses, hoed: hat, sjaal: scarfLayer, jas: torso }
    for (const item of shopItems) {
      expect(layerFor[item.slot](item.id), item.id).not.toBeNull()
    }
  })

  it('falls back to the plain shirt rather than nothing when no jas is equipped', () => {
    expect(torso(undefined)).not.toBeNull()
    expect(torso('jas-die-niet-bestaat')).not.toBeNull()
  })
})
