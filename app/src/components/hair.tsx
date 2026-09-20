import type { ReactNode } from 'react'
import type { HairStyle } from '@shared/src/types'

/**
 * The kapsel catalogue — art, label and group for every hairstyle, in one place so adding
 * one is a single entry rather than three edits spread over AvatarView and the picker.
 *
 * Geometry is the avatar rig's (see AvatarView): the head is an ellipse at cx=100 cy=92
 * rx=48 ry=50, so its crown is y=42 and the chin y=142; the ears sit at x=51/149, y=84..110;
 * the shoulders start around y=150. Hair above y≈36 is cropped away in the `topbar` view —
 * that is fine for the little head in the statbar, and the picker uses the `kapsel` crop so
 * a tall style (afro, knot, stekels) is still shown whole where it is being chosen.
 *
 * Each style draws in up to two layers: `back` goes in behind the head (volume beside the
 * face, plaits, a ponytail, anything falling over the shoulders) and `front` on top of the
 * face (the cap and fringe, which is what hides the eyebrows underneath). Both get the
 * chosen hair colour plus a pre-shaded version of it for flat shading — no gradients, since
 * several avatars render at once and gradient <defs> ids would collide.
 */

export type HairGroup = 'jongens' | 'meisjes'

export interface HairPaint {
  /** the chosen haarkleur */
  hair: string
  /** the same colour mixed toward black, for flat shading */
  shadow: string
}

type Layer = (paint: HairPaint) => ReactNode

interface HairEntry {
  id: HairStyle
  label: string
  group: HairGroup
  back?: Layer
  front?: Layer
}

/* ---------- shared pieces ---------- */

/** The original short cap: a rounded top with a scalloped fringe. Several styles wear it. */
const capKort: Layer = ({ hair, shadow }) => (
  <g>
    <path
      d="M50,80 C46,44 72,26 100,26 C128,26 154,44 150,80
         C144,64 136,54 126,53
         C122,62 116,66 110,60
         C106,66 100,68 94,62
         C88,68 82,66 78,58
         C68,60 56,66 50,80 Z"
      fill={hair}
    />
    <path d="M64,40 Q68,52 63,62" stroke={shadow} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
    <path d="M136,40 Q132,52 137,62" stroke={shadow} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
  </g>
)

/** Hair pulled back flat over the crown — the base for a knot or a high ponytail. */
const capStrak: Layer = ({ hair, shadow }) => (
  <g>
    <path
      d="M52,80 C50,46 74,28 100,28 C126,28 150,46 148,80
         C143,62 126,54 100,54 C74,54 57,62 52,80 Z"
      fill={hair}
    />
    <path d="M66,68 Q82,50 100,48" stroke={shadow} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.45" />
    <path d="M134,68 Q118,50 100,48" stroke={shadow} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.45" />
  </g>
)

/** The long curtain either side of the face, as worn by lang / pony / vlechten. */
const backLang: Layer = ({ hair, shadow }) => (
  <g>
    <path
      d="M53,84 C38,114 36,152 46,184 C50,197 58,204 67,199 C60,180 57,150 61,120 C63,103 66,90 71,79 Z"
      fill={hair}
    />
    <path
      d="M147,84 C162,114 164,152 154,184 C150,197 142,204 133,199 C140,180 143,150 139,120 C137,103 134,90 129,79 Z"
      fill={hair}
    />
    <path d="M56,110 Q50,150 60,188" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
    <path d="M144,110 Q150,150 140,188" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.5" />
  </g>
)

/** One plait: a run of shrinking beads down from (x, y), with a band at the tip. */
function plait(x: number, y: number, tilt: number, paint: HairPaint) {
  const beads = [0, 1, 2, 3, 4, 5]
  return (
    <g>
      {beads.map((i) => (
        <ellipse
          key={i}
          cx={x + tilt * i}
          cy={y + i * 14}
          rx={11 - i * 1.1}
          ry={9 - i * 0.5}
          fill={paint.hair}
        />
      ))}
      {beads.slice(1).map((i) => (
        <path
          key={i}
          d={`M${x + tilt * i - 8},${y + i * 14 - 6} Q${x + tilt * i},${y + i * 14} ${x + tilt * i + 8},${y + i * 14 - 6}`}
          stroke={paint.shadow}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          opacity="0.45"
        />
      ))}
      <rect
        x={x + tilt * 5 - 6}
        y={y + 5 * 14 + 4}
        width="12"
        height="7"
        rx="3"
        fill={paint.shadow}
      />
    </g>
  )
}

