import { memo } from 'react'
import { BadgeRow } from './Badge'
import { PLATFORMS, platformLogo } from './ChatOverlay'
import type { ChatMessage, Deletion, Notice } from '../types'

/**
 * La lista de mensajes de la pantalla de lectura.
 *
 * Vive aparte de la página para poder dibujarla con mensajes de prueba, que es
 * la única forma de mirar cómo queda una respuesta o un nombre larguísimo sin
 * depender de que alguien lo escriba en un chat de verdad.
 */

/**
 * Aclara los colores muy oscuros.
 *
 * Twitch reparte colores fijos y algunos —el azul puro, el bordó— sobre fondo
 * oscuro quedan ilegibles. En el overlay da igual porque el fondo es la escena,
 * pero acá el fondo es oscuro siempre y el nombre tiene que leerse.
 */
export function readableColor(hex: string): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full || 'ffffff', 16)
  if (!Number.isFinite(n)) return '#FFFFFF'

  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (l >= 0.55) return hex

  // Mismo tono y saturación, más luminosidad: el color sigue siendo el suyo.
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = Math.round(h * 60)
  if (h < 0) h += 360

  return `hsl(${h}, ${Math.round(Math.max(s, 0.45) * 100)}%, 68%)`
}

/**
 * El cartelito de un mensaje moderado.
 *
 * El nombre del moderador casi nunca está: Twitch **no** dice quién borró un
 * mensaje por la conexión anónima (haría falta EventSub con un token de
 * moderador, que esta pantalla pública no puede llevar). Kick sí lo manda en
 * los baneos. Por eso el texto se arma con lo que haya.
 */
function avisoDeBorrado({ by, scope }: Deletion): string {
  const quien = by ? ` por ${by}` : ''
  if (scope === 'all') return 'Chat vaciado'
  if (scope === 'user') return `Usuario expulsado${quien}`
  return `Mensaje borrado${quien}`
}

/**
 * La línea de un aviso de suscripción.
 *
 * La racha va aparte y resaltada porque es lo que la persona *eligió* mostrar:
 * si está, es que quiso que se viera. Los meses acumulados son el contexto.
 */
function Aviso({ notice }: { notice: Exclude<Notice, { kind: 'watch-streak' }> }) {
  // Una raid no trae mensaje, así que el aviso va en la línea del nombre:
  // "elTano trajo 143 personas". Poner "elTano:" y nada al lado quedaba raro.
  if (notice.kind === 'raid') {
    return (
      <span className="cr-notice-text">
        {notice.viewers !== undefined ? 'trajo' : 'hizo un raid'}
        {notice.viewers !== undefined && (
          <span className="cr-notice-raid">
            {notice.viewers} {notice.viewers === 1 ? 'persona' : 'personas'}
          </span>
        )}
      </span>
    )
  }

  const meses = notice.months
  return (
    <span className="cr-notice-text">
      {notice.kind === 'resub' ? 'renovó su sub' : 'se suscribió'}
      {meses !== undefined && meses > 1 && (
        <span className="cr-notice-dato">{meses} meses</span>
      )}
      {notice.streak !== undefined && (
        <span className="cr-notice-racha">
          {notice.streak} {notice.streak === 1 ? 'mes seguido' : 'meses seguidos'}
        </span>
      )}
    </span>
  )
}

