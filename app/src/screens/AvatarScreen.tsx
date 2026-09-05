import { useNavigate } from 'react-router-dom'
import { AvatarView } from '../components/AvatarView'
import { GemIcon } from '../components/Icons'
import { useProgress } from '../state/progress'
import {
  useAvatar,
  SKIN_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIRSTYLES,
  HAIRSTYLE_LABELS,
} from '../state/avatar'

export function AvatarScreen() {
  const navigate = useNavigate()
  const gems = useProgress((s) => s.gems)
  const config = useAvatar((s) => s.config)
  const setSkinColor = useAvatar((s) => s.setSkinColor)
  const setEyeColor = useAvatar((s) => s.setEyeColor)
  const setHairColor = useAvatar((s) => s.setHairColor)
  const setHairstyle = useAvatar((s) => s.setHairstyle)

  return (
    <div className="avatar-screen">
      <header className="avatar-header">
        <button className="quit" aria-label="Terug" onClick={() => navigate(-1)}>
          ‹
        </button>
        <h1>Mijn avatar</h1>
        <span className="stat gems shop-gems">
          <GemIcon /> {gems}
        </span>
      </header>

      <div className="avatar-stage">
        <AvatarView config={config} crop="full" className="avatar-big" />
      </div>

      <button className="btn-primary shop-cta" onClick={() => navigate('/winkel')}>
        Naar de winkel
      </button>

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
    </div>
  )
}
