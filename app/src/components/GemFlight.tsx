import { useLayoutEffect, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { gemSpriteCount } from '../screens/rewardTimeline'

interface Props {
  /** gems in the air. 0 renders nothing. */
  count: number
  /** the gem counter in the statbar — where they are going */
  targetRef: RefObject<HTMLElement | null>
}

/**
 * The gems she opened the chest for, arriving in the jar (docs/kist-openen.md §4).
 *
 * They fly from low on the screen — roughly where the chest stood on the reward screen she
 * just left — up into the gem counter in the statbar. The two screens are separate route
 * renders with a hard cut between them, so this is not one continuous animation and does not
 * pretend to be: it is the second half of a gesture the first half set up, and the thing that
 * makes it read as one is that the gems leave from where the chest was and land on the
 * counter that then changes.
 *
 * The destination is *measured* rather than assumed. The statbar's gem stat moves with the
 * font toggle, the notch inset and the width of the number in it (nine gems and nine thousand
 * are not the same box), and a hard-coded corner would be wrong on the first phone that
 * disagreed.
 */
export function GemFlight({ count, targetRef }: Props) {
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null)

  // Layout effect, not an effect: the sprites must not paint once at the wrong place and
  // then jump. With no measurement yet there is nothing to render at all.
  useLayoutEffect(() => {
    if (count <= 0) return
    const el = targetRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    setTarget({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
  }, [count, targetRef])

  if (count <= 0 || !target) return null

  const sprites = gemSpriteCount(count)

  return (
    <div className="gem-flight" aria-hidden="true">
      {Array.from({ length: sprites }, (_, i) => (
        <span
          key={i}
          className="gem-flight-gem"
          style={
            {
              '--i': i,
              '--n': sprites,
              '--tx': `${target.x}px`,
              '--ty': `${target.y}px`,
            } as CSSProperties
          }
        >
          💎
        </span>
      ))}
    </div>
  )
}
