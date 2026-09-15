import type { ReactNode } from 'react'
import { Frida, type FridaExpression } from './Frida'

interface Props {
  expression: FridaExpression
  /** Rendered width of the art, in px. The bubble sizes itself to the text. */
  size: number
  /** 'large' is the welkom-flow's opening beat; 'normal' matches the reading game's coach row. */
  bubble?: 'normal' | 'large'
  className?: string
  children: ReactNode
}

/**
 * Frida with a speech bubble beside her — the app's one way of having her say something.
 *
 * The bubble is `.coach-bubble`, the same element the reading game's coach row already uses,
 * with a `--large` modifier for the opening screen rather than a second bubble style; that
 * row is a candidate to adopt this component later (docs/onboarding-welkom.md ss7).
 */
export function FridaSays({ expression, size, bubble = 'normal', className, children }: Props) {
  return (
    <div className={`frida-says ${className ?? ''}`}>
      <Frida expression={expression} width={size} className="frida-says-art" alt="Frida" />
      <p className={`coach-bubble ${bubble === 'large' ? 'coach-bubble--large' : ''}`}>
        {children}
      </p>
    </div>
  )
}
