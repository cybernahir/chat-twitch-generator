import { TWITCH_COLORS } from '../defaults'
import type { BadgeId, ChatMessage, MessageSegment } from '../types'

/**
 * Lector del chat real de Twitch.
 *
 * Se conecta de forma anonima: Twitch acepta un nick `justinfan<numeros>` sin
 * contrasena para lectura. Eso significa que el overlay no lleva ningun token
 * adentro, asi que el link que se pega en OBS se puede compartir sin riesgo.
 * A cambio es de solo lectura, que es exactamente lo que necesitamos.
 *
 * Twitch empuja a migrar a EventSub y `justinfan` nunca estuvo documentado
 * oficialmente, asi que si algun dia deja de andar hay que pasar a EventSub,
 * que si pide OAuth.
 */

const ENDPOINT = 'wss://irc-ws.chat.twitch.tv:443'
const EMOTE_CDN = 'https://static-cdn.jtvnw.net/emoticons/v2'
const BADGE_CDN = 'https://static-cdn.jtvnw.net/badges/v1'

export type TwitchStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

/**
 * Lo que hay que sacar de pantalla cuando moderan el chat.
 *
 *  - message: borraron un mensaje suelto.
 *  - user: banearon o dieron timeout, y se van todos los mensajes de esa persona.
 *  - all: vaciaron el chat entero.
 */
export type ChatRemoval =
  | { type: 'message'; id: string }
  | { type: 'user'; userId?: string; login?: string }
  | { type: 'all' }

export interface TwitchChatHandlers {
  onMessage: (message: ChatMessage) => void
  onStatus: (status: TwitchStatus, detail?: string) => void
  /**
   * Moderacion: borrar un mensaje, los de una persona, o todos.
   *
   * El overlay tiene que reflejarlo. Si un mod borra algo porque no queria que
   * se viera, dejarlo en pantalla —y en la transmision— es justo lo que se
   * estaba tratando de evitar.
   */
  onRemove?: (removal: ChatRemoval) => void
  /**
   * Id numerico del canal, que Twitch manda en el ROOMSTATE al entrar.
   *
   * Viene gratis con la conexion que ya tenemos, asi que evita una vuelta a la
   * API para traducir el nombre del canal a id. Lo usa el editor para pedir las
   * insignias del canal que se esta leyendo.
   */
  onRoomId?: (roomId: string) => void
}

/** Insignias de Twitch que sabemos dibujar con icono. El resto se ignora. */
export const BADGE_MAP: Record<string, BadgeId> = {
  broadcaster: 'broadcaster',
  moderator: 'mod',
  lead_moderator: 'mod',
  vip: 'vip',
  subscriber: 'sub',
  founder: 'sub',
  premium: 'prime',
  turbo: 'turbo',
  staff: 'staff',
  admin: 'staff',
  global_mod: 'staff',
}

export function emoteUrl(id: string): string {
  return `${EMOTE_CDN}/${id}/default/dark/3.0`
}

/**
 * URL de la imagen de una insignia a partir de lo que guarda el preset.
 *
 * Se guarda solo el id (`0822047b-...`) porque son ~530 insignias por preset y
 * repetir el prefijo del CDN en cada una costaba 20 KB. Los presets hechos
 * antes de eso guardaron la URL entera, asi que esa forma se acepta igual.
 */
export function badgeUrl(stored: string): string {
  return stored.includes('://') ? stored : `${BADGE_CDN}/${stored}/3`
}

/** Desescapa un valor de tag IRCv3. */
function unescapeTag(value: string): string {
  return value.replace(/\\(.)/g, (_, ch: string) => {
    if (ch === 's') return ' '
    if (ch === ':') return ';'
    if (ch === 'r') return '\r'
    if (ch === 'n') return '\n'
    return ch
  })
}

function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const pair of raw.split(';')) {
    const eq = pair.indexOf('=')
    if (eq < 0) tags[pair] = ''
    else tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1))
  }
  return tags
}

function parseBadges(raw: string | undefined): BadgeId[] {
  if (!raw) return []
  const out: BadgeId[] = []
  for (const entry of raw.split(',')) {
    const name = entry.split('/')[0]
    const mapped = BADGE_MAP[name]
    if (mapped && !out.includes(mapped)) out.push(mapped)
  }
  return out
}

/** Color estable para los usuarios que nunca eligieron uno. */
function fallbackColor(user: string): string {
  let hash = 0
  for (let i = 0; i < user.length; i++) hash = (hash * 31 + user.charCodeAt(i)) >>> 0
  return TWITCH_COLORS[hash % TWITCH_COLORS.length]
}

/**
 * Parte el mensaje en texto y emotes.
 *
 * El tag `emotes` viene como `id:inicio-fin,inicio-fin/otroId:inicio-fin`, y los
 * indices cuentan **puntos de codigo**, no unidades UTF-16. Por eso recorremos
 * con Array.from: si el mensaje trae un emoji fuera del plano basico, cortar
 * con slice normal correria todos los emotes de lugar.
 */
export function buildSegments(text: string, emotesTag: string | undefined): MessageSegment[] {
  if (!emotesTag) return [{ type: 'text', value: text }]

  const chars = Array.from(text)
  const ranges: { start: number; end: number; id: string }[] = []

  for (const group of emotesTag.split('/')) {
    const colon = group.indexOf(':')
    if (colon < 0) continue
    const id = group.slice(0, colon)
    for (const span of group.slice(colon + 1).split(',')) {
      const [rawStart, rawEnd] = span.split('-')
      const start = Number(rawStart)
      const end = Number(rawEnd)
      if (Number.isFinite(start) && Number.isFinite(end)) ranges.push({ start, end, id })
    }
  }

  if (!ranges.length) return [{ type: 'text', value: text }]
  ranges.sort((a, b) => a.start - b.start)

  const segments: MessageSegment[] = []
  let cursor = 0

  for (const { start, end, id } of ranges) {
    if (start < cursor || start >= chars.length) continue
    if (start > cursor) segments.push({ type: 'text', value: chars.slice(cursor, start).join('') })
    segments.push({ type: 'emote', url: emoteUrl(id), name: chars.slice(start, end + 1).join('') })
    cursor = end + 1
  }

  if (cursor < chars.length) segments.push({ type: 'text', value: chars.slice(cursor).join('') })
  return segments
}

