import type { BadgeId } from '../types'

interface BadgeStyle {
  label: string
  short: string
  bg: string
  fg: string
}

export const BADGE_STYLES: Record<BadgeId, BadgeStyle> = {
  broadcaster: { label: 'Streamer', short: '●', bg: '#E91916', fg: '#FFFFFF' },
  mod: { label: 'Moderador', short: '⚔', bg: '#00AD03', fg: '#FFFFFF' },
  vip: { label: 'VIP', short: '◆', bg: '#E005B9', fg: '#FFFFFF' },
  sub: { label: 'Suscriptor', short: '★', bg: '#9146FF', fg: '#FFFFFF' },
  prime: { label: 'Prime', short: '👑', bg: '#00A0D6', fg: '#FFFFFF' },
  turbo: { label: 'Turbo', short: '⚡', bg: '#5C16C5', fg: '#FFFFFF' },
  staff: { label: 'Staff', short: '⚙', bg: '#3D3D45', fg: '#FFFFFF' },
}

export const BADGE_IDS = Object.keys(BADGE_STYLES) as BadgeId[]

export function Badge({ id, size }: { id: BadgeId; size: number }) {
  const style = BADGE_STYLES[id]
  if (!style) return null
  return (
    <span
      className="ov-badge"
      title={style.label}
      style={{
        width: size,
        height: size,
        background: style.bg,
        color: style.fg,
        fontSize: size * 0.62,
        borderRadius: Math.max(2, size * 0.18),
      }}
    >
      {style.short}
    </span>
  )
}
