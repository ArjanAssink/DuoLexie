import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from './idbStorage'
import type { AccessorySlot, AvatarConfig, HairStyle } from '@shared/src/types'

const idbStateStorage: StateStorage = {
  getItem: (name) => idbGet(name),
  setItem: (name, value) => idbSet(name, value),
  removeItem: (name) => idbDel(name),
}

export const SKIN_COLORS = ['#F4C29C', '#E8A579', '#C98452', '#8D5A34', '#5C3A22'] as const
export const EYE_COLORS = ['#4E7DD1', '#3F9B5C', '#8B5A2B', '#5B4636', '#2F2A26'] as const
export const HAIR_COLORS = ['#2B2118', '#6B4226', '#B5651D', '#D9A441', '#7A4B9E', '#E85D75'] as const
export const HAIRSTYLES: HairStyle[] = ['kort', 'krullen', 'staart', 'lang']
export const HAIRSTYLE_LABELS: Record<HairStyle, string> = {
  kort: 'Kort',
  krullen: 'Krullen',
  staart: 'Staart',
  lang: 'Lang',
}

const defaultConfig: AvatarConfig = {
  skinColor: SKIN_COLORS[0],
  eyeColor: EYE_COLORS[0],
  hairColor: HAIR_COLORS[0],
  hairstyle: 'kort',
  equipped: {},
}

interface AvatarState {
  config: AvatarConfig
  /** ids of purchased shop items (colors/hairstyles stay free, so not tracked here) */
  ownedItems: string[]
  setSkinColor: (color: string) => void
  setEyeColor: (color: string) => void
  setHairColor: (color: string) => void
  setHairstyle: (style: HairStyle) => void
  addOwnedItem: (id: string) => void
  /** equip an owned item in its slot, or pass undefined to unequip that slot */
  equipItem: (slot: AccessorySlot, itemId: string | undefined) => void
}

export const useAvatar = create<AvatarState>()(
  persist(
    (set) => ({
      config: defaultConfig,
      ownedItems: [],
      setSkinColor: (skinColor) => set((s) => ({ config: { ...s.config, skinColor } })),
      setEyeColor: (eyeColor) => set((s) => ({ config: { ...s.config, eyeColor } })),
      setHairColor: (hairColor) => set((s) => ({ config: { ...s.config, hairColor } })),
      setHairstyle: (hairstyle) => set((s) => ({ config: { ...s.config, hairstyle } })),
      addOwnedItem: (id) =>
        set((s) => (s.ownedItems.includes(id) ? s : { ownedItems: [...s.ownedItems, id] })),
      equipItem: (slot, itemId) =>
        set((s) => ({
          config: { ...s.config, equipped: { ...s.config.equipped, [slot]: itemId } },
        })),
    }),
    {
      name: 'duolexie-avatar',
      storage: createJSONStorage(() => idbStateStorage),
      version: 1,
      migrate: (persisted) => persisted,
      // AvatarConfig is the likeliest object here to gain a field, and zustand's
      // default merge is shallow — a saved config would then arrive missing the
      // new key. Deep-fill config and equipped so that stays impossible.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AvatarState>
        return {
          ...current,
          ...p,
          config: {
            ...current.config,
            ...p.config,
            equipped: { ...current.config.equipped, ...p.config?.equipped },
          },
        }
      },
    },
  ),
)
