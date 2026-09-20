/**
 * Mixes a hex colour toward black (amt > 0) or white (amt < 0).
 *
 * Flat shading, no gradients: several AvatarViews render at once (the statbar head, the
 * kapsel picker, every shop tile) and gradient <defs> ids would collide across them.
 */
export function shade(hex: string, amt: number): string {
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
