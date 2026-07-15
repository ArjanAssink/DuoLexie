// Icon paths from art/design_handoff_leerpad prototype — keep in sync with the design.

interface IconProps {
  size?: number
  fill: string
}

export function StarIcon({ size = 34, fill }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12,3 L14.7,8.6 L20.8,9.4 L16.4,13.7 L17.5,19.8 L12,16.9 L6.5,19.8 L7.6,13.7 L3.2,9.4 L9.3,8.6 Z" fill={fill} />
    </svg>
  )
}

export function FlitsIcon({ size = 28, fill }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M13,2 L6,13 L11,13 L10,22 L18,10 L12.5,10 Z" fill={fill} />
    </svg>
  )
}

export function MixIcon({ size = 28, fill }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M4,7 H9 L15,17 H20" stroke={fill} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4,17 H9 L15,7 H20" stroke={fill} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18,4.5 L21,7 L18,9.5 M18,14.5 L21,17 L18,19.5" stroke={fill} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TrophyIcon({ size = 28, fill }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        d="M7,4 H17 V6 H20 V9 C20,11 18.5,12.5 16.7,12.9 C16,15 14.5,16.4 13,16.8 V19 H16 V21 H8 V19 H11 V16.8 C9.5,16.4 8,15 7.3,12.9 C5.5,12.5 4,11 4,9 V6 H7 Z M4,9 C4,10 4.8,10.8 6,11 L6,8 H4 Z M20,9 C20,10 19.2,10.8 18,11 L18,8 H20 Z"
        fill={fill}
        fillRule="evenodd"
      />
    </svg>
  )
}

export function GemIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12,2 L21,9 L12,22 L3,9 Z" fill="#4FC3E8" />
      <path d="M12,2 L21,9 L12,12 L3,9 Z" fill="#7ED6F0" />
    </svg>
  )
}

export function FlameIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12,2 C13,7 17,8 17,14 A5,5 0 0 1 7,14 C7,10 9,9 9,6 C10,8 11,8 12,2 Z" fill="#F5883C" />
      <path d="M12,10 C13,12 14,12.5 14,15 A2.2,2.2 0 0 1 9.6,15 C9.6,13 11,12.5 12,10 Z" fill="#F7DE4A" />
    </svg>
  )
}

export function ListIcon({ size = 26, fill = '#FFFFFF' }: { size?: number; fill?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="4" y="4" width="16" height="3.4" rx="1.7" fill={fill} />
      <rect x="4" y="10.3" width="16" height="3.4" rx="1.7" fill={fill} />
      <rect x="4" y="16.6" width="10" height="3.4" rx="1.7" fill={fill} />
    </svg>
  )
}

export function HouseIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path d="M12,3 L21,10 V21 H14 V15 H10 V21 H3 V10 Z" fill="#F5A03C" />
      <path d="M12,3 L21,10 H3 Z" fill="#E2542F" />
    </svg>
  )
}

export function ChestIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <rect x="4" y="8" width="16" height="11" rx="2" fill="#D3C5A6" />
      <rect x="4" y="8" width="16" height="4.5" fill="#B7A886" />
      <rect x="10.5" y="10" width="3" height="4" rx="1" fill="#FDF8EE" />
    </svg>
  )
}

export function PersonIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <circle cx="12" cy="8.5" r="4" fill="#D3C5A6" />
      <path d="M4,20 C4,15.5 8,14 12,14 C16,14 20,15.5 20,20 Z" fill="#D3C5A6" />
    </svg>
  )
}

/** Lesson-coin icon by lesson title, colored by state */
export function LessonIcon({ title, fill, size }: { title: string; fill: string; size?: number }) {
  switch (title) {
    case 'Flits':
      return <FlitsIcon fill={fill} size={size ?? 28} />
    case 'Mix':
      return <MixIcon fill={fill} size={size ?? 28} />
    case 'Uitdaging':
      return <TrophyIcon fill={fill} size={size ?? 28} />
    default:
      return <StarIcon fill={fill} size={size ?? 30} />
  }
}
