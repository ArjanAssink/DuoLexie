import shopItemsJson from '@shared/curriculum/shopItems.json'
import type { ShopItem, AccessorySlot } from '@shared/src/types'

export const shopItems = shopItemsJson as ShopItem[]

/**
 * The shop's tabs, in order.
 *
 * `crop` is how that slot's items are framed on their tile: a head crop that shows the whole
 * hoed (the wizard hat's point and the wintermuts' pom-pom sit above the topbar crop), or a
 * chin-to-hem one for the two that a head crop would miss entirely.
 */
export const SHOP_SLOTS: { slot: AccessorySlot; label: string; crop: 'kapsel' | 'romp' }[] = [
  { slot: 'bril', label: 'Bril', crop: 'kapsel' },
  { slot: 'hoed', label: 'Op je hoofd', crop: 'kapsel' },
  { slot: 'oorbellen', label: 'Oorbellen', crop: 'kapsel' },
  { slot: 'sjaal', label: 'Sjaals', crop: 'romp' },
  { slot: 'jas', label: 'Jassen', crop: 'romp' },
]

export function itemsForSlot(slot: AccessorySlot): ShopItem[] {
  return shopItems.filter((item) => item.slot === slot)
}
