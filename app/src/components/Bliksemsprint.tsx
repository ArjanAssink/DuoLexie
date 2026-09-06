import { useEffect, useLayoutEffect, useRef } from 'react'
import { Frida } from './Frida'

/** Total run time — keep in sync with the timings in theme.css (--bs-* block). */
const TOTAL_MS = 2000

function Bolt() {
  return (
    <svg viewBox="0 0 24 36" aria-hidden="true">
      <path
        d="M14 0 L3 21 L10.5 21 L8 36 L21 14 L13 14 Z"
        fill="var(--gold)"
        stroke="var(--gold-shadow)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Props {
  /** Fired once the celebration is over so the parent can unmount it. */
  onDone: () => void
}

/**
 * Bliksemsprint — Frida bolts across the screen on a 3-in-a-row streak.
 * Prototype + tunable dials: art/avatar animation/frida-lightning-dash.html
 *
 * Three nested layers, each owning one axis of motion: .bs-track travels
 * horizontally (percentages resolve against the overlay, so it stays
 * responsive), .bs-hop owns the vertical arc with per-keyframe easing, and
 * .bs-fig owns squash/stretch and lean. Keeping them separate is what lets the
 * hops be retimed without touching the traverse.
 *
 * Purely decorative and `pointer-events: none` — she can keep answering
 * straight through it.
 */
/** Design size of the band the motion was tuned against; everything scales off it. */
const BAND_H = 168

export function Bliksemsprint({ onDone }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Fit the band to the gap that actually exists between the header and the card.
  // A fixed height collides with the flash card on shorter viewports — the layout is
  // flex, so the gap is a different size on a phone, a tablet and a desktop window.
  useLayoutEffect(() => {
    const el = ref.current
    const screen = el?.parentElement
    const header = screen?.querySelector('.game-header')
    if (!el || !screen || !header) return

    const screenTop = screen.getBoundingClientRect().top
    const top = header.getBoundingClientRect().bottom - screenTop + 4
    const card = screen.querySelector('.flash-card, .game-stage > *:nth-child(2)')
    const limit = card ? card.getBoundingClientRect().top - screenTop - 4 : top + BAND_H
    const height = Math.max(72, Math.min(BAND_H, limit - top))
    const scale = height / BAND_H

    el.style.setProperty('--bs-band-top', `${Math.round(top)}px`)
    el.style.setProperty('--bs-band-h', `${Math.round(height)}px`)
    el.style.setProperty('--bs-figw', `${Math.round(92 * scale)}px`)
    el.style.setProperty('--bs-figh', `${Math.round(100 * scale)}px`)
    el.style.setProperty('--bs-hop', String(Math.round(56 * scale)))
  }, [])

  useEffect(() => {
    const t = setTimeout(onDone, TOTAL_MS)
    // cleared on unmount, so quitting mid-celebration can't fire a stray callback
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bs" ref={ref} aria-hidden="true">
      <div className="bs-flash" />

      {/* Everything animated is confined to a band under the header. The card she's
          reading and the grade buttons she's tapping stay clear — on a timed drill,
          covering the letter mid-item costs her the answer. */}
      <div className="bs-band">
        <div className="bs-hero">
          <Bolt />
        </div>

        <div className="bs-track">
          <div className="bs-hop">
            <div className="bs-fig">
              <Frida expression="happy" alt="" />
            </div>
          </div>
        </div>

        <span className="bs-puff bs-l1" />
        <span className="bs-puff bs-l2" />
        <span className="bs-puff bs-l3" />

        <span className="bs-bolt bs-l1"><Bolt /></span>
        <span className="bs-bolt bs-l2"><Bolt /></span>
        <span className="bs-bolt bs-l3"><Bolt /></span>

        <div className="bs-badge">
          <Bolt />
          3 op een rij!
        </div>
      </div>
    </div>
  )
}
