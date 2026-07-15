import { useEffect, useRef, useState } from 'react'

/**
 * Tappable Frida with laugh animation — from art/avatar animation/avatar/
 * frida-laugh.html. Tap/click/Enter: eyes close, mouth opens, bounce + "ha!"
 * bubbles for ~1s. The SVG is the canonical sass pose with two face groups.
 */
export function FridaTap({ className }: { className?: string }) {
  const [laughing, setLaughing] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function laugh() {
    window.clearTimeout(timer.current)
    setLaughing(false)
    // next frame, so the animation restarts on rapid taps
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setLaughing(true)
        timer.current = window.setTimeout(() => setLaughing(false), 1050)
      }),
    )
  }

  return (
    <div
      className={`frida-tap ${laughing ? 'laughing' : ''} ${className ?? ''}`}
      role="button"
      tabIndex={0}
      aria-label="Frida — tik om te laten lachen"
      onClick={laugh}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          laugh()
        }
      }}
    >
      <span className="ha ha1">ha!</span>
      <span className="ha ha2">ha!</span>
      <span className="ha ha3">ha!</span>
      <div className="frida-fig">
        <svg viewBox="0 0 240 260" width="100%">
          <path d="M120,118 C168,118 184,156 182,196 C180,234 156,250 120,250 C84,250 60,234 58,196 C56,156 72,118 120,118 Z" fill="#F5A03C" />
          <path d="M72,192 C66,206 68,224 78,234" stroke="#DD7E1F" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M168,192 C174,206 172,224 162,234" stroke="#DD7E1F" strokeWidth="5" strokeLinecap="round" fill="none" />
          <ellipse cx="120" cy="206" rx="30" ry="40" fill="#FFF1DB" />
          <path d="M112,220 Q120,225 128,220" stroke="#EDD3AC" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M108,233 Q120,239 132,233" stroke="#EDD3AC" strokeWidth="4" strokeLinecap="round" fill="none" />
          <rect x="88" y="184" width="24" height="62" rx="12" fill="#F5A03C" />
          <rect x="128" y="184" width="24" height="62" rx="12" fill="#F5A03C" />
          <path d="M95,238 L95,245 M105,238 L105,245 M135,238 L135,245 M145,238 L145,245" stroke="#DD7E1F" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="120" cy="90" rx="64" ry="56" fill="#F5A03C" />
          <ellipse cx="153" cy="88" rx="22" ry="21" fill="#FFF1DB" />
          <path d="M94,28 Q70,28 54,36 Q48,40 50,48 Q54,70 62,84 Q66,90 71,84 Q82,68 88,46 Q92,34 94,28 Z" fill="#DD7E1F" />
          <path d="M146,28 Q170,28 186,36 Q192,40 190,48 Q186,70 178,84 Q174,90 169,84 Q158,68 152,46 Q148,34 146,28 Z" fill="#DD7E1F" />
          <path d="M120,35 C107,35 101,48 100,64 C99,80 96,93 88,104 C99,114 141,114 152,104 C144,93 141,80 140,64 C139,48 133,35 120,35 Z" fill="#FFF1DB" />
          <path d="M120,42 Q123,49 129,54 Q123,59 120,66 Q117,59 111,54 Q117,49 120,42 Z" fill="#F5A03C" />
          <ellipse cx="88" cy="86" rx="20" ry="18" fill="#D9761C" opacity="0.5" />
          <ellipse cx="120" cy="126" rx="40" ry="28" fill="#FFF1DB" />
          <rect x="102" y="108" width="36" height="21" rx="10.5" fill="#45232F" />
          <ellipse cx="112" cy="114" rx="3.5" ry="2.5" fill="#6E4657" />
          <g className="normal-face">
            <ellipse cx="88" cy="88" rx="16" ry="18" fill="#FFF6E6" />
            <rect x="81" y="80" width="15" height="21" rx="7.5" fill="#45232F" />
            <path d="M71,86 Q88,79 105,86 L105,66 Q88,56 71,66 Z" fill="#E8912E" />
            <path d="M73,85 Q88,78 103,85" stroke="#C96C1B" strokeWidth="4" strokeLinecap="round" fill="none" />
            <ellipse cx="152" cy="88" rx="16" ry="18" fill="#FFF6E6" />
            <rect x="145" y="80" width="15" height="21" rx="7.5" fill="#45232F" />
            <path d="M135,86 Q152,79 169,86 L169,66 Q152,56 135,66 Z" fill="#FFF1DB" />
            <path d="M137,85 Q152,78 167,85" stroke="#E4C193" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M120,130 L120,137" stroke="#E4C193" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M103,137 Q111,145 120,137 Q129,145 137,137" stroke="#E4C193" strokeWidth="4" strokeLinecap="round" fill="none" />
          </g>
          <g className="laugh-face">
            <path d="M74,90 Q88,76 102,90" stroke="#B65E14" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M138,90 Q152,76 166,90" stroke="#CFA26B" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M98,131 Q120,134 142,131 Q137,152 120,152 Q103,152 98,131 Z" fill="#45232F" />
            <path d="M109,145 C109,153 131,153 131,145 C131,140 109,140 109,145 Z" fill="#F4778F" />
          </g>
        </svg>
      </div>
    </div>
  )
}
