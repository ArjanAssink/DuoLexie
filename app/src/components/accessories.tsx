import type { ReactNode } from 'react'
import { shade } from './shade'

/**
 * The shop's art — one entry per id in `shared/curriculum/shopItems.json`, in the same two
 * layers the rig draws them in.
 *
 * Geometry is the avatar rig's (see AvatarView): the ear lobes are at x=52/148 around y=115,
 * the eyes at cx=78/122 cy=93, the crown of the head at y=42, the neck is the box
 * x=85..115 y=136..162, and the torso opens out from y=148 to the bottom of the frame.
 *
 * Four of the five slots are overlays: `oorbellen` and `bril` go over the face, `sjaal`
 * between the neck and the chin (so the jaw covers its top edge, the way a scarf tucks in),
 * and `hoed` last of all, over the hair. `jas` is the odd one out — it does not lay anything
 * over the torso, it *is* the torso, which is why it renders the silhouette itself.
 *
 * Flat shading throughout, no gradients: a dozen of these render at once on the shop grid
 * and gradient <defs> ids would collide (see shade.ts).
 *
 * A new item is one entry here plus one line in shopItems.json; accessories.test.ts fails
 * the build when those two drift apart, which would otherwise show up as a tile you can buy
 * that puts nothing on your head.
 */

const GOLD = '#F7C531'
const GOLD_DARK = '#D9A616'
const PINK = '#F4778F'
const TEAL = '#2FA79B'
const DARK = '#3B3026'

/* ---------------------------------------------------------------- oorbellen */

/** Mirrors one earring shape onto both lobes, so each entry is drawn once. */
function pair(draw: (x: number, side: 1 | -1) => ReactNode): ReactNode {
  return (
    <>
      <g key="l">{draw(52, -1)}</g>
      <g key="r">{draw(148, 1)}</g>
    </>
  )
}

