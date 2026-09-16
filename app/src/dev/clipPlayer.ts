/**
 * Playing clips back — the half of the loop that is actually judging
 * (docs/recording-studio-v3.md §2.1).
 *
 * Shared by the set grid and the per-take report, because they are the same act at two
 * moments: judging right after a split, and judging later while looking at the whole set. It
 * used to exist only inside `TakeReview`, with the folder worked out by a ternary that got
 * Weetjes wrong — so a Weetjes report played every row from `/audio/words/`, heard nothing,
 * and said nothing about it (§2.8). One player, one `folderFor`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { clipSrc, type ClipKind } from '../audio/recorded'

/** Long enough to hear the clip end and think, short enough to get through twenty. */
export const GAP_MS = 400

export interface ClipPlayer {
  /** the id that is sounding right now, for the highlight */
  playing: string | null
  /** true while walking a queue, so the screen can offer a stop button */
  walking: boolean
  play: (id: string, cacheKey?: string | null) => void
  /** play these in order with a gap; `onReach` fires as each one starts */
  walk: (ids: string[], keyFor?: (id: string) => string | null) => void
  /** stop the current clip and start the next one in the queue, if there is one */
  advance: () => void
  stop: () => void
}

export function useClipPlayer(kind: ClipKind): ClipPlayer {
  const [playing, setPlaying] = useState<string | null>(null)
  const [walking, setWalking] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const gap = useRef<number | null>(null)
  const queue = useRef<string[]>([])
  const keyFor = useRef<(id: string) => string | null>(() => null)

  const stop = useCallback(() => {
    if (gap.current !== null) clearTimeout(gap.current)
    gap.current = null
    queue.current = []
    const el = audio.current
    audio.current = null
    if (el) {
      // drop the handlers first: pausing fires nothing, but an in-flight load can still
      // error, and an onerror that restarts the queue after a stop is a queue that will not
      // stop
      el.onended = null
      el.onerror = null
      el.pause()
    }
    setPlaying(null)
    setWalking(false)
  }, [])

  // a studio left mid-playback should not go on talking from a screen nobody is looking at
  useEffect(() => stop, [stop])

  const start = useCallback((id: string, cacheKey: string | null | undefined, onDone: () => void) => {
    const previous = audio.current
    if (previous) {
      previous.onended = null
      previous.onerror = null
      previous.pause()
    }
    // `?v=<Last-Modified>` rather than a build stamp: a retake overwrites the same URL, and
    // both the browser's cache and the service worker will otherwise go on handing back the
    // take before it — which during a judging pass means approving audio that no longer
    // exists. Keying on the file's own timestamp busts the cache exactly when the file
    // changed, so a second listen to the same clip is still instant.
    const el = new Audio(clipSrc(kind, id, cacheKey))
    audio.current = el
    setPlaying(id)
    const finish = () => {
      if (audio.current !== el) return // superseded by a newer play; its handlers own the flow
      setPlaying(null)
      onDone()
    }
    el.onended = finish
    // a clip that will not load is still a clip that has been "listened to" as far as walking
    // the set goes — stalling on it would strand the pass on one bad row
    el.onerror = finish
    void el.play().catch(finish)
  }, [kind])

  const step = useCallback(() => {
    const [head, ...tail] = queue.current
    if (head === undefined) {
      queue.current = []
      setWalking(false)
      setPlaying(null)
      return
    }
    queue.current = tail
    start(head, keyFor.current(head), () => {
      gap.current = window.setTimeout(step, GAP_MS)
    })
  }, [start])

  const play = useCallback((id: string, cacheKey?: string | null) => {
    if (gap.current !== null) clearTimeout(gap.current)
    gap.current = null
    queue.current = []
    setWalking(false)
    start(id, cacheKey, () => setPlaying(null))
  }, [start])

  const walk = useCallback((ids: string[], keys?: (id: string) => string | null) => {
    if (gap.current !== null) clearTimeout(gap.current)
    gap.current = null
    keyFor.current = keys ?? (() => null)
    queue.current = [...ids]
    setWalking(ids.length > 0)
    step()
  }, [step])

  /** What `G`/`A` do after judging: this one is dealt with, get on with the next. */
  const advance = useCallback(() => {
    if (gap.current !== null) clearTimeout(gap.current)
    gap.current = null
    if (queue.current.length === 0) {
      const el = audio.current
      audio.current = null
      if (el) {
        el.onended = null
        el.onerror = null
        el.pause()
      }
      setPlaying(null)
      setWalking(false)
      return
    }
    step()
  }, [step])

  return { playing, walking, play, walk, advance, stop }
}
