import {
  Crown,
  Diamond,
  Gear,
  Lightning,
  Star,
  Sword,
  VideoCamera,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { BadgeId } from '../types'

interface BadgeStyle {
  label: string
  Glyph: Icon
  bg: string
  fg: string
}

/**
 * Insignias con iconos vectoriales en vez de emoji: el emoji cambia de forma
 * segun el sistema operativo y en el navegador interno de OBS suele salir
 * distinto al de la preview.
 */
export const BADGE_STYLES: Record<BadgeId, BadgeStyle> = {
  broadcaster: { label: 'Streamer', Glyph: VideoCamera, bg: '#E91916', fg: '#FFFFFF' },
  mod: { label: 'Moderador', Glyph: Sword, bg: '#00AD03', fg: '#FFFFFF' },
  vip: { label: 'VIP', Glyph: Diamond, bg: '#E005B9', fg: '#FFFFFF' },
  sub: { label: 'Suscriptor', Glyph: Star, bg: '#9146FF', fg: '#FFFFFF' },
  prime: { label: 'Prime', Glyph: Crown, bg: '#00A0D6', fg: '#FFFFFF' },
  turbo: { label: 'Turbo', Glyph: Lightning, bg: '#5C16C5', fg: '#FFFFFF' },
  staff: { label: 'Staff', Glyph: Gear, bg: '#3D3D45', fg: '#FFFFFF' },
}

export const BADGE_IDS = Object.keys(BADGE_STYLES) as BadgeId[]

export function Badge({ id, size }: { id: BadgeId; size: number }) {
  const style = BADGE_STYLES[id]
  if (!style) return null
  const { Glyph } = style
  return (
    <span
      className="ov-badge"
      title={style.label}
      style={{
        width: size,
        height: size,
        background: style.bg,
        color: style.fg,
        borderRadius: Math.max(2, size * 0.2),
      }}
    >
      <Glyph size={size * 0.68} weight="fill" />
    </span>
  )
}
