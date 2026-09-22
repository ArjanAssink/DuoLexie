import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from './idbStorage'
import type { AccessorySlot, AvatarConfig, HairStyle } from '@shared/src/types'

const idbStateStorage: StateStorage = {
  getItem: (name) => idbGet(name),
  setItem: (name, value) => idbSet(name, value),
  removeItem: (name) => idbDel(name),
}

/** One swatch: the colour itself plus the name behind it, which is also its button label. */
export interface ColorChoice {
  hex: string
  name: string
}

/** Skin tones, light to dark — the five original ones are still in here, in place. */
export const SKIN_COLORS: ColorChoice[] = [
  { hex: '#FBDCC2', name: 'Heel licht' },
  { hex: '#F4C29C', name: 'Licht' },
  { hex: '#EDB088', name: 'Licht getint' },
  { hex: '#E8A579', name: 'Getint' },
  { hex: '#D89460', name: 'Goudbruin' },
  { hex: '#C98452', name: 'Bruin' },
  { hex: '#AE6E42', name: 'Warmbruin' },
  { hex: '#8D5A34', name: 'Donkerbruin' },
  { hex: '#6E4529', name: 'Diepbruin' },
  { hex: '#5C3A22', name: 'Heel donker' },
]

export const EYE_COLORS: ColorChoice[] = [
  { hex: '#4E7DD1', name: 'Blauw' },
  { hex: '#7FB4E3', name: 'Lichtblauw' },
  { hex: '#6F7E8C', name: 'Grijs' },
  { hex: '#3F9B5C', name: 'Groen' },
  { hex: '#87A86B', name: 'Grijsgroen' },
  { hex: '#A07B3C', name: 'Amber' },
  { hex: '#8B5A2B', name: 'Hazelnoot' },
  { hex: '#5B4636', name: 'Bruin' },
  { hex: '#2F2A26', name: 'Donkerbruin' },
  { hex: '#8A5BD1', name: 'Paars' },
]

/** Haarkleuren die in het echt bestaan, donker naar licht. */
export const NATURAL_HAIR_COLORS: ColorChoice[] = [
  { hex: '#12100E', name: 'Zwart' },
  { hex: '#2B2118', name: 'Donkerbruin' },
  { hex: '#3E2B1C', name: 'Koffiebruin' },
  { hex: '#6B4226', name: 'Bruin' },
  { hex: '#8B5A3C', name: 'Kastanje' },
  { hex: '#A9703F', name: 'Lichtbruin' },
  { hex: '#B5651D', name: 'Roodbruin' },
  { hex: '#C8531F', name: 'Koperrood' },
  { hex: '#D9A441', name: 'Blond' },
  { hex: '#E3BC66', name: 'Goudblond' },
  { hex: '#EFD79B', name: 'Lichtblond' },
  { hex: '#F5E9CE', name: 'Platinablond' },
  { hex: '#9A938C', name: 'Grijs' },
  { hex: '#E9E6E0', name: 'Wit' },
]

/** En de rest. Dit is een spelletje, dus blauw haar mag gewoon. */
export const WILD_HAIR_COLORS: ColorChoice[] = [
  { hex: '#FF4FA3', name: 'Knalroze' },
  { hex: '#F79AC8', name: 'Zachtroze' },
  { hex: '#E85D75', name: 'Framboos' },
  { hex: '#E2342F', name: 'Vuurrood' },
  { hex: '#FF7A29', name: 'Oranje' },
  { hex: '#F7C531', name: 'Knalgeel' },
  { hex: '#BFE03A', name: 'Limegroen' },
  { hex: '#3FC55C', name: 'Grasgroen' },
  { hex: '#00C2A8', name: 'Mint' },
  { hex: '#1F9E86', name: 'Zeegroen' },
  { hex: '#2FD0E0', name: 'Turquoise' },
  { hex: '#37A0F0', name: 'Hemelsblauw' },
  { hex: '#2B4FD6', name: 'Kobaltblauw' },
  { hex: '#6B3FD1', name: 'Violet' },
  { hex: '#7A4B9E', name: 'Paars' },
  { hex: '#B06BE8', name: 'Lila' },
]

/** The two shelves the haarkleur picker shows, in order. */
export const HAIR_COLOR_GROUPS: { label: string; colors: ColorChoice[] }[] = [
  { label: 'Gewoon', colors: NATURAL_HAIR_COLORS },
  { label: 'Gek', colors: WILD_HAIR_COLORS },
]

/** Every preset haarkleur, for anything that just wants the flat list. */
export const HAIR_COLORS: ColorChoice[] = [...NATURAL_HAIR_COLORS, ...WILD_HAIR_COLORS]

// Spelled out rather than taken from the arrays above: those grew (and may grow again) and
// the starting look should not drift with them.
const defaultConfig: AvatarConfig = {
  skinColor: '#F4C29C',
  eyeColor: '#4E7DD1',
  hairColor: '#2B2118',
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
