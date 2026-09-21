import type { AvatarConfig } from '@shared/src/types'
import { hairBack, hairFront } from './hair'
import { earrings, glasses, hat, scarfLayer, torso } from './accessories'
import { shade } from './shade'

interface Props {
  config: AvatarConfig
  /**
   * 'full' = hip-up bust (customization screen). 'topbar' = shoulders + face only.
   * 'kapsel' = head plus all the room the tallest kapsel or hoed needs (afro, knot, the
   * wizard hat's point), for the kapsel picker and the shop's head tiles — the topbar crop
   * starts below those and would behead them.
   * 'romp' = chin to hem, for the shop's sjaal and jas tiles, which a head crop would miss.
   */
  crop?: 'full' | 'topbar' | 'kapsel' | 'romp'
  className?: string
}

const VIEWBOX = {
  full: '0 0 200 260',
  topbar: '18 36 164 128',
  kapsel: '18 0 164 164',
  romp: '22 108 156 156',
}

/**
 * Player avatar rig — one drawing, four crops (full bust, shoulders+face for the top bar,
 * and two shop/picker framings). Traits (skin/eye/hair color) are fills read from config;
 * hairstyle and accessories swap which group renders, keyed by id. The art itself lives in
 * two catalogues: `hair.tsx` (one entry per kapsel, drawn in two layers around the face) and
 * `accessories.tsx` (one entry per shop item, including the jas, which *is* the torso).
 */
export function AvatarView({ config, crop = 'full', className }: Props) {
  const { skinColor, eyeColor, hairColor, hairstyle } = config
  const equipped = config.equipped ?? {}
  const hairShadow = shade(hairColor, 0.3)
  const skinShadow = shade(skinColor, 0.12)
  const skinHighlight = shade(skinColor, -0.16)
  const earInner = shade(skinColor, 0.14)
  const hairPaint = { hair: hairColor, shadow: hairShadow }

  return (
    <svg viewBox={VIEWBOX[crop]} className={className} role="img" aria-label="Avatar">
      {/* torso — the default shirt, or the jas she is wearing */}
      {torso(equipped.jas)}

      {/* hair — back layer, behind the head */}
      {hairBack(hairstyle, hairPaint)}

      {/* neck */}
      <rect x="85" y="136" width="30" height="26" rx="8" fill={skinColor} />
      <ellipse cx="100" cy="159" rx="15" ry="7" fill={skinShadow} opacity="0.35" />

      {/* sjaal — before the head, so the jaw covers its top edge the way a scarf tucks in */}
      {scarfLayer(equipped.sjaal)}

      {/* ears */}
      <ellipse cx="51" cy="97" rx="9" ry="13" fill={skinColor} />
      <ellipse cx="52.5" cy="98" rx="4" ry="7" fill={earInner} />
      <ellipse cx="149" cy="97" rx="9" ry="13" fill={skinColor} />
      <ellipse cx="147.5" cy="98" rx="4" ry="7" fill={earInner} />

      {/* head */}
      <ellipse cx="100" cy="92" rx="48" ry="50" fill={skinColor} />
      <ellipse cx="100" cy="56" rx="28" ry="13" fill={skinHighlight} opacity="0.3" />
      <ellipse cx="100" cy="133" rx="32" ry="10" fill={skinShadow} opacity="0.15" />

      {/* cheeks */}
      <ellipse cx="67" cy="114" rx="12" ry="8" fill="#F4778F" opacity="0.4" />
      <ellipse cx="133" cy="114" rx="12" ry="8" fill="#F4778F" opacity="0.4" />

      {/* eyebrows */}
      <path d="M64,70 Q78,60 92,68" stroke={hairColor} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M108,68 Q122,60 136,70" stroke={hairColor} strokeWidth="4.5" fill="none" strokeLinecap="round" />

      {/* eyes */}
      <g>
        <ellipse cx="78" cy="93" rx="13" ry="14" fill="#FFFFFF" />
        <circle cx="78" cy="94" r="8" fill={eyeColor} />
        <circle cx="78" cy="94" r="3.4" fill="#241C16" />
        <circle cx="81.5" cy="89.5" r="2.6" fill="#FFFFFF" />
        <circle cx="75.5" cy="97" r="1.2" fill="#FFFFFF" opacity="0.8" />
      </g>
      <g>
        <ellipse cx="122" cy="93" rx="13" ry="14" fill="#FFFFFF" />
        <circle cx="122" cy="94" r="8" fill={eyeColor} />
        <circle cx="122" cy="94" r="3.4" fill="#241C16" />
        <circle cx="125.5" cy="89.5" r="2.6" fill="#FFFFFF" />
        <circle cx="119.5" cy="97" r="1.2" fill="#FFFFFF" opacity="0.8" />
      </g>

      {/* nose */}
      <ellipse cx="100" cy="107" rx="4.5" ry="2.6" fill={skinShadow} opacity="0.55" />

      {earrings(equipped.oorbellen)}
      {glasses(equipped.bril)}

      {/* mouth */}
      <path d="M81,115 Q100,133 119,115 Q100,125 81,115 Z" fill="#B85C56" />
      <path d="M89,118 Q100,123 111,118" stroke="#FFF6E6" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />

      {/* hair — front layer, over the forehead */}
      {hairFront(hairstyle, hairPaint)}

      {hat(equipped.hoed)}
    </svg>
  )
}
