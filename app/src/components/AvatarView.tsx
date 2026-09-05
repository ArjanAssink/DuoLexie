import type { AvatarConfig } from '@shared/src/types'

interface Props {
  config: AvatarConfig
  /** 'full' = hip-up bust (customization screen). 'topbar' = shoulders + face only. */
  crop?: 'full' | 'topbar'
  className?: string
}

const VIEWBOX = {
  full: '0 0 200 260',
  topbar: '18 36 164 128',
}

/** Mixes a hex color toward black (amt > 0) or white (amt < 0) — flat shading, no gradients (gradient <defs> ids collide when several AvatarViews render at once). */
function shade(hex: string, amt: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  const target = amt > 0 ? 0 : 255
  const p = Math.min(1, Math.abs(amt))
  const mix = (channel: number) => Math.round(channel + (target - channel) * p)
  const r = mix((num >> 16) & 0xff)
  const g = mix((num >> 8) & 0xff)
  const b = mix(num & 0xff)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Earrings hang from the ear lobes — swapped by shop item id. */
function Earrings({ id }: { id: string }) {
  if (id === 'oorbellen-hart') {
    return (
      <g fill="#F4778F">
        <path d="M52,118 C45,112 45,105 51,106 C52,104 55,104 52,109 C55,104 58,104 59,106 C61,109 52,113 52,118 Z" />
        <path d="M148,118 C141,112 141,105 147,106 C148,104 151,104 148,109 C151,104 154,104 155,106 C157,109 148,113 148,118 Z" />
      </g>
    )
  }
  return (
    <g>
      <circle cx="52" cy="114" r="4.2" fill="#F7C531" />
      <circle cx="53" cy="112.5" r="1.1" fill="#FFF6D8" />
      <circle cx="148" cy="114" r="4.2" fill="#F7C531" />
      <circle cx="149" cy="112.5" r="1.1" fill="#FFF6D8" />
    </g>
  )
}

/** Glasses sit over the eyes — swapped by shop item id. */
function Glasses({ id }: { id: string }) {
  if (id === 'bril-ster') {
    const frame = '#E2542F'
    const lens = (cx: number) => (
      <path
        d={`M${cx - 16},${86} Q${cx},${74} ${cx + 16},${86} Q${cx + 18},${98} ${cx + 10},${104} Q${cx},${110} ${cx - 10},${104} Q${cx - 18},${98} ${cx - 16},${86} Z`}
        fill="#FFFFFF"
        fillOpacity="0.25"
        stroke={frame}
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
    )
    return (
      <g>
        {lens(78)}
        {lens(122)}
        <path d="M93,90 Q100,85 107,90" stroke={frame} strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M62,84 Q54,86 51,95" stroke={frame} strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <path d="M138,84 Q146,86 149,95" stroke={frame} strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <g fill="#F7C531">
          <path d="M58,70 L60,75 L65,76 L60,78 L58,83 L56,78 L51,76 L56,75 Z" />
          <path d="M142,70 L144,75 L149,76 L144,78 L142,83 L140,78 L135,76 L140,75 Z" />
        </g>
      </g>
    )
  }
  const frame = '#3B3026'
  return (
    <g>
      <circle cx="78" cy="93" r="15.5" fill="#FFFFFF" fillOpacity="0.2" stroke={frame} strokeWidth="4.5" />
      <circle cx="122" cy="93" r="15.5" fill="#FFFFFF" fillOpacity="0.2" stroke={frame} strokeWidth="4.5" />
      <circle cx="83" cy="87" r="2.5" fill="#FFFFFF" fillOpacity="0.7" />
      <circle cx="127" cy="87" r="2.5" fill="#FFFFFF" fillOpacity="0.7" />
      <path d="M93,91 Q100,86 107,91" stroke={frame} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M63,88 Q54,90 51,97" stroke={frame} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M137,88 Q146,90 149,97" stroke={frame} strokeWidth="4.5" fill="none" strokeLinecap="round" />
    </g>
  )
}

/** A hat sits on top of the hair, drawn last — swapped by shop item id. */
function Hat({ id }: { id: string }) {
  if (id === 'hoed-strik') {
    return (
      <g fill="#F4778F">
        <path d="M112,42 C112,30 96,26 90,34 C85,41 92,50 112,42 Z" />
        <path d="M116,42 C116,30 132,26 138,34 C143,41 136,50 116,42 Z" />
        <path d="M108,45 L104,58 L113,49 Z" />
        <path d="M120,45 L124,58 L115,49 Z" />
        <circle cx="114" cy="42" r="6" fill="#D9556E" />
      </g>
    )
  }
  if (id === 'hoed-kroon') {
    return (
      <g>
        <path
          d="M48,62 L48,50 L64,34 L78,52 L100,26 L122,52 L136,34 L152,50 L152,62 Z"
          fill="#F7C531"
          stroke="#D9A616"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <rect x="48" y="58" width="104" height="10" rx="3" fill="#F2B822" stroke="#D9A616" strokeWidth="2" />
        <circle cx="64" cy="40" r="4.5" fill="#E2542F" />
        <circle cx="100" cy="34" r="5.5" fill="#2FA79B" />
        <circle cx="136" cy="40" r="4.5" fill="#E2542F" />
      </g>
    )
  }
  // hoed-pet
  return (
    <g>
      <path
        d="M44,68 C42,36 68,16 100,16 C132,16 158,36 156,68 C156,60 148,52 132,50 C126,58 114,62 100,62 C86,62 74,58 68,50 C52,52 44,60 44,68 Z"
        fill="#2FA79B"
      />
      <ellipse cx="100" cy="63" rx="36" ry="8" fill="#22857B" />
      <circle cx="100" cy="20" r="4" fill="#22857B" />
    </g>
  )
}

/**
 * Player avatar rig — one drawing, two crops (full bust vs. shoulders+face for
 * the top bar). Traits (skin/eye/hair color) are fills read from config;
 * hairstyle and accessories swap which group renders, keyed by id.
 */
export function AvatarView({ config, crop = 'full', className }: Props) {
  const { skinColor, eyeColor, hairColor, hairstyle } = config
  const equipped = config.equipped ?? {}
  const hairShadow = shade(hairColor, 0.3)
  const skinShadow = shade(skinColor, 0.12)
  const skinHighlight = shade(skinColor, -0.16)
  const earInner = shade(skinColor, 0.14)

  return (
    <svg viewBox={VIEWBOX[crop]} className={className} role="img" aria-label="Avatar">
      {/* torso */}
      <path d="M38,262 C38,188 58,148 100,148 C142,148 162,188 162,262 Z" fill="var(--teal)" />
      <path d="M38,262 C38,188 58,148 100,148 L100,262 Z" fill="var(--teal-shadow)" opacity="0.35" />
      <path d="M78,150 Q100,166 122,150" stroke="var(--teal-shadow)" strokeWidth="3" fill="none" opacity="0.5" />

      {/* hair — back layer, behind the head */}
      {hairstyle === 'staart' && (
        <g>
          <path
            d="M144,88 C160,84 172,98 169,118 C167,136 156,150 147,147 C140,145 138,128 141,111 C142,99 141,93 144,88 Z"
            fill={hairColor}
          />
          <path d="M148,112 Q158,118 152,138" stroke={hairShadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" />
        </g>
      )}
      {hairstyle === 'lang' && (
        <g>
          <path
            d="M53,84 C38,114 36,152 46,184 C50,197 58,204 67,199 C60,180 57,150 61,120 C63,103 66,90 71,79 Z"
            fill={hairColor}
          />
          <path
            d="M147,84 C162,114 164,152 154,184 C150,197 142,204 133,199 C140,180 143,150 139,120 C137,103 134,90 129,79 Z"
            fill={hairColor}
          />
          <path d="M56,110 Q50,150 60,188" stroke={hairShadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
          <path d="M144,110 Q150,150 140,188" stroke={hairShadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
        </g>
      )}

      {/* neck */}
      <rect x="85" y="136" width="30" height="26" rx="8" fill={skinColor} />
      <ellipse cx="100" cy="159" rx="15" ry="7" fill={skinShadow} opacity="0.35" />

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

      {equipped.oorbellen && <Earrings id={equipped.oorbellen} />}
      {equipped.bril && <Glasses id={equipped.bril} />}

      {/* mouth */}
      <path d="M81,115 Q100,133 119,115 Q100,125 81,115 Z" fill="#B85C56" />
      <path d="M89,118 Q100,123 111,118" stroke="#FFF6E6" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />

      {/* hair — front layer, over the forehead */}
      {(hairstyle === 'kort' || hairstyle === 'staart' || hairstyle === 'lang') && (
        <g>
          <path
            d="M50,80 C46,44 72,26 100,26 C128,26 154,44 150,80
               C144,64 136,54 126,53
               C122,62 116,66 110,60
               C106,66 100,68 94,62
               C88,68 82,66 78,58
               C68,60 56,66 50,80 Z"
            fill={hairColor}
          />
          <path d="M64,40 Q68,52 63,62" stroke={hairShadow} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
          <path d="M136,40 Q132,52 137,62" stroke={hairShadow} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
        </g>
      )}
      {hairstyle === 'staart' && <rect x="141" y="99" width="11" height="9" rx="4" fill={hairShadow} />}
      {hairstyle === 'krullen' && (
        <g fill={hairColor}>
          <path
            d="M45,70 C40,50 50,34 64,30 C62,18 78,10 90,18 C96,8 112,8 116,18 C130,10 144,20 140,30 C154,36 160,52 154,70
               C148,60 140,58 134,62 C130,52 118,48 110,54 C104,46 98,46 92,54 C82,48 70,52 64,62 C56,58 50,62 45,70 Z"
          />
          <circle cx="56" cy="52" r="7" fill={hairShadow} opacity="0.5" />
          <circle cx="100" cy="24" r="7" fill={hairShadow} opacity="0.5" />
          <circle cx="144" cy="52" r="7" fill={hairShadow} opacity="0.5" />
        </g>
      )}

      {equipped.hoed && <Hat id={equipped.hoed} />}
    </svg>
  )
}