function star(cx: number, cy: number, r: number, fill: string) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.45
    const angle = (Math.PI / 5) * i - Math.PI / 2
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`
  })
  return <path d={`M${points.join(' L')} Z`} fill={fill} />
}

const OORBELLEN: Record<string, () => ReactNode> = {
  'oorbellen-stip': () =>
    pair((x) => (
      <>
        <circle cx={x} cy="114" r="4.2" fill={GOLD} />
        <circle cx={x + 1} cy="112.5" r="1.1" fill="#FFF6D8" />
      </>
    )),

  'oorbellen-hart': () =>
    pair((x) => (
      <path
        d={`M${x},118 C${x - 7},112 ${x - 7},105 ${x - 1},106 C${x},104 ${x + 3},104 ${x},109 C${x + 3},104 ${x + 6},104 ${x + 7},106 C${x + 9},109 ${x},113 ${x},118 Z`}
        fill={PINK}
      />
    )),

  'oorbellen-ring': () =>
    pair((x) => (
      <>
        <circle cx={x} cy="110" r="2.6" fill={GOLD_DARK} />
        <circle cx={x} cy="120" r="8" fill="none" stroke={GOLD} strokeWidth="3" />
      </>
    )),

  'oorbellen-ster': () =>
    pair((x) => (
      <>
        {star(x, 117, 8, GOLD)}
        <circle cx={x} cy="117" r="2" fill="#FFF6D8" />
      </>
    )),

  'oorbellen-druppel': () =>
    pair((x) => (
      <>
        <circle cx={x} cy="109" r="3" fill={GOLD} />
        <path
          d={`M${x},112 C${x + 7},120 ${x + 6},131 ${x},133 C${x - 6},131 ${x - 7},120 ${x},112 Z`}
          fill={TEAL}
        />
        <ellipse cx={x - 2} cy="122" rx="1.6" ry="3" fill="#FFFFFF" opacity="0.5" />
      </>
    )),

  'oorbellen-bloem': () =>
    pair((x) => (
      <>
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
          return (
            <circle
              key={i}
              cx={x + 5 * Math.cos(angle)}
              cy={117 + 5 * Math.sin(angle)}
              r="4"
              fill={PINK}
            />
          )
        })}
        <circle cx={x} cy="117" r="3.2" fill={GOLD} />
      </>
    )),
}

/* ---------------------------------------------------------------- bril */

/** The arms and the bridge every pair of glasses shares. */
function frame(color: string, y = 90) {
  return (
    <g stroke={color} strokeWidth="4.5" fill="none" strokeLinecap="round">
      <path d={`M93,${y + 1} Q100,${y - 4} 107,${y + 1}`} />
      <path d={`M63,${y - 2} Q54,${y} 51,${y + 7}`} />
      <path d={`M137,${y - 2} Q146,${y} 149,${y + 7}`} />
    </g>
  )
}

const BRIL: Record<string, () => ReactNode> = {
  'bril-rond': () => (
    <g>
      <circle cx="78" cy="93" r="15.5" fill="#FFFFFF" fillOpacity="0.2" stroke={DARK} strokeWidth="4.5" />
      <circle cx="122" cy="93" r="15.5" fill="#FFFFFF" fillOpacity="0.2" stroke={DARK} strokeWidth="4.5" />
      <circle cx="83" cy="87" r="2.5" fill="#FFFFFF" fillOpacity="0.7" />
      <circle cx="127" cy="87" r="2.5" fill="#FFFFFF" fillOpacity="0.7" />
      {frame(DARK, 91)}
    </g>
  ),

  'bril-vierkant': () => (
    <g>
      {[78, 122].map((cx) => (
        <rect
          key={cx}
          x={cx - 17}
          y="80"
          width="34"
          height="26"
          rx="7"
          fill="#FFFFFF"
          fillOpacity="0.2"
          stroke="#2F6BD1"
          strokeWidth="4.5"
        />
      ))}
      <path d="M67,84 L74,84" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <path d="M111,84 L118,84" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      {frame('#2F6BD1', 91)}
    </g>
  ),

  'bril-ster': () => {
    const lens = (cx: number) => (
      <path
        d={`M${cx - 16},86 Q${cx},74 ${cx + 16},86 Q${cx + 18},98 ${cx + 10},104 Q${cx},110 ${cx - 10},104 Q${cx - 18},98 ${cx - 16},86 Z`}
        fill="#FFFFFF"
        fillOpacity="0.25"
        stroke="#E2542F"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
    )
    return (
      <g>
        {lens(78)}
        {lens(122)}
        {frame('#E2542F', 88)}
        {star(58, 76, 7, GOLD)}
        {star(142, 76, 7, GOLD)}
      </g>
    )
  },

  'bril-zon': () => (
    <g>
      {[78, 122].map((cx) => (
        <path
          key={cx}
          d={`M${cx - 18},82 L${cx + 18},82 Q${cx + 19},100 ${cx + 6},106 Q${cx - 8},110 ${cx - 16},100 Z`}
          fill="#241C16"
          stroke="#12100E"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      ))}
      <path d="M66,88 L74,96" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" opacity="0.45" />
      <path d="M110,88 L118,96" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" opacity="0.45" />
      <path d="M96,83 L104,83" stroke="#12100E" strokeWidth="5" strokeLinecap="round" />
      <g stroke="#12100E" strokeWidth="4.5" fill="none" strokeLinecap="round">
        <path d="M60,84 Q53,86 50,94" />
        <path d="M140,84 Q147,86 150,94" />
      </g>
    </g>
  ),

  'bril-hart': () => {
    const heart = (cx: number) => (
      <path
        d={`M${cx},108 C${cx - 20},96 ${cx - 19},80 ${cx - 8},80 C${cx - 3},80 ${cx},84 ${cx},87
            C${cx},84 ${cx + 3},80 ${cx + 8},80 C${cx + 19},80 ${cx + 20},96 ${cx},108 Z`}
        fill="#FFFFFF"
        fillOpacity="0.25"
        stroke="#F4778F"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
    )
    return (
      <g>
        {heart(78)}
        {heart(122)}
        {frame(PINK, 89)}
      </g>
    )
  },

  'bril-duik': () => (
    <g>
      <path d="M48,92 L58,92" stroke="#E2542F" strokeWidth="7" strokeLinecap="round" />
      <path d="M142,92 L152,92" stroke="#E2542F" strokeWidth="7" strokeLinecap="round" />
      <rect x="56" y="74" width="88" height="38" rx="16" fill="#E2542F" />
      <rect x="62" y="79" width="76" height="27" rx="12" fill="#BEE9F5" fillOpacity="0.55" stroke="#8FD0E4" strokeWidth="2" />
      <path d="M70,84 L80,95" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <path d="M100,79 L100,106" stroke="#E2542F" strokeWidth="4" />
    </g>
  ),
}

/* ---------------------------------------------------------------- hoed */

const HOED: Record<string, () => ReactNode> = {
  'hoed-haarband': () => (
    <g>
      <path
        d="M50,78 C46,42 72,26 100,26 C128,26 154,42 150,78"
        stroke={PINK}
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
      <g>
        {[0, 1, 2, 3, 4].map((i) => {
          const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
          return (
            <circle key={i} cx={62 + 8 * Math.cos(angle)} cy={48 + 8 * Math.sin(angle)} r="6.5" fill="#FFFFFF" />
          )
        })}
        <circle cx="62" cy="48" r="5" fill={GOLD} />
      </g>
    </g>
  ),

  'hoed-strik': () => (
    <g fill={PINK}>
      <path d="M112,42 C112,30 96,26 90,34 C85,41 92,50 112,42 Z" />
      <path d="M116,42 C116,30 132,26 138,34 C143,41 136,50 116,42 Z" />
      <path d="M108,45 L104,58 L113,49 Z" />
      <path d="M120,45 L124,58 L115,49 Z" />
      <circle cx="114" cy="42" r="6" fill="#D9556E" />
    </g>
  ),

  'hoed-pet': () => (
    <g>
      <path
        d="M44,68 C42,36 68,16 100,16 C132,16 158,36 156,68 C156,60 148,52 132,50 C126,58 114,62 100,62 C86,62 74,58 68,50 C52,52 44,60 44,68 Z"
        fill={TEAL}
      />
      <ellipse cx="100" cy="63" rx="36" ry="8" fill="#22857B" />
      <circle cx="100" cy="20" r="4" fill="#22857B" />
    </g>
  ),

  'hoed-muts': () => (
    <g>
      <path d="M46,68 C44,30 70,16 100,16 C130,16 156,30 154,68 Z" fill="#E2542F" />
      <path d="M68,26 Q70,48 66,66" stroke="#B93E1E" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
      <path d="M132,26 Q130,48 134,66" stroke="#B93E1E" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
      <rect x="42" y="62" width="116" height="18" rx="9" fill="#FFF1DE" />
      <path d="M58,71 L142,71" stroke="#E4D4BC" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="12" r="12" fill="#FFF1DE" />
    </g>
  ),

  'hoed-zon': () => (
    <g>
      <ellipse cx="100" cy="62" rx="74" ry="17" fill="#F2DFA8" />
      <ellipse cx="100" cy="60" rx="74" ry="15" fill="#FBEFC8" />
      <path d="M64,62 C62,28 78,14 100,14 C122,14 138,28 136,62 Z" fill="#FBEFC8" />
      <path d="M64,52 Q100,62 136,52 L136,62 Q100,72 64,62 Z" fill={TEAL} />
      <ellipse cx="100" cy="16" rx="36" ry="6" fill="#F2DFA8" opacity="0.7" />
    </g>
  ),

  'hoed-koptelefoon': () => (
    <g>
      <path
        d="M44,96 C42,50 68,30 100,30 C132,30 158,50 156,96"
        stroke="#3B3026"
        strokeWidth="11"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M48,88 C46,52 70,36 100,36 C130,36 154,52 152,88"
        stroke="#6B5C48"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      {[44, 156].map((cx) => (
        <g key={cx}>
          <rect x={cx - 13} y="82" width="26" height="36" rx="13" fill="#3B3026" />
          <rect x={cx - 8} y="88" width="16" height="24" rx="8" fill="#E2542F" />
        </g>
      ))}
    </g>
  ),

  'hoed-kroon': () => (
    <g>
      <path
        d="M48,62 L48,50 L64,34 L78,52 L100,26 L122,52 L136,34 L152,50 L152,62 Z"
        fill={GOLD}
        stroke={GOLD_DARK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="48" y="58" width="104" height="10" rx="3" fill="#F2B822" stroke={GOLD_DARK} strokeWidth="2" />
      <circle cx="64" cy="40" r="4.5" fill="#E2542F" />
      <circle cx="100" cy="34" r="5.5" fill={TEAL} />
      <circle cx="136" cy="40" r="4.5" fill="#E2542F" />
    </g>
  ),

  'hoed-tovenaar': () => (
    <g>
      <ellipse cx="100" cy="62" rx="62" ry="15" fill="#6B3FD1" />
      <path d="M74,62 C76,36 94,14 118,2 C130,26 124,48 130,62 Z" fill="#7A4B9E" />
      <path d="M74,54 Q104,64 130,54 L130,64 Q104,74 74,64 Z" fill="#4E2A78" />
      {star(104, 32, 8, GOLD)}
      {star(115, 14, 5.5, GOLD)}
      {star(88, 48, 5, GOLD)}
    </g>
  ),
}

/* ---------------------------------------------------------------- sjaal */

/** The wrap around the neck and the end hanging down the front, shared by every scarf. */
const WRAP = 'M70,144 Q100,136 130,144 L133,170 Q100,184 67,170 Z'
const TAIL = 'M84,174 L78,224 L98,227 L100,176 Z'

function scarf(base: string, detail?: ReactNode) {
  return (
    <g>
      <path d={WRAP} fill={base} />
      <path d={TAIL} fill={shade(base, 0.12)} />
      {detail}
      <path d="M70,170 Q100,182 132,170" stroke={shade(base, 0.3)} strokeWidth="2.5" fill="none" opacity="0.5" />
    </g>
  )
}

/**
 * The wrap and the tail sliced into `colors.length` bands, for the rainbow.
 *
 * Cutting the shapes up beats clipping a stack of rectangles: a clipPath needs an id, and
 * ids collide across the several AvatarViews that render at once. Each band is the strip of
 * WRAP (and of TAIL) between two points along its length, so the ends of the run land
 * exactly on the scarf's own top and bottom edges.
 */
function rainbow(colors: string[]): ReactNode {
  // WRAP, parameterised: its edges run from (70,144)…(130,144) down to (67,170)…(133,170),
  // bowing through the same control x as the shared path does.
  const wrapLeft = (t: number) => [70 - 3 * t, 144 + 26 * t]
  const wrapRight = (t: number) => [130 + 3 * t, 144 + 26 * t]
  const wrapBow = (t: number) => 136 + 48 * t
  // TAIL, likewise: (84,174)…(100,176) down to (78,224)…(98,227).
  const tailLeft = (t: number) => [84 - 6 * t, 174 + 50 * t]
  const tailRight = (t: number) => [100 - 2 * t, 176 + 51 * t]
  const at = (p: number[]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`

  return (
    <g>
      {colors.map((fill, i) => {
        const t0 = i / colors.length
        const t1 = (i + 1) / colors.length
        return (
          <g key={fill}>
            <path
              d={`M${at(wrapLeft(t0))} Q100,${wrapBow(t0).toFixed(1)} ${at(wrapRight(t0))}
                  L${at(wrapRight(t1))} Q100,${wrapBow(t1).toFixed(1)} ${at(wrapLeft(t1))} Z`}
              fill={fill}
            />
            <path
              d={`M${at(tailLeft(t0))} L${at(tailRight(t0))} L${at(tailRight(t1))} L${at(tailLeft(t1))} Z`}
              fill={fill}
            />
          </g>
        )
      })}
    </g>
  )
}