/** One dread: a tapered strand from (x, top) down to `bottom`, drifting sideways as it falls. */
function lock(x: number, top: number, bottom: number, drift: number, paint: HairPaint) {
  const mid = (top + bottom) / 2
  const ticks = Math.floor((bottom - top - 24) / 18)
  return (
    <g key={`${x}-${bottom}`}>
      <path
        d={`M${x - 6.5},${top}
            C${x - 7 + drift * 0.3},${mid} ${x - 5.5 + drift},${bottom - 14} ${x - 4 + drift},${bottom - 4}
            Q${x + drift},${bottom + 3} ${x + 4 + drift},${bottom - 4}
            C${x + 5.5 + drift},${bottom - 14} ${x + 7 + drift * 0.3},${mid} ${x + 6.5},${top} Z`}
        fill={paint.hair}
      />
      {Array.from({ length: Math.max(ticks, 0) }, (_, i) => {
        const t = (i + 1) / (ticks + 1)
        return (
          <path
            key={i}
            d={`M${x - 5 + drift * t},${top + (bottom - top) * t} L${x + 5 + drift * t},${top + (bottom - top) * t}`}
            stroke={paint.shadow}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.4"
          />
        )
      })}
    </g>
  )
}

/* ---------- jongens ---------- */

const jongens = [
  { id: 'kort', label: 'Kort', group: 'jongens', front: capKort },

  {
    id: 'millimeter',
    label: 'Millimeter',
    group: 'jongens',
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M52,86 C50,50 72,34 100,34 C128,34 150,50 148,86
             C144,72 138,66 130,64 Q100,72 70,64 C62,66 56,72 52,86 Z"
          fill={hair}
        />
        {/* sideburns, in front of the ears */}
        <path d="M55,78 L62,77 L61,100 L54,96 Z" fill={hair} />
        <path d="M145,78 L138,77 L139,100 L146,96 Z" fill={hair} />
        <g fill={shadow} opacity="0.35">
          <circle cx="78" cy="48" r="2" />
          <circle cx="100" cy="42" r="2" />
          <circle cx="122" cy="48" r="2" />
          <circle cx="90" cy="56" r="2" />
          <circle cx="112" cy="56" r="2" />
        </g>
      </g>
    ),
  },

  {
    id: 'stekels',
    label: 'Stekels',
    group: 'jongens',
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,82 C48,58 58,42 70,34 L70,18 L82,30 L86,12 L98,28 L104,10 L114,28 L122,14 L128,34 L142,26 L142,42
             C150,50 152,64 150,82
             C144,66 136,56 126,55
             C122,64 116,68 110,62
             C106,68 100,70 94,64
             C88,70 82,68 78,60
             C68,62 56,68 50,82 Z"
          fill={hair}
        />
        <path d="M86,22 L88,40" stroke={shadow} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M104,20 L104,38" stroke={shadow} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      </g>
    ),
  },

  {
    id: 'kuif',
    label: 'Kuif',
    group: 'jongens',
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M52,84 C50,58 62,40 82,32 C94,28 106,20 110,10
             C120,18 118,30 108,38
             C126,34 142,44 148,64 C150,72 150,78 148,84
             C144,68 136,58 126,56 Q100,64 74,56 C62,60 55,70 52,84 Z"
          fill={hair}
        />
        <path d="M92,30 Q104,24 108,14" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.5" />
        <path d="M84,40 Q98,32 104,22" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.4" />
      </g>
    ),
  },

  {
    id: 'zijscheiding',
    label: 'Zijscheiding',
    group: 'jongens',
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,80 C46,46 72,26 100,26 C128,26 154,46 150,80
             C146,60 138,50 128,50
             C116,58 98,62 86,57
             C80,53 78,45 83,36
             C70,41 56,56 50,80 Z"
          fill={hair}
        />
        <path d="M85,32 Q80,46 85,58" stroke={shadow} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.55" />
        <path d="M96,38 Q116,42 130,54" stroke={shadow} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.4" />
      </g>
    ),
  },

  {
    id: 'bol',
    label: 'Bolkapsel',
    group: 'jongens',
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,90 C48,52 70,28 100,28 C130,28 152,52 150,90
             C150,82 149,78 148,74
             Q100,84 52,74
             C51,78 50,82 50,90 Z"
          fill={hair}
        />
        <path d="M60,78 Q100,88 140,78" stroke={shadow} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.35" />
      </g>
    ),
  },

  {
    id: 'krullen-kort',
    label: 'Korte krullen',
    group: 'jongens',
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M52,82 C48,48 72,30 100,30 C128,30 152,48 148,82
             C142,66 134,58 124,57 Q100,66 76,57 C66,58 58,66 52,82 Z"
          fill={hair}
        />
        <g fill={hair}>
          <circle cx="60" cy="52" r="13" />
          <circle cx="76" cy="38" r="14" />
          <circle cx="100" cy="33" r="15" />
          <circle cx="124" cy="38" r="14" />
          <circle cx="140" cy="52" r="13" />
          <circle cx="53" cy="68" r="11" />
          <circle cx="147" cy="68" r="11" />
        </g>
        <g fill={shadow} opacity="0.35">
          <circle cx="70" cy="44" r="4.5" />
          <circle cx="100" cy="38" r="4.5" />
          <circle cx="130" cy="44" r="4.5" />
          <circle cx="56" cy="62" r="4" />
          <circle cx="144" cy="62" r="4" />
        </g>
      </g>
    ),
  },

  {
    id: 'afro',
    label: 'Afro',
    group: 'jongens',
    back: ({ hair, shadow }) => (
      <g>
        <ellipse cx="100" cy="64" rx="66" ry="60" fill={hair} />
        {/* bumps break the ellipse, so the silhouette reads as hair and not as a helmet */}
        <g fill={hair}>
          {[
            [46, 34],
            [68, 14],
            [100, 6],
            [132, 14],
            [154, 34],
            [166, 62],
            [34, 62],
            [40, 94],
            [160, 94],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="16" />
          ))}
        </g>
        <g fill={shadow} opacity="0.28">
          <circle cx="54" cy="40" r="8" />
          <circle cx="80" cy="18" r="8" />
          <circle cx="120" cy="18" r="8" />
          <circle cx="146" cy="40" r="8" />
          <circle cx="38" cy="76" r="7" />
          <circle cx="162" cy="76" r="7" />
        </g>
      </g>
    ),
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M48,82 C44,44 70,24 100,24 C130,24 156,44 152,82
             C144,62 134,54 124,53 Q100,62 76,53 C66,54 56,62 48,82 Z"
          fill={hair}
        />
        <g fill={shadow} opacity="0.28">
          <circle cx="72" cy="42" r="6" />
          <circle cx="100" cy="34" r="6" />
          <circle cx="128" cy="42" r="6" />
        </g>
      </g>
    ),
  },

  {
    id: 'dreads',
    label: 'Dreads',
    group: 'jongens',
    back: (paint) => (
      <g>
        {lock(48, 58, 174, -8, paint)}
        {lock(62, 62, 188, -4, paint)}
        {lock(76, 66, 166, -2, paint)}
        {lock(124, 66, 166, 2, paint)}
        {lock(138, 62, 188, 4, paint)}
        {lock(152, 58, 174, 8, paint)}
      </g>
    ),
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,78 C46,44 72,26 100,26 C128,26 154,44 150,78
             C146,60 136,52 126,51 Q100,60 74,51 C64,52 54,60 50,78 Z"
          fill={hair}
        />
        <g stroke={shadow} strokeWidth="1.8" strokeLinecap="round" opacity="0.4" fill="none">
          <path d="M66,38 Q70,48 67,58" />
          <path d="M84,31 Q86,44 84,54" />
          <path d="M100,29 L100,50" />
          <path d="M116,31 Q114,44 116,54" />
          <path d="M134,38 Q130,48 133,58" />
        </g>
      </g>
    ),
  },

  {
    id: 'matje',
    label: 'Matje',
    group: 'jongens',
    back: ({ hair, shadow }) => (
      <g>
        {/* Business in front, party at the back — and from the front all you see of the
            party is what falls past the jaw on either side of the neck. */}
        <path
          d="M54,92 C44,124 48,158 62,170 C72,178 84,172 79,161 C68,140 62,116 66,94 Z"
          fill={hair}
        />
        <path
          d="M146,92 C156,124 152,158 138,170 C128,178 116,172 121,161 C132,140 138,116 134,94 Z"
          fill={hair}
        />
        <path d="M58,112 Q54,146 66,166" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.45" />
        <path d="M142,112 Q146,146 134,166" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.45" />
      </g>
    ),
    front: capKort,
  },

  {
    id: 'kaal',
    label: 'Kaal',
    group: 'jongens',
    front: () => <ellipse cx="86" cy="56" rx="15" ry="7" fill="#FFFFFF" opacity="0.18" />,
  },
] satisfies HairEntry[]

