export type FridaExpression =
  | 'sass'
  | 'happy'
  | 'head-grumpy'
  | 'head-sad'
  | 'head-celebrating'
  | 'head-sleepy'

interface Props {
  expression: FridaExpression
  className?: string
  width?: number
  alt?: string
}

/** Frida the bulldog — canonical mascot assets in /avatar (do not redraw). */
export function Frida({ expression, className, width, alt = 'Frida' }: Props) {
  return (
    <img
      src={`/avatar/frida-${expression}.svg`}
      alt={alt}
      className={className}
      style={width ? { width } : undefined}
      draggable={false}
    />
  )
}
