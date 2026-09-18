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
import { BADGE_MAP, badgeUrl } from '../lib/twitchChat'
import { KICK_BADGE_MAP } from '../lib/kickChat'
import type { BadgeId, Platform } from '../types'

/**
 * Prefijo de las insignias de Kick dentro del mapa de imagenes.
 *
 * Las dos plataformas usan claves "tipo/version" y `subscriber` existe en las
 * dos, asi que sin separarlas la insignia de sub de un canal pisaria a la del
 * otro cuando se muestran los dos chats juntos.
 */
export const KICK_PREFIX = 'kick:'

/**
 * Imagen de una insignia de Kick.
 *
 * Kick manda los meses que lleva suscripto, no cual de las insignias del canal
 * corresponde: hay que buscar el tramo mas alto que no los pase. Alguien con 7
 * meses lleva la de 6. El resto de las insignias no tiene tramos y entra
 * directo por su clave.
 */
function kickBadgeSrc(images: Record<string, string>, raw: string): string | undefined {
  const directo = images[KICK_PREFIX + raw]
  if (directo) return directo

  const [type, version] = raw.split('/')
  if (type !== 'subscriber') return undefined

  const meses = Number(version)
  if (!Number.isFinite(meses)) return undefined

  let mejor = 0
  let src: string | undefined
  for (const [key, value] of Object.entries(images)) {
    if (!key.startsWith(KICK_PREFIX + 'subscriber/')) continue
    const tramo = Number(key.slice((KICK_PREFIX + 'subscriber/').length))
    if (Number.isFinite(tramo) && tramo <= meses && tramo >= mejor) {
      mejor = tramo
      src = value
    }
  }
  return src
}

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

/**
 * Fila de insignias de un mensaje.
 *
 * Si la cuenta de Twitch esta vinculada tenemos el arte real del canal, y ahi
 * mostramos la imagen que corresponde a la version exacta (`subscriber/9` no es
 * la misma que `subscriber/3`). Sin eso, o para los mensajes simulados, caemos
 * al icono vectorial.
 */
export function BadgeRow({
  badges,
  rawBadges,
  images,
  size,
  platform,
}: {
  badges: BadgeId[]
  rawBadges?: string[]
  images?: Record<string, string>
  size: number
  platform?: Platform
}) {
  const esKick = platform === 'kick'

  if (rawBadges?.length) {
    return (
      <>
        {rawBadges.map((raw) => {
          const src = esKick ? kickBadgeSrc(images ?? {}, raw) : images?.[raw]
          if (src) {
            return (
              <img
                key={raw}
                className="ov-badge-img"
                src={badgeUrl(src)}
                alt=""
                style={{ width: size, height: size }}
              />
            )
          }
          const tipo = raw.split('/')[0]
          const mapped = esKick ? KICK_BADGE_MAP[tipo] : BADGE_MAP[tipo]
          return mapped ? <Badge key={raw} id={mapped} size={size} /> : null
        })}
      </>
    )
  }

  return (
    <>
      {badges.map((b) => (
        <Badge key={b} id={b} size={size} />
      ))}
    </>
  )
}

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
