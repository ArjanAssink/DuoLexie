/**
 * What a number on a meter means (docs/recording-studio-v3.md §2.2–§2.4).
 *
 * Pure, and separate from the Web Audio that produces the numbers, because these thresholds
 * are the actual content: a take recorded at -30 dBFS peak gets pulled up by `loudnorm`
 * together with every bit of room noise under it, and that is a large part of what "not
 * clean" sounds like. It is fixable in five seconds before the take and not at all after it,
 * so the meter has to say so in words rather than leave it to be read off a bar.
 */

/** The band the setup meter draws in green. Peaks, not RMS. */
export const TARGET_ZONE = { low: -18, high: -6 }

/** Below this for long enough and something is unplugged or muted, not quiet. */
export const NO_SIGNAL_DBFS = -55
export const NO_SIGNAL_AFTER_MS = 5000

/** A sample at or above this is at the top of the scale; the next one may be over it. */
export const CLIP_DBFS = -0.5

/** One frame over is a tick; two in a row is a clipped word (§2.2). */
export const CLIP_FRAMES = 2

export type LevelVerdict = 'geen-signaal' | 'te-zacht' | 'goed' | 'te-hard' | 'oversturing'

export const LEVEL_TEXT: Record<LevelVerdict, string> = {
  'geen-signaal': 'geen signaal — staat de juiste microfoon aan?',
  'te-zacht': 'te zacht — zet de gain hoger of ga dichterbij',
  goed: 'goed',
  'te-hard': 'te hard — zet de gain lager',
  oversturing: 'oversturing — dit wordt vervormd opgenomen',
}

/**
 * The verdict for a held peak.
 *
 * `te zacht` starts at -24 rather than at the bottom of the green band: -24…-18 is quiet but
 * usable, and a meter that scolds at every number outside the ideal band gets ignored. The
 * band is where to aim; this is where to worry.
 */
export function levelVerdict(heldPeakDbfs: number | null): LevelVerdict {
  if (heldPeakDbfs === null || !Number.isFinite(heldPeakDbfs) || heldPeakDbfs < NO_SIGNAL_DBFS) return 'geen-signaal'
  if (heldPeakDbfs >= CLIP_DBFS) return 'oversturing'
  if (heldPeakDbfs > TARGET_ZONE.high) return 'te-hard'
  if (heldPeakDbfs < -24) return 'te-zacht'
  return 'goed'
}

export type FloorVerdict = 'stil' | 'oke' | 'ruis'

export const FLOOR_TEXT: Record<FloorVerdict, string> = {
  stil: 'stil — hier kun je opnemen',
  oke: 'oké — hoorbaar maar bruikbaar',
  ruis: 'ruis — ventilator, laptop, koelkast?',
}

/**
 * The room's noise floor, as RMS over two seconds of not speaking.
 *
 * This is the number the splitter's silence threshold is derived from, so a quiet floor is
 * not only a cleaner clip but a more reliable cut: the threshold sits about 12dB above the
 * floor, and a floor at -45 puts it where a Dutch final consonant lives.
 */
export function floorVerdict(rmsDbfs: number): FloorVerdict {
  if (rmsDbfs < -60) return 'stil'
  if (rmsDbfs <= -50) return 'oke'
  return 'ruis'
}

/** How far a mains harmonic must stand above its neighbours before it is called hum. */
export const HUM_MARGIN_DB = 20

export function hasHum(hz50Db: number, hz100Db: number): boolean {
  return hz50Db > HUM_MARGIN_DB || hz100Db > HUM_MARGIN_DB
}

/** Where a level sits on the meter, 0 at -60 dBFS and 1 at 0. */
export function meterFraction(dbfs: number | null): number {
  if (dbfs === null || !Number.isFinite(dbfs)) return 0
  return Math.max(0, Math.min(1, (dbfs + 60) / 60))
}
