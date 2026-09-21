import type { AvatarConfig, HairStyle } from '@shared/src/types'
import { AvatarView } from './AvatarView'
import { HAIR_GROUPS } from './hair'
import {
  useAvatar,
  SKIN_COLORS,
  EYE_COLORS,
  HAIR_COLOR_GROUPS,
  HAIR_COLORS,
  type ColorChoice,
} from '../state/avatar'

/**
 * The four free avatar choices — kapsel, huidskleur, oogkleur, haarkleur — as one block.
 *
 * Used by Profiel (screens/AvatarScreen) and by step 3 of the welkom-flow
 * (screens/OnboardingScreen). Both write straight to the avatar store as you tap, so the
 * statbar head on the leerpad is already up to date by the time either screen is left.
 *
 * Shop accessories deliberately live only in AvatarScreen: they cost gems, and a player
 * meeting this for the first time in the welkom-flow has none.
 */
export function AvatarPickers() {
  const config = useAvatar((s) => s.config)
  const setSkinColor = useAvatar((s) => s.setSkinColor)
  const setEyeColor = useAvatar((s) => s.setEyeColor)
  const setHairColor = useAvatar((s) => s.setHairColor)
  const setHairstyle = useAvatar((s) => s.setHairstyle)

  // A kapsel is only recognisable as itself once it has hair on it, and the picker heads are
  // small. Near-white on white would leave half the shelf looking bald, so the thumbnails
  // borrow a readable colour while the real one is that pale.
  const thumbColor = isVeryPale(config.hairColor) ? '#8B5A3C' : config.hairColor
  const custom = !HAIR_COLORS.some((c) => c.hex.toLowerCase() === config.hairColor.toLowerCase())

  return (
    <>
      <section className="avatar-picker">
        <h2>Kapsel</h2>
        {HAIR_GROUPS.map(({ group, label, styles }) => (
          <div className="hairstyle-group" key={group}>
            <h3>{label}</h3>
            <div className="hairstyle-row">
              {styles.map(({ id, label: name }) => (
                <HairstyleButton
                  key={id}
                  id={id}
                  name={name}
                  config={{ ...config, hairColor: thumbColor }}
                  selected={config.hairstyle === id}
                  onPick={setHairstyle}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="avatar-picker">
        <h2>Huidskleur</h2>
        <Swatches colors={SKIN_COLORS} selected={config.skinColor} onPick={setSkinColor} />
      </section>

      <section className="avatar-picker">
        <h2>Oogkleur</h2>
        <Swatches colors={EYE_COLORS} selected={config.eyeColor} onPick={setEyeColor} />
      </section>

      <section className="avatar-picker">
        <h2>Haarkleur</h2>
        {HAIR_COLOR_GROUPS.map(({ label, colors }) => (
          <div className="swatch-group" key={label}>
            <h3>{label}</h3>
            <Swatches colors={colors} selected={config.hairColor} onPick={setHairColor} />
          </div>
        ))}
        <div className="swatch-group">
          <h3>Zelf mengen</h3>
          {/* The 30 swatches above are the quick way; this is the escape hatch for the exact
              colour she has in her head. The store takes any hex, so nothing else cares. */}
          <label className={`custom-color ${custom ? 'selected' : ''}`}>
            <input
              type="color"
              value={config.hairColor}
              aria-label="Haarkleur zelf mengen"
              onChange={(e) => setHairColor(e.target.value)}
            />
            <span className="custom-color-dot" style={{ background: config.hairColor }} />
            <span>Kies je eigen kleur</span>
          </label>
        </div>
      </section>
    </>
  )
}

function HairstyleButton({
  id,
  name,
  config,
  selected,
  onPick,
}: {
  id: HairStyle
  name: string
  config: AvatarConfig
  selected: boolean
  onPick: (style: HairStyle) => void
}) {
  return (
    <button
      className={`hairstyle-btn ${selected ? 'selected' : ''}`}
      aria-label={name}
      aria-pressed={selected}
      onClick={() => onPick(id)}
    >
      <AvatarView config={{ ...config, hairstyle: id }} crop="kapsel" />
    </button>
  )
}

function Swatches({
  colors,
  selected,
  onPick,
}: {
  colors: ColorChoice[]
  selected: string
  onPick: (hex: string) => void
}) {
  return (
    <div className="swatch-row">
      {colors.map(({ hex, name }) => (
        <button
          key={hex}
          className={`swatch ${selected.toLowerCase() === hex.toLowerCase() ? 'selected' : ''}`}
          style={{ background: hex }}
          aria-label={name}
          aria-pressed={selected.toLowerCase() === hex.toLowerCase()}
          onClick={() => onPick(hex)}
        />
      ))}
    </div>
  )
}

/** Rough perceived lightness — enough to spot platinum/white/pastel against a white tile. */
function isVeryPale(hex: string): boolean {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (full.length !== 6) return false
  const num = Number.parseInt(full, 16)
  if (Number.isNaN(num)) return false
  const r = (num >> 16) & 0xff
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.85
}