/* ---------- meisjes ---------- */

const meisjes = [
  {
    id: 'krullen',
    label: 'Krullen',
    group: 'meisjes',
    front: ({ hair, shadow }) => (
      <g fill={hair}>
        <path
          d="M45,70 C40,50 50,34 64,30 C62,18 78,10 90,18 C96,8 112,8 116,18 C130,10 144,20 140,30 C154,36 160,52 154,70
             C148,60 140,58 134,62 C130,52 118,48 110,54 C104,46 98,46 92,54 C82,48 70,52 64,62 C56,58 50,62 45,70 Z"
        />
        <circle cx="56" cy="52" r="7" fill={shadow} opacity="0.5" />
        <circle cx="100" cy="24" r="7" fill={shadow} opacity="0.5" />
        <circle cx="144" cy="52" r="7" fill={shadow} opacity="0.5" />
      </g>
    ),
  },

  {
    id: 'staart',
    label: 'Staart',
    group: 'meisjes',
    back: ({ hair, shadow }) => (
      <g>
        <path
          d="M140,80 C164,68 181,92 176,122 C171,152 155,170 143,163 C130,157 131,135 136,111 C139,96 137,88 140,80 Z"
          fill={hair}
        />
        <path d="M150,108 Q165,122 157,150" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.55" />
      </g>
    ),
    front: (paint) => (
      <g>
        {capKort(paint)}
        <rect x="141" y="99" width="11" height="9" rx="4" fill={paint.shadow} />
      </g>
    ),
  },

  { id: 'lang', label: 'Lang', group: 'meisjes', back: backLang, front: capKort },

  {
    id: 'bob',
    label: 'Bob',
    group: 'meisjes',
    back: ({ hair, shadow }) => (
      <g>
        <path d="M54,72 C40,98 42,132 48,146 Q100,156 152,146 C158,132 160,98 146,72 Z" fill={hair} />
        <path d="M52,96 Q48,124 54,144" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
        <path d="M148,96 Q152,124 146,144" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
      </g>
    ),
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,78 C46,44 72,26 100,26 C128,26 154,44 150,78
             C146,58 136,50 124,50 Q104,66 80,58 C70,54 58,62 50,78 Z"
          fill={hair}
        />
        <path d="M92,34 Q108,42 122,52" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.4" />
      </g>
    ),
  },

  {
    id: 'pixie',
    label: 'Pixie',
    group: 'meisjes',
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,84 C46,48 72,28 100,28 C130,28 154,46 150,80
             C148,68 140,58 130,54
             C120,66 98,68 76,57
             C64,59 54,68 50,84 Z"
          fill={hair}
        />
        {/* the little flicks in front of the ears */}
        <path d="M51,76 C45,84 44,96 49,104 C52,96 53,86 56,78 Z" fill={hair} />
        <path d="M149,76 C155,84 156,96 151,104 C148,96 147,86 144,78 Z" fill={hair} />
        <path d="M88,36 Q108,44 126,56" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.4" />
      </g>
    ),
  },

  {
    id: 'pony',
    label: 'Pony',
    group: 'meisjes',
    back: backLang,
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,80 C46,44 72,26 100,26 C128,26 154,44 150,80
             C150,72 149,67 147,63
             Q100,76 53,63
             C51,67 50,72 50,80 Z"
          fill={hair}
        />
        <path d="M70,40 L70,62" stroke={shadow} strokeWidth="2" strokeLinecap="round" opacity="0.35" />
        <path d="M130,40 L130,62" stroke={shadow} strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      </g>
    ),
  },

  {
    id: 'vlechten',
    label: 'Vlechten',
    group: 'meisjes',
    back: (paint) => (
      <g>
        <path
          d="M56,80 C44,104 44,130 50,146 Q100,154 150,146 C156,130 156,104 144,80 Z"
          fill={paint.hair}
        />
        {plait(46, 112, -1.6, paint)}
        {plait(154, 112, 1.6, paint)}
      </g>
    ),
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,80 C46,44 72,26 100,26 C128,26 154,44 150,80
             C146,62 134,52 120,50
             Q100,62 80,50 C66,52 54,62 50,80 Z"
          fill={hair}
        />
        <path d="M100,28 L100,56" stroke={shadow} strokeWidth="2.4" strokeLinecap="round" opacity="0.5" />
      </g>
    ),
  },

  {
    id: 'knot',
    label: 'Knot',
    group: 'meisjes',
    back: ({ hair, shadow }) => (
      <g>
        <circle cx="100" cy="22" r="21" fill={hair} />
        <path d="M88,14 Q100,6 112,14" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.4" />
        <ellipse cx="100" cy="42" rx="15" ry="6" fill={shadow} opacity="0.7" />
      </g>
    ),
    front: capStrak,
  },

  {
    id: 'staartjes',
    label: 'Staartjes',
    group: 'meisjes',
    back: ({ hair, shadow }) => (
      <g>
        <ellipse cx="40" cy="86" rx="18" ry="21" fill={hair} />
        <path d="M32,98 C22,118 24,144 36,154 C46,160 55,152 50,142 C42,128 40,112 45,100 Z" fill={hair} />
        <ellipse cx="160" cy="86" rx="18" ry="21" fill={hair} />
        <path d="M168,98 C178,118 176,144 164,154 C154,160 145,152 150,142 C158,128 160,112 155,100 Z" fill={hair} />
        <path d="M34,108 Q32,132 40,148" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.45" />
        <path d="M166,108 Q168,132 160,148" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.45" />
      </g>
    ),
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,80 C46,44 72,26 100,26 C128,26 154,44 150,80
             C146,62 134,52 120,50
             Q100,62 80,50 C66,52 54,62 50,80 Z"
          fill={hair}
        />
        <path d="M100,28 L100,54" stroke={shadow} strokeWidth="2.4" strokeLinecap="round" opacity="0.5" />
        <rect x="46" y="70" width="12" height="9" rx="4" fill={shadow} />
        <rect x="142" y="70" width="12" height="9" rx="4" fill={shadow} />
      </g>
    ),
  },

  {
    id: 'golven',
    label: 'Golven',
    group: 'meisjes',
    back: ({ hair, shadow }) => (
      <g>
        <path
          d="M54,82 C36,110 30,148 40,182
             C30,190 34,202 46,200 C58,198 66,190 64,180
             C54,156 52,124 62,96 C66,88 68,84 71,79 Z"
          fill={hair}
        />
        <path
          d="M146,82 C164,110 170,148 160,182
             C170,190 166,202 154,200 C142,198 134,190 136,180
             C146,156 148,124 138,96 C134,88 132,84 129,79 Z"
          fill={hair}
        />
        <path d="M58,108 Q46,140 54,176" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
        <path d="M142,108 Q154,140 146,176" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
      </g>
    ),
    front: ({ hair, shadow }) => (
      <g>
        <path
          d="M50,80 C46,42 72,24 100,24 C130,24 156,44 150,80
             C148,62 138,50 126,49
             C114,60 96,64 82,56
             C72,52 58,62 50,80 Z"
          fill={hair}
        />
        <path d="M76,36 Q96,40 112,52" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.4" />
        <path d="M66,48 Q84,52 96,62" stroke={shadow} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.3" />
      </g>
    ),
  },

  {
    id: 'hoge-staart',
    label: 'Hoge staart',
    group: 'meisjes',
    back: ({ hair, shadow }) => (
      <g>
        <path
          d="M104,28 C128,4 164,12 173,44 C182,76 167,116 147,127
             C134,134 122,122 130,109 C146,84 156,56 143,42 C132,29 114,28 104,38 Z"
          fill={hair}
        />
        <path d="M132,40 Q160,64 148,108" stroke={shadow} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.45" />
      </g>
    ),
    front: (paint) => (
      <g>
        {capStrak(paint)}
        <rect x="94" y="26" width="16" height="10" rx="5" fill={paint.shadow} />
      </g>
    ),
  },
] satisfies HairEntry[]

