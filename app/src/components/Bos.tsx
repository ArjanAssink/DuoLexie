import type { ReactNode } from 'react'

/**
 * The forest the leerpad runs through (docs/bospad.md).
 *
 * Everything here is scenery: flat two-tone shapes in the same paper-cutout language as
 * Frida and the avatar, drawn inline as plain SVG rather than through <use>, so a season's
 * colours reach them as ordinary CSS custom properties on the section they sit in — no
 * shadow trees, nothing for WebKit to disagree about. Every fill is a class, and the
 * `.bos` rules in theme.css map those classes onto the season's palette.
 *
 * Nothing in this file is interactive or announced: the sprites are aria-hidden and let
 * pointer events through, so the coins underneath keep their full tap area.
 */

/* ---------------------------------------------------------------- sprites */

function Den({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="bos-sprite" viewBox="0 0 60 100" style={style} aria-hidden="true">
      <rect className="bos-stam" x="26" y="70" width="8" height="30" rx="2" />
      <path className="bos-blad-1" d="M30,4 L54,44 L6,44 Z" />
      <path className="bos-blad-2" d="M30,24 L58,68 L2,68 Z" />
      <path className="bos-blad-3" d="M30,44 L60,88 L0,88 Z" />
      <path className="bos-blad-licht" d="M30,24 L44,46 L30,46 Z" opacity="0.55" />
    </svg>
  )
}

function Boom({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="bos-sprite" viewBox="0 0 80 100" style={style} aria-hidden="true">
      <rect className="bos-stam" x="35" y="66" width="10" height="34" rx="3" />
      <circle className="bos-blad-2" cx="40" cy="42" r="34" />
      <circle className="bos-blad-licht" cx="30" cy="34" r="22" opacity="0.7" />
      <circle className="bos-blad-3" cx="52" cy="52" r="16" opacity="0.6" />
    </svg>
  )
}

function Struik({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="bos-sprite" viewBox="0 0 60 30" style={style} aria-hidden="true">
      <ellipse className="bos-blad-1" cx="22" cy="20" rx="20" ry="11" />
      <ellipse className="bos-blad-licht" cx="40" cy="20" rx="18" ry="10" />
      <ellipse className="bos-blad-licht" cx="30" cy="14" rx="14" ry="9" opacity="0.8" />
    </svg>
  )
}

function Paddenstoel({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="bos-sprite" viewBox="0 0 24 26" style={style} aria-hidden="true">
      <rect className="bos-creme" x="9" y="12" width="6" height="14" rx="3" />
      <path className="bos-accent" d="M1,14 C1,2 23,2 23,14 Z" />
      <circle className="bos-creme" cx="8" cy="8" r="2" />
      <circle className="bos-creme" cx="16" cy="6" r="1.6" />
    </svg>
  )
}

