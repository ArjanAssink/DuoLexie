import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Weetje } from '@shared/src/types'
import { boldSegments, dealableWeetjes, getWeetje, narrationLines } from '../weetjes'
import { useProgress } from '../state/progress'
import { playWeetje, resumeAudio, stopNarration } from '../audio/audio'
import { Frida } from '../components/Frida'

/** Between the question and each of its options, when a card is read back (docs/weetjes.md §6). */
const OPTION_GAP_MS = 400

function Marked({ text }: { text: string }) {
  return (
    <>
      {boldSegments(text).map((seg, i) =>
        seg.bold ? <strong key={i}>{seg.text}</strong> : <span key={i}>{seg.text}</span>,
      )}
    </>
  )
}

/**
 * The Weetjesboek — every card she has kept, and the shape of the ones she has not
 * (docs/weetjes.md §8).
 *
 * The face-down cards are the point as much as the collected ones: seeing the book fill up
 * is the collecting motive, and it is also the one screen where a parent can see how far
 * she has got without asking her.
 *
 * Opening a card gives her the Bewaar beat again — fact, reveal, 🔊 — because re-hearing "je
 * bent niet alleen" months later is the whole reason the book exists.
 */
export function WeetjesboekScreen() {
  const navigate = useNavigate()
  const collectedWeetjes = useProgress((s) => s.collectedWeetjes)
  const autoRead = useProgress((s) => s.settings.autoRead)
  const [openId, setOpenId] = useState<string | null>(null)

  /** Only cards that may ever be dealt appear here — the book must not spoil an unreviewed one. */
  const cards = dealableWeetjes
  const collected = new Set(collectedWeetjes)
  const open: Weetje | undefined = openId ? getWeetje(openId) : undefined
  const openIndex = open ? cards.findIndex((c) => c.id === open.id) : -1
  /** Her own cards, in path order — what the arrows walk. */
  const mine = cards.filter((c) => collected.has(c.id))

  const cancelled = useRef(false)
  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
      stopNarration()
    }
  }, [])

  function read(card: Weetje): void {
    resumeAudio()
    stopNarration()
    void (async () => {
      await playWeetje(`${card.id}-fact`, narrationLines(card, 'fact'), OPTION_GAP_MS)
      if (cancelled.current) return
      await playWeetje(`${card.id}-reveal`, narrationLines(card, 'reveal'), OPTION_GAP_MS)
    })()
  }

  function openCard(card: Weetje): void {
    setOpenId(card.id)
    if (autoRead) read(card)
  }

  function step(delta: number): void {
    if (!open) return
    const at = mine.findIndex((c) => c.id === open.id)
    const next = mine[at + delta]
    if (next) openCard(next)
  }

  function close(): void {
    stopNarration()
    setOpenId(null)
  }

  return (
    <div className="weetjesboek-screen">
      <header className="avatar-header">
        <button className="quit" aria-label="Terug" onClick={() => navigate(-1)}>
          ‹
        </button>
        <h1>Mijn weetjes</h1>
        <span className="stat weetjesboek-count">
          {mine.length}/{cards.length}
        </span>
      </header>

      {mine.length === 0 ? (
        <div className="weetjesboek-empty">
          <Frida expression="happy" className="weetjesboek-frida" alt="" />
          <p>Speel een Weetje op het pad. Dan komt het hier.</p>
          <button className="btn-primary" onClick={() => navigate('/')}>
            Naar het pad
          </button>
        </div>
      ) : null}

      <div className="weetjesboek-grid">
        {cards.map((card) =>
          collected.has(card.id) ? (
            <button
              key={card.id}
              className="weetjesboek-card"
              onClick={() => openCard(card)}
              aria-label={card.tile}
            >
              <span className="weetjesboek-tile" aria-hidden="true">
                {card.tile}
              </span>
              <span className="weetjesboek-snippet">{firstWords(card.fact)}</span>
            </button>
          ) : (
            // Face down rather than absent: she can see how much book there is left, which is
            // the collecting motive, and a parent can see how far she is.
            <span key={card.id} className="weetjesboek-card facedown" aria-label="Nog niet gevonden">
              ?
            </span>
          ),
        )}
      </div>

      {open && (
        <div className="weetjesboek-open" role="dialog" aria-label="Weetje">
          <div className="weetje-card beat-bewaar">
            <span className="weetje-tile" aria-hidden="true">
              {open.tile}
            </span>
            <p className="weetje-text weetje-fact">
              <Marked text={open.fact} />
            </p>
            <p className="weetje-text weetje-reveal">
              <Marked text={open.reveal} />
            </p>
            <button className="weetje-speak" aria-label="Lees voor" onClick={() => read(open)}>
              🔊
            </button>
          </div>
          <div className="weetjesboek-nav">
            <button
              className="weetjesboek-step"
              aria-label="Vorige"
              onClick={() => step(-1)}
              disabled={mine.findIndex((c) => c.id === open.id) === 0}
            >
              ‹
            </button>
            <button className="btn-primary" onClick={close}>
              Klaar
            </button>
            <button
              className="weetjesboek-step"
              aria-label="Volgende"
              onClick={() => step(1)}
              disabled={mine.findIndex((c) => c.id === open.id) === mine.length - 1}
            >
              ›
            </button>
          </div>
          {openIndex === -1 && <p className="weetjesboek-missing">Dit weetje is er niet meer.</p>}
        </div>
      )}
    </div>
  )
}

/** The first three words of the fact, without its bold markers — the card's face-up label. */
function firstWords(fact: string): string {
  return boldSegments(fact)
    .map((s) => s.text)
    .join('')
    .split(/\s+/)
    .slice(0, 3)
    .join(' ')
}