/** Convierte una linea PRIVMSG completa en un mensaje nuestro. */
function toMessage(tags: Record<string, string>, prefix: string, text: string): ChatMessage {
  const login = prefix.slice(0, prefix.indexOf('!')) || 'usuario'
  const user = tags['display-name']?.trim() || login
  const segments = buildSegments(text, tags.emotes)

  // Guardamos las insignias crudas ademas de las mapeadas: `subscriber/9` y
  // `subscriber/3` son imagenes distintas, y esa version se pierde al mapear.
  const rawBadges = tags.badges ? tags.badges.split(',').filter(Boolean) : undefined

  return {
    id: tags.id || `tw${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user,
    text,
    color: tags.color || fallbackColor(login),
    badges: parseBadges(tags.badges),
    createdAt: Number(tags['tmi-sent-ts']) || Date.now(),
    segments: segments.some((s) => s.type === 'emote') ? segments : undefined,
    rawBadges,
    platform: 'twitch',
    userId: tags['user-id'] || undefined,
  }
}

/**
 * Abre la conexion y devuelve una funcion para cerrarla.
 * Reconecta sola con espera creciente si se cae.
 */
export function connectTwitchChat(channel: string, handlers: TwitchChatHandlers): () => void {
  const target = channel.trim().toLowerCase().replace(/^#/, '')
  if (!target) {
    handlers.onStatus('idle')
    return () => {}
  }

  let socket: WebSocket | null = null
  let retries = 0
  let retryTimer: number | null = null
  let disposed = false

  const open = () => {
    if (disposed) return
    handlers.onStatus(retries === 0 ? 'connecting' : 'reconnecting')

    let ws: WebSocket
    try {
      ws = new WebSocket(ENDPOINT)
    } catch {
      handlers.onStatus('error', 'No se pudo abrir la conexion.')
      return
    }
    socket = ws

    ws.onopen = () => {
      // Sin PASS: la lectura anonima no necesita token.
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      ws.send(`NICK justinfan${Math.floor(Math.random() * 90000) + 10000}`)
      ws.send(`JOIN #${target}`)
    }

    ws.onmessage = (event) => {
      for (const line of String(event.data).split('\r\n')) {
        if (!line) continue

        // El servidor exige responder el PING o corta la conexion.
        if (line.startsWith('PING')) {
          ws.send('PONG :tmi.twitch.tv')
          continue
        }

        let rest = line
        let tags: Record<string, string> = {}
        if (rest.startsWith('@')) {
          const sp = rest.indexOf(' ')
          tags = parseTags(rest.slice(1, sp))
          rest = rest.slice(sp + 1)
        }

        let prefix = ''
        if (rest.startsWith(':')) {
          const sp = rest.indexOf(' ')
          prefix = rest.slice(1, sp)
          rest = rest.slice(sp + 1)
        }

        const space = rest.indexOf(' ')
        const command = space < 0 ? rest : rest.slice(0, space)

        // Borraron un mensaje suelto: el tag trae el id del mensaje.
        if (command === 'CLEARMSG') {
          const target = tags['target-msg-id']
          if (target) handlers.onRemove?.({ type: 'message', id: target })
          continue
        }

        // Baneo, timeout o /clear. Con target-user-id es contra una persona (y
        // el login viene como texto del comando); sin eso, es el chat entero.
        if (command === 'CLEARCHAT') {
          const userId = tags['target-user-id']
          const textAt = rest.indexOf(' :')
          const login = textAt >= 0 ? rest.slice(textAt + 2).trim() : ''
          handlers.onRemove?.(
            userId || login ? { type: 'user', userId, login } : { type: 'all' },
          )
          continue
        }

        // ROOMSTATE llega al entrar al canal y trae el id del canal adentro.
        if (command === 'ROOMSTATE') {
          if (tags['room-id']) handlers.onRoomId?.(tags['room-id'])
          continue
        }

        if (command === '366') {
          retries = 0
          handlers.onStatus('connected')
          continue
        }

        // Twitch puede pedir que nos reconectemos por mantenimiento.
        if (command === 'RECONNECT') {
          ws.close()
          continue
        }

        if (command === 'PRIVMSG') {
          const textAt = rest.indexOf(' :')
          if (textAt < 0) continue
          handlers.onMessage(toMessage(tags, prefix, rest.slice(textAt + 2)))
        }
      }
    }

    ws.onerror = () => {
      if (!disposed) handlers.onStatus('error', 'Se corto la conexion con Twitch.')
    }

    ws.onclose = () => {
      if (disposed) return
      retries += 1
      const wait = Math.min(30000, 1000 * 2 ** Math.min(retries, 5))
      handlers.onStatus('reconnecting', `Reintentando en ${Math.round(wait / 1000)} s.`)
      retryTimer = window.setTimeout(open, wait)
    }
  }

  open()

  return () => {
    disposed = true
    if (retryTimer) window.clearTimeout(retryTimer)
    if (socket) {
      socket.onclose = null
      socket.close()
    }
    handlers.onStatus('idle')
  }
}