const SJAAL: Record<string, () => ReactNode> = {
  'sjaal-gestreept': () =>
    scarf('#E2342F', (
      <g stroke="#FFF1DE" strokeWidth="6" strokeLinecap="round">
        <path d="M74,152 L126,148" />
        <path d="M70,166 L131,161" />
        <path d="M80,190 L96,191" />
        <path d="M79,208 L97,209" />
      </g>
    )),

  'sjaal-gebreid': () =>
    scarf('#D9A441', (
      <g stroke="#B98A2E" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8">
        <path d="M82,142 L80,178" />
        <path d="M100,139 L100,178" />
        <path d="M118,142 L120,178" />
        <path d="M86,186 Q91,190 96,186" />
        <path d="M84,200 Q89,204 95,200" />
        <path d="M82,214 Q88,218 94,214" />
      </g>
    )),

  'sjaal-stippen': () =>
    scarf('#F4778F', (
      <g fill="#FFF1DE">
        {[
          [78, 154],
          [98, 149],
          [118, 154],
          [86, 168],
          [110, 168],
          [88, 188],
          [86, 204],
          [84, 218],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" />
        ))}
      </g>
    )),

  'sjaal-regenboog': () =>
    rainbow(['#E2342F', '#FF7A29', GOLD, '#3FC55C', '#37A0F0', '#7A4B9E']),
}

