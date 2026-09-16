import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AvatarView } from '../components/AvatarView'
import { AvatarPickers } from '../components/AvatarPickers'
import { WipNote } from '../components/WipNote'
import { BookIcon, GemIcon } from '../components/Icons'
import { MAX_PLAYER_NAME, normalizePlayerName, useProgress } from '../state/progress'
import { useAvatar } from '../state/avatar'

export function AvatarScreen() {
  const navigate = useNavigate()
  const gems = useProgress((s) => s.gems)
  const playerName = useProgress((s) => s.settings.playerName)
  const setPlayerName = useProgress((s) => s.setPlayerName)
  const config = useAvatar((s) => s.config)
  const collectedWeetjes = useProgress((s) => s.collectedWeetjes)
  const autoRead = useProgress((s) => s.settings.autoRead)
  const toggleAutoRead = useProgress((s) => s.toggleAutoRead)

  // Saved on blur rather than on every keystroke: this field is a correction, not the
  // delight moment the welkom-flow's live bubble is, and writing per keystroke would push a
  // persist to IndexedDB for every letter.
  const [draftName, setDraftName] = useState(playerName)

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

      {/* docs/weetjes.md §8 — the way back into the Weetjesboek from anywhere she can reach
          her profile, with the count on it so a full book is visible from here. */}
      <button className="btn-primary weetjesboek-cta" onClick={() => navigate('/weetjes')}>
        <BookIcon fill="#FFFFFF" size={22} /> Mijn weetjes ({collectedWeetjes.length})
      </button>

      <AvatarPickers />

      <section className="avatar-picker about-section">
        <h2>Over DuoLexie</h2>
        <label className="about-name">
          <span>Je naam</span>
          <input
            className="welkom-name-input"
            type="text"
            value={draftName}
            placeholder="Je naam"
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="done"
            inputMode="text"
            maxLength={MAX_PLAYER_NAME}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              // Normalize the field too, not just the store: leaving "  Lotte " on screen
              // after saving "Lotte" would read as if the spaces had been kept.
              const clean = normalizePlayerName(draftName)
              setDraftName(clean)
              setPlayerName(clean)
            }}
          />
        </label>
        <label className="about-toggle">
          <input type="checkbox" checked={autoRead} onChange={toggleAutoRead} />
          <span>Weetjes automatisch voorlezen</span>
        </label>
        <WipNote />
        <button className="about-intro-btn" onClick={() => navigate('/welkom')}>
          Introductie opnieuw bekijken
        </button>
      </section>
    </div>
  )
}