/**
 * Compile-time guard: every id in the HairStyle union has to be in one of the two lists
 * above. Without it a new id would type-check everywhere and then quietly render a bald
 * head, because the lookup below would come up empty.
 */
type Catalogued = (typeof jongens)[number]['id'] | (typeof meisjes)[number]['id']
const _everyKapselIsDrawn: Exclude<HairStyle, Catalogued> extends never ? true : never = true
void _everyKapselIsDrawn

/** Every kapsel, grouped exactly as the picker shows them. */
export const HAIR_GROUPS: { group: HairGroup; label: string; styles: HairEntry[] }[] = [
  { group: 'jongens', label: 'Jongens', styles: jongens },
  { group: 'meisjes', label: 'Meisjes', styles: meisjes },
]

const BY_ID = new Map<HairStyle, HairEntry>(
  [...jongens, ...meisjes].map((entry) => [entry.id, entry]),
)

/** Every kapsel id, jongens first — the order the picker lays them out in. */
export const HAIRSTYLES: HairStyle[] = [...BY_ID.keys()]

/**
 * The two layers, as plain calls rather than components: they draw straight into the rig's
 * own <svg>, and a component boundary here would only make the layering harder to read.
 */
export function hairBack(style: HairStyle, paint: HairPaint): ReactNode {
  return BY_ID.get(style)?.back?.(paint) ?? null
}

/** The layer over the face: cap, fringe, ties. */
export function hairFront(style: HairStyle, paint: HairPaint): ReactNode {
  return BY_ID.get(style)?.front?.(paint) ?? null
}