/* ---------------------------------------------------------------- jas */

const BODY = 'M38,262 C38,188 58,148 100,148 C142,148 162,188 162,262 Z'
const BODY_LEFT = 'M38,262 C38,188 58,148 100,148 L100,262 Z'
const COLLAR_SEAM = 'M78,150 Q100,166 122,150'

interface Jacket {
  base: string
  /** drawn before the body — a hood, a cape, anything that sits behind the shoulders */
  behind?: (base: string, dark: string) => ReactNode
  /** drawn over the body — collars, zips, pockets, emblems */
  detail?: (base: string, dark: string) => ReactNode
}

const JAS: Record<string, Jacket> = {
  'jas-hoodie': {
    base: '#E2342F',
    behind: (_, dark) => (
      <path d="M62,176 C58,142 78,126 100,126 C122,126 142,142 138,176 C120,160 80,160 62,176 Z" fill={dark} />
    ),
    detail: (base, dark) => (
      <g>
        <path d="M74,166 C82,182 118,182 126,166 L130,178 C118,196 82,196 70,178 Z" fill={dark} />
        <g stroke="#FFF1DE" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M90,180 L88,206" />
          <path d="M110,180 L112,206" />
        </g>
        <circle cx="88" cy="209" r="4" fill="#FFF1DE" />
        <circle cx="112" cy="209" r="4" fill="#FFF1DE" />
        <path d="M60,222 Q100,232 140,222 L140,246 Q100,254 60,246 Z" fill={shade(base, 0.14)} />
      </g>
    ),
  },

  'jas-spijker': {
    base: '#4E7DD1',
    detail: (_, dark) => (
      <g>
        <path d="M80,150 L100,170 L72,178 L66,156 Z" fill={dark} />
        <path d="M120,150 L100,170 L128,178 L134,156 Z" fill={dark} />
        <path d="M100,170 L100,262" stroke={dark} strokeWidth="3" />
        {[186, 208, 230].map((cy) => (
          <circle key={cy} cx="100" cy={cy} r="4" fill={GOLD} />
        ))}
        <g fill="none" stroke={dark} strokeWidth="2.5" strokeLinecap="round">
          <path d="M60,196 L80,194 L82,214 L62,216" />
          <path d="M140,196 L120,194 L118,214 L138,216" />
          <path d="M52,232 Q64,228 74,230" />
          <path d="M148,232 Q136,228 126,230" />
        </g>
      </g>
    ),
  },

  'jas-regen': {
    base: '#F7C531',
    behind: (_, dark) => (
      <path d="M60,178 C56,142 78,124 100,124 C122,124 144,142 140,178 C120,160 80,160 60,178 Z" fill={dark} />
    ),
    detail: (base, dark) => (
      <g>
        <path d="M66,170 Q100,186 134,170 L136,182 Q100,198 64,182 Z" fill={dark} />
        <path d="M100,182 L100,262" stroke={shade(base, 0.22)} strokeWidth="3" />
        {[200, 222, 244].map((cy) => (
          <circle key={cy} cx="100" cy={cy} r="4.5" fill="#FFF1DE" stroke={shade(base, 0.25)} strokeWidth="1.5" />
        ))}
        <path d="M46,236 Q100,248 154,236" stroke={shade(base, 0.22)} strokeWidth="3" fill="none" />
      </g>
    ),
  },

  'jas-winter': {
    base: '#1F9E86',
    detail: (base, dark) => (
      <g>
        <g stroke={dark} strokeWidth="2.5" fill="none" opacity="0.75">
          <path d="M44,182 Q100,196 156,182" />
          <path d="M40,208 Q100,222 160,208" />
          <path d="M38,234 Q100,248 162,234" />
        </g>
        <path d="M100,152 L100,262" stroke={shade(base, 0.35)} strokeWidth="5" />
        <path d="M100,152 L100,262" stroke="#D8D2C6" strokeWidth="2" strokeDasharray="5 5" />
        <path d="M70,150 Q100,164 130,150 L132,162 Q100,176 68,162 Z" fill={shade(base, 0.3)} />
        <circle cx="100" cy="166" r="4.5" fill={GOLD} />
      </g>
    ),
  },

  'jas-superheld': {
    base: '#2B4FD6',
    behind: () => (
      <g fill="#E2342F">
        <path d="M66,150 C40,168 30,212 32,262 L62,262 C58,214 62,178 76,158 Z" />
        <path d="M134,150 C160,168 170,212 168,262 L138,262 C142,214 138,178 124,158 Z" />
      </g>
    ),
    detail: (_, dark) => (
      <g>
        <path d="M74,150 Q100,170 126,150 L130,162 Q100,182 70,162 Z" fill="#E2342F" />
        <circle cx="100" cy="204" r="30" fill={dark} />
        {star(100, 204, 26, GOLD)}
        <path d="M46,240 Q100,252 154,240" stroke={dark} strokeWidth="4" fill="none" opacity="0.5" />
      </g>
    ),
  },

  'jas-ruimtepak': {
    base: '#EDEAE2',
    detail: (_, dark) => (
      <g>
        <ellipse cx="100" cy="156" rx="30" ry="11" fill="#B9C2CC" stroke="#8B96A3" strokeWidth="2.5" />
        <rect x="76" y="186" width="48" height="34" rx="8" fill="#B9C2CC" stroke="#8B96A3" strokeWidth="2.5" />
        <circle cx="88" cy="198" r="4.5" fill="#3FC55C" />
        <circle cx="100" cy="198" r="4.5" fill={GOLD} />
        <circle cx="112" cy="198" r="4.5" fill="#E2342F" />
        <path d="M84,210 L116,210" stroke="#8B96A3" strokeWidth="3" strokeLinecap="round" />
        <path d="M76,200 C58,204 50,220 52,244" stroke="#8B96A3" strokeWidth="6" fill="none" strokeLinecap="round" />
        <g stroke={dark} strokeWidth="2.5" fill="none" opacity="0.5">
          <path d="M44,232 Q100,244 156,232" />
          <path d="M60,176 L60,262" />
          <path d="M140,176 L140,262" />
        </g>
      </g>
    ),
  },
}

