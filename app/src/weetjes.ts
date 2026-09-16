import weetjesJson from '@shared/curriculum/weetjes.json'
import type { Weetje, WeetjeCurriculum } from '@shared/src/types'
import { hasRecording } from './audio/recorded'

/** Every card in the file, including the ones that are not cleared to be shown. */
export const allWeetjes: Weetje[] = (weetjesJson as WeetjeCurriculum).weetjes

const weetjeById = new Map(allWeetjes.map((w) => [w.id, w]))

export function getWeetje(id: string): Weetje | undefined {
  return weetjeById.get(id)
}

/**
 * The cards that may actually be dealt, lowest `order` first.
 *
 * `reviewed` is the same gate `words.json` uses and for the same reason: a fact about
 * dyslexia that turns out to be wrong is worse than no fact at all, and this game exists to
 * tell a nine-year-old things she can rely on (docs/weetjes.md §3, §4). A card is reviewed
 * only once Arjan has read both the copy and the source behind it.
 */
export const dealableWeetjes: Weetje[] = allWeetjes
  .filter((w) => w.reviewed)
  .sort((a, b) => a.order - b.order)

/**
 * Which cards a Weetje node deals: the lowest-order ones she has not collected yet.
 *
 * When she has collected everything, it deals the ones she saw longest ago rather than
 * going empty — re-hearing "je bent niet alleen" months later is the point of the game, not
 * a bug (§5). `collected` is her collection in the order she collected it, so its own index
 * is the recency ordering; nothing extra has to be stored.
 */
export function dealWeetjes(collected: string[], count: number): Weetje[] {
  if (dealableWeetjes.length === 0) return []
  const seen = new Set(collected)
  const fresh = dealableWeetjes.filter((w) => !seen.has(w.id))
  if (fresh.length >= count) return fresh.slice(0, count)

  // Oldest first among the ones she has already collected, so the top-up is the material
  // she is furthest from remembering. Cards not in `collected` can't reach here.
  const byAge = [...dealableWeetjes]
    .filter((w) => seen.has(w.id))
    .sort((a, b) => collected.indexOf(a.id) - collected.indexOf(b.id))
  return [...fresh, ...byAge].slice(0, count)
}

/** One run of text, and whether §6's single bold key word per sentence covers it. */
export interface BoldSegment {
  text: string
  bold: boolean
}

/**
 * Splits `*asterisked*` copy into runs, so the renderer can emit one `<strong>` per sentence
 * without any component learning the markup (docs/weetjes.md §6). An unpaired `*` is left
 * as plain text rather than swallowing the rest of the line — the unit test rejects one in
 * the content file, and a stray marker should never be able to blank a card on screen.
 */
export function boldSegments(text: string): BoldSegment[] {
  const out: BoldSegment[] = []
  const pattern = /\*([^*]+)\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push({ text: text.slice(last, match.index), bold: false })
    out.push({ text: match[1], bold: true })
    last = match.index + match[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false })
  return out
}

/** The copy with its bold markers removed — what gets narrated, and what a chip shows. */
export function plainText(text: string): string {
  return text.replace(/\*([^*]+)\*/g, '$1')
}

/**
 * The three narratable parts of a card, in the order the beats need them. `doe` is the
 * statement for a waar-niet-waar card and the question followed by its three options for a
 * kies/wie card — she has to be able to play the whole card without reading a word (§6).
 */
export type WeetjePart = 'fact' | 'doe' | 'reveal'

/** What a part is *spoken* as. Options are separate lines so they can be paced apart. */
export function narrationLines(weetje: Weetje, part: WeetjePart): string[] {
  if (part === 'fact') return [plainText(weetje.fact)]
  if (part === 'reveal') return [plainText(weetje.reveal)]
  if (weetje.type === 'waar-niet-waar') return [plainText(weetje.statement ?? '')]
  return [plainText(weetje.question ?? ''), ...(weetje.options ?? [])]
}

/**
 * Clip ids with a recorded take in public/audio/weetjes/, via `audio/recorded.ts`. The
 * studio uses it to show what still needs recording; playback probes the URL anyway, so a
 * clip that lands mid-session plays either way — but the studio's own grid would have gone on
 * showing it as missing until Vite restarted, which it no longer does (§3.2).
 */
export function hasWeetjeRecording(id: string, part: WeetjePart): boolean {
  return hasRecording('weetjes', `${id}-${part}`)
}