/** El cuerpo de un mensaje, con sus emotes si los trae. */
function Body({ message }: { message: ChatMessage }) {
  if (!message.segments) return <>{message.text}</>

  return (
    <>
      {message.segments.map((seg, i) =>
        seg.type === 'emote' ? (
          <img key={i} className="cr-emote" src={seg.url} alt={seg.name} title={seg.name} />
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </>
  )
}

interface RowProps {
  message: ChatMessage
  badgeImages?: Record<string, string>
  size: number
  showPlatform?: boolean
}

/**
 * Una fila del chat, memoizada.
 *
 * El `memo` no es de adorno: sin él, cada mensaje que entra vuelve a dibujar
 * los 300 que ya estaban. Medido, eso costaba 33 ms por mensaje con la lista
 * llena, y un chat movido deja de ir fluido. Los mensajes no se modifican una
 * vez creados —moderar uno arma un objeto nuevo— así que comparar por
 * referencia alcanza y el mensaje nuevo es lo único que se dibuja.
 */
const MessageRow = memo(function MessageRow({
  message: m,
  badgeImages,
  size,
  showPlatform,
}: RowProps) {
  const plataforma = m.platform && showPlatform ? PLATFORMS[m.platform] : null

  return (
    <article
      className={[
        'cr-msg',
        plataforma ? `is-${m.platform}` : '',
        m.deleted ? 'is-deleted' : '',
        m.notice ? 'is-notice' : '',
        m.notice && 'streak' in m.notice && m.notice.streak !== undefined ? 'is-streak' : '',
        m.notice?.kind === 'watch-streak' ? 'is-watch-streak' : '',
        m.firstMessage ? 'is-first' : '',
        m.notice?.kind === 'raid' ? 'is-raid' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* El mensaje al que contesta, arriba y en chico: se entiende la
          conversación sin tener que ir a buscar el original, que puede
          haber quedado muy arriba o directamente fuera del historial. */}
      {/* Primera vez que escribe. Va arriba de todo, incluso de la cita: la
          cita dice a qué contesta, esto dice quién es, y eso encabeza la fila. */}
      {m.firstMessage && <p className="cr-first">Primer mensaje en el canal</p>}

      {m.reply && (
        <p className="cr-reply">
          <span className="cr-reply-user">{m.reply.user}</span>
          <span className="cr-reply-text">{m.reply.text}</span>
        </p>
      )}

      {/* La racha de ver el stream, arriba del mensaje: es el contexto de lo
          que escribió, no el contenido. */}
      {m.notice?.kind === 'watch-streak' && (
        <p className="cr-watch-streak">
          Racha de {m.notice.streams} {m.notice.streams === 1 ? 'stream' : 'streams'}
        </p>
      )}

      <p className="cr-line">
        {/* De dónde vino el mensaje. Va antes que las insignias, a la
            misma altura, para que el renglón arranque siempre igual. */}
        {plataforma && (
          <img
            className="cr-platform"
            src={platformLogo(plataforma.slug, plataforma.color)}
            alt={plataforma.label}
            title={plataforma.label}
            style={{ width: Math.round(size * 0.85), height: Math.round(size * 0.85) }}
          />
        )}

        {m.badges.length > 0 || m.rawBadges?.length ? (
          <span className="cr-badges">
            <BadgeRow
              badges={m.badges}
              rawBadges={m.rawBadges}
              images={badgeImages}
              size={Math.round(size * 0.85)}
              platform={m.platform}
            />
          </span>
        ) : null}

        <b className="cr-user" style={{ color: readableColor(m.color) }}>
          {m.user}
        </b>

        {/* En un sub el aviso *es* la línea: lo que escribió, si escribió,
            va abajo. En una racha de ver el stream pasa al revés — el mensaje
            es lo que la persona quiso decir y la racha lo acompaña— así que
            se dibuja como un mensaje normal. */}
        {m.notice && m.notice.kind !== 'watch-streak' ? (
          <Aviso notice={m.notice} />
        ) : (
          <span className="cr-text">
            <Body message={m} />
          </span>
        )}
      </p>

      {m.notice?.kind !== 'watch-streak' && m.notice && m.text && (
        <p className="cr-notice-msg">
          <Body message={m} />
        </p>
      )}

      {m.deleted && <p className="cr-deleted">{avisoDeBorrado(m.deleted)}</p>}
    </article>
  )
})

interface Props {
  messages: ChatMessage[]
  /** Arte real de las insignias, si el preset lo trae guardado. */
  badgeImages?: Record<string, string>
  /** Tamaño del texto, en px. Las insignias y los emotes lo siguen. */
  size: number
  /**
   * Marcar de qué plataforma vino cada mensaje.
   *
   * Sólo tiene sentido con las dos mezcladas: con una sola, todos los mensajes
   * vendrían del mismo lado y la marca sería ruido.
   */
  showPlatform?: boolean
}

export default function ChatList({ messages, badgeImages, size, showPlatform }: Props) {
  return (
    <>
      {messages.map((m) => (
        <MessageRow
          key={m.id}
          message={m}
          badgeImages={badgeImages}
          size={size}
          showPlatform={showPlatform}
        />
      ))}
    </>
  )
}
