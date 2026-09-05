import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AccessorySlot, ShopItem } from '@shared/src/types'
import { AvatarView } from '../components/AvatarView'
import { GemIcon } from '../components/Icons'
import { useAvatar } from '../state/avatar'
import { useProgress } from '../state/progress'
import { SHOP_SLOTS, itemsForSlot } from '../shop'

export function ShopScreen() {
  const navigate = useNavigate()
  const gems = useProgress((s) => s.gems)
  const spendGems = useProgress((s) => s.spendGems)
  const config = useAvatar((s) => s.config)
  const ownedItems = useAvatar((s) => s.ownedItems)
  const addOwnedItem = useAvatar((s) => s.addOwnedItem)
  const equipItem = useAvatar((s) => s.equipItem)
  const [activeSlot, setActiveSlot] = useState<AccessorySlot>(SHOP_SLOTS[0].slot)

  function handleTap(item: ShopItem) {
    const owned = ownedItems.includes(item.id)
    const isEquipped = config.equipped?.[item.slot] === item.id
    if (owned) {
      equipItem(item.slot, isEquipped ? undefined : item.id)
      return
    }
    if (spendGems(item.price)) {
      addOwnedItem(item.id)
      equipItem(item.slot, item.id)
    }
  }

  return (
    <div className="shop-screen">
      <header className="avatar-header">
        <button className="quit" aria-label="Terug" onClick={() => navigate(-1)}>
          ‹
        </button>
        <h1>Winkel</h1>
        <span className="stat gems shop-gems">
          <GemIcon /> {gems}
        </span>
      </header>

      <div className="avatar-stage">
        <AvatarView config={config} crop="full" className="avatar-big" />
      </div>

      <div className="shop-tabs">
        {SHOP_SLOTS.map(({ slot, label }) => (
          <button
            key={slot}
            className={`shop-tab ${activeSlot === slot ? 'selected' : ''}`}
            aria-pressed={activeSlot === slot}
            onClick={() => setActiveSlot(slot)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="shop-grid">
        {itemsForSlot(activeSlot).map((item) => {
          const owned = ownedItems.includes(item.id)
          const isEquipped = config.equipped?.[item.slot] === item.id
          const affordable = gems >= item.price
          return (
            <button
              key={item.id}
              className={`shop-item ${isEquipped ? 'equipped' : ''} ${
                !owned && !affordable ? 'unaffordable' : ''
              }`}
              disabled={!owned && !affordable}
              onClick={() => handleTap(item)}
            >
              <AvatarView
                config={{ ...config, equipped: { [item.slot]: item.id } }}
                crop="topbar"
              />
              <span className="shop-item-name">{item.name}</span>
              <span className="shop-item-price">
                {isEquipped ? (
                  'Gedragen ✓'
                ) : owned ? (
                  'Dragen'
                ) : (
                  <>
                    <GemIcon size={16} /> {item.price}
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
