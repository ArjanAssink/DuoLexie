/**
 * The schatkist on the reward screen — the one drawing in the app that has moving parts.
 *
 * `Icons.tsx` holds flat 24px glyphs whose only variables are `size` and `fill`; this is a
 * different thing and lives apart from them on purpose. The lid is its own `<g>` so CSS can
 * hinge it open (`.chest-lid`, theme.css), and the light spilling out of the opening is a
 * real element drawn between the body and the lid rather than a filter, so it can fade in on
 * the same beat and be occluded by the lid while the lid is still down.
 *
 * No new art in the asset sense: it is built from the same flat wood-and-gold the nav's
 * `ChestIcon` uses, so the chest she opens and the chest in the bottom bar are recognisably
 * the same object. It is drawn *to the edges* of its viewBox — at 76px on a row shared with
 * two lines of 22px text, every pixel of margin inside the box is a pixel the chest is not.
 */
export function TreasureChest({ size = 104 }: { size?: number }) {
  return (
    <svg
      className="chest"
      viewBox="0 0 120 96"
      width={size}
      height={size * (96 / 120)}
      aria-hidden="true"
    >
      {/* Body first, so an over-rotated lid can never be clipped by it. */}
      <g className="chest-body">
        <rect x="8" y="40" width="104" height="52" rx="8" fill="#C8B894" />
        <rect x="8" y="54" width="104" height="14" fill="#B7A886" />
        <rect x="8" y="82" width="104" height="10" rx="5" fill="#A89773" />
        {/* the two straps that stop it reading as a crate */}
        <rect x="23" y="40" width="8" height="52" fill="#F7C531" />
        <rect x="89" y="40" width="8" height="52" fill="#F7C531" />
        <rect x="52" y="50" width="16" height="22" rx="4" fill="#F7C531" />
        <rect x="57" y="57" width="6" height="9" rx="3" fill="#B8860B" />
      </g>

      {/*
        The light out of the opening. Between the body and the lid so a closed chest hides it
        without CSS having to say so, and wide and shallow so it reads as spill rather than as
        a glow pasted over the drawing.
      */}
      <ellipse className="chest-glow" cx="60" cy="41" rx="46" ry="15" fill="#FFF1B8" />

      {/* The lid. `transform-origin` is in CSS (theme.css) rather than here, because the
          hinge has to be expressed in the same units as the rotation that uses it. */}
      <g className="chest-lid">
        <path d="M8,42 L8,26 A52,21 0 0 1 112,26 L112,42 Z" fill="#D3C5A6" />
        <path d="M8,42 L8,35 A52,21 0 0 1 112,35 L112,42 Z" fill="#B7A886" />
        <path d="M23,42 L23,17.5 A52,21 0 0 0 31,16.3 L31,42 Z" fill="#F7C531" />
        <path d="M89,42 L89,16.3 A52,21 0 0 0 97,17.5 L97,42 Z" fill="#F7C531" />
        <rect x="52" y="34" width="16" height="8" rx="2" fill="#F7C531" />
      </g>
    </svg>
  )
}
