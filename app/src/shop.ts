import shopItemsJson from '@shared/curriculum/shopItems.json'
import type { ShopItem, AccessorySlot } from '@shared/src/types'

export const shopItems = shopItemsJson as ShopItem[]

export const SHOP_SLOTS: { slot: AccessorySlot; label: string }[] = [
  { slot: 'bril', label: 'Bril' },
  { slot: 'hoed', label: 'Hoeden' },
  { slot: 'oorbellen', label: 'Oorbellen' },
]

export function itemsForSlot(slot: AccessorySlot): ShopItem[] {
  return shopItems.filter((item) => item.slot === slot)
}
