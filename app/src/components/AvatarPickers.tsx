import { AvatarView } from './AvatarView'
import {
  useAvatar,
  SKIN_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIRSTYLES,
  HAIRSTYLE_LABELS,
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

  return (
    <>
      <section className="avatar-picker">
        <h2>Kapsel</h2>
        <div className="hairstyle-row">
          {HAIRSTYLES.map((style) => (
            <button
              key={style}
              className={`hairstyle-btn ${config.hairstyle === style ? 'selected' : ''}`}
              aria-label={HAIRSTYLE_LABELS[style]}
              aria-pressed={config.hairstyle === style}
              onClick={() => setHairstyle(style)}
            >
              <AvatarView config={{ ...config, hairstyle: style }} crop="topbar" />
            </button>
          ))}
        </div>
      </section>

      <section className="avatar-picker">
        <h2>Huidskleur</h2>
        <div className="swatch-row">
          {SKIN_COLORS.map((color) => (
            <button
              key={color}
              className={`swatch ${config.skinColor === color ? 'selected' : ''}`}
              style={{ background: color }}
              aria-label={`Huidskleur kiezen`}
              aria-pressed={config.skinColor === color}
              onClick={() => setSkinColor(color)}
            />
          ))}
        </div>
      </section>

      <section className="avatar-picker">
        <h2>Oogkleur</h2>
        <div className="swatch-row">
          {EYE_COLORS.map((color) => (
            <button
              key={color}
              className={`swatch ${config.eyeColor === color ? 'selected' : ''}`}
              style={{ background: color }}
              aria-label={`Oogkleur kiezen`}
              aria-pressed={config.eyeColor === color}
              onClick={() => setEyeColor(color)}
            />
          ))}
        </div>
      </section>

      <section className="avatar-picker">
        <h2>Haarkleur</h2>
        <div className="swatch-row">
          {HAIR_COLORS.map((color) => (
            <button
              key={color}
              className={`swatch ${config.hairColor === color ? 'selected' : ''}`}
              style={{ background: color }}
              aria-label={`Haarkleur kiezen`}
              aria-pressed={config.hairColor === color}
              onClick={() => setHairColor(color)}
            />
          ))}
        </div>
      </section>
    </>
  )
}