/* ---------------------------------------------------------------- the rig's calls */

export function earrings(id: string | undefined): ReactNode {
  return id ? (OORBELLEN[id]?.() ?? null) : null
}

export function glasses(id: string | undefined): ReactNode {
  return id ? (BRIL[id]?.() ?? null) : null
}

export function hat(id: string | undefined): ReactNode {
  return id ? (HOED[id]?.() ?? null) : null
}

export function scarfLayer(id: string | undefined): ReactNode {
  return id ? (SJAAL[id]?.() ?? null) : null
}

/**
 * The torso — the default teal shirt, or the jas she is wearing.
 *
 * The shirt keeps its CSS custom properties so it still follows the theme; a jas brings its
 * own palette, because those colours are the item.
 */
export function torso(id: string | undefined): ReactNode {
  const jacket = id ? JAS[id] : undefined
  if (!jacket) {
    return (
      <g>
        <path d={BODY} fill="var(--teal)" />
        <path d={BODY_LEFT} fill="var(--teal-shadow)" opacity="0.35" />
        <path d={COLLAR_SEAM} stroke="var(--teal-shadow)" strokeWidth="3" fill="none" opacity="0.5" />
      </g>
    )
  }
  const dark = shade(jacket.base, 0.22)
  return (
    <g>
      {jacket.behind?.(jacket.base, dark)}
      <path d={BODY} fill={jacket.base} />
      <path d={BODY_LEFT} fill={shade(jacket.base, 0.3)} opacity="0.3" />
      {jacket.detail?.(jacket.base, dark)}
    </g>
  )
}

/** Every id this file draws, for the test that keeps it level with shopItems.json. */
export const DRAWN_ITEM_IDS: string[] = [
  ...Object.keys(OORBELLEN),
  ...Object.keys(BRIL),
  ...Object.keys(HOED),
  ...Object.keys(SJAAL),
  ...Object.keys(JAS),
]