function Gras({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="bos-sprite" viewBox="0 0 24 14" style={style} aria-hidden="true">
      <path
        className="bos-gras"
        d="M2,14 Q6,4 8,14 M9,14 Q12,0 15,14 M16,14 Q20,5 23,14"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Steen({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="bos-sprite" viewBox="0 0 30 18" style={style} aria-hidden="true">
      <ellipse className="bos-steen" cx="15" cy="10" rx="14" ry="7" />
      <ellipse className="bos-steen-licht" cx="12" cy="8" rx="8" ry="3.5" opacity="0.8" />
    </svg>
  )
}

const SPRITES = { den: Den, boom: Boom, struik: Struik, paddenstoel: Paddenstoel, gras: Gras, steen: Steen }
type Kind = keyof typeof SPRITES

/** width : height, so a slot only has to say how wide it is */
const RATIO: Record<Kind, number> = { den: 100 / 60, boom: 100 / 80, struik: 30 / 60, paddenstoel: 26 / 24, gras: 14 / 24, steen: 18 / 30 }

/* ---------------------------------------------------------------- placement */

interface Slot {
  kind: Kind
  /** which margin it hugs; the coins zig-zag through the middle */
  side: 'links' | 'rechts'
  /** distance in from that edge, px — negative lets a big tree bleed off it */
  inset: number
  /**
   * down the section, as a fraction of its height. Measured from the top unless `anchor`
   * says 'onder', which measures up from the bottom instead — the section clips its
   * overflow, so a tree near the bottom has to be pinned there or its crown gets cut.
   */
  top: number
  anchor?: 'onder'
  /** px wide */
  width: number
}

/**
 * The scenery of one unit. The two big trees each side anchor it; the rest fills in.
 *
 * Positions are fractions of the section's height so a four-lesson unit and a
 * five-lesson unit get the same forest, just stretched. The left margin below ~30% is
 * where Frida sits on the active unit; the sprites there are low ones she can sit in
 * front of, never a trunk that would grow out of her head.
 */
const SLOTS: Slot[] = [
  { kind: 'den', side: 'links', inset: -6, top: 0.02, width: 70 },
  { kind: 'boom', side: 'rechts', inset: -14, top: 0.0, width: 86 },
  { kind: 'struik', side: 'links', inset: 60, top: 0.16, width: 54 },
  { kind: 'gras', side: 'rechts', inset: 70, top: 0.14, width: 26 },
  { kind: 'den', side: 'rechts', inset: -4, top: 0.28, width: 66 },
  { kind: 'paddenstoel', side: 'links', inset: 178, top: 0.6, width: 22 },
  { kind: 'steen', side: 'links', inset: 60, top: 0.46, width: 26 },
  { kind: 'boom', side: 'links', inset: -12, top: 0.5, width: 84 },
  { kind: 'gras', side: 'rechts', inset: 88, top: 0.5, width: 26 },
  { kind: 'boom', side: 'rechts', inset: -10, top: 0.56, width: 80 },
  { kind: 'struik', side: 'rechts', inset: 60, top: 0.72, width: 50 },
  { kind: 'paddenstoel', side: 'rechts', inset: 130, top: 0.76, width: 20 },
  { kind: 'den', side: 'links', inset: 2, top: 0.03, anchor: 'onder', width: 64 },
  { kind: 'gras', side: 'links', inset: 150, top: 0.06, anchor: 'onder', width: 26 },
  { kind: 'struik', side: 'links', inset: 40, top: 0.02, anchor: 'onder', width: 58 },
  { kind: 'struik', side: 'rechts', inset: 30, top: 0.02, anchor: 'onder', width: 52 },
]

/** mulberry32 — a deterministic scatter per unit, so the forest never shuffles on re-render */
function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The trees, bushes and mushrooms either side of one unit's path.
 *
 * `seed` is the unit's index down the whole leerpad: the same unit always gets the same
 * forest, and no two units get quite the same one. Render it inside the positioned
 * `.path-section`, before the coins.
 */
export function BosScenery({ seed }: { seed: number }): ReactNode {
  const next = rng(seed + 1)
  return (
    <>
      {SLOTS.map((slot, i) => {
        // a little jitter, and the small things swap species now and then
        const top = Math.max(0, slot.top + (next() - 0.5) * 0.06)
        const inset = slot.inset + (next() - 0.5) * 16
        let kind = slot.kind
        if (kind === 'gras' && next() < 0.3) kind = 'steen'
        else if (kind === 'steen' && next() < 0.3) kind = 'paddenstoel'
        const Sprite = SPRITES[kind]
        const style: React.CSSProperties = {
          [slot.side === 'links' ? 'left' : 'right']: `${inset.toFixed(0)}px`,
          [slot.anchor === 'onder' ? 'bottom' : 'top']: `${(top * 100).toFixed(1)}%`,
          width: `${slot.width}px`,
          height: `${(slot.width * RATIO[kind]).toFixed(0)}px`,
        }
        return <Sprite key={i} style={style} />
      })}
    </>
  )
}

/** The log Frida sits on, beside the active unit's path. Positioned by `.bos-log`. */
export function BosLog(): ReactNode {
  return (
    <svg className="bos-sprite bos-log" viewBox="0 0 110 36" aria-hidden="true">
      <rect className="bos-hout" x="8" y="8" width="96" height="22" rx="11" />
      <ellipse className="bos-hout-licht" cx="104" cy="19" rx="7" ry="11" />
      <ellipse className="bos-hout-mid" cx="104" cy="19" rx="3.5" ry="6" />
      <path
        className="bos-hout-nerf"
        d="M24,14 L70,14 M30,24 L84,24"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  )
}

/**
 * The canopy hanging under the statbar — you look down into the forest from the app.
 * Two rows of scallops; `preserveAspectRatio="none"` stretches it to any width.
 */
export function BosCanopy(): ReactNode {
  return (
    <svg className="bos-canopy" viewBox="0 0 390 46" preserveAspectRatio="none" aria-hidden="true">
      <path
        className="bos-kruin-2"
        d="M0,0 L390,0 L390,18 Q370,46 340,22 Q315,50 285,20 Q258,48 230,20 Q205,50 175,22 Q150,48 120,20 Q95,48 65,22 Q40,48 12,20 L0,24 Z"
      />
      <path
        className="bos-kruin-1"
        d="M0,0 L390,0 L390,8 Q360,30 330,10 Q300,32 270,10 Q240,32 210,10 Q180,32 150,10 Q120,32 90,10 Q60,32 30,10 L0,14 Z"
      />
    </svg>
  )
}
