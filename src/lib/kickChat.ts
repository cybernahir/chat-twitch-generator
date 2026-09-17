import type { BadgeId, ChatMessage, MessageSegment } from '../types'

/**
 * Lector del chat real de Kick.
 *
 * Kick no tiene servidor de chat propio: usa Pusher, y su canal publico acepta
 * suscripciones anonimas. Igual que con Twitch, esto significa que el overlay
 * no lleva ningun token adentro y el link de OBS se puede compartir.
 *
 * Dos diferencias con Twitch que condicionan el diseno:
 *
 *  1. Hay que traducir el nombre del canal a un id de sala, y ese endpoint de
 *     Kick no manda cabeceras CORS: el navegador no puede pedirlo. Por eso la
 *     traduccion la hace el editor contra nuestra function y el id queda
 *     guardado en el preset (`kickChatroomId`), asi el overlay no depende de
 *     nada en tiempo real.
 *  2. La clave de Pusher es la que Kick publica en su propio frontend. Es la
 *     via que usan todos los overlays de Kick, pero no esta documentada: si
 *     algun dia la rotan, hay que actualizarla aca.
 */

const PUSHER_KEY = '32cbd69e4b950bf97679'
const PUSHER_URL = `wss://ws-us2.pusher.com/app/${PUSHER_KEY}?protocol=7&client=js&version=8.4.0&flash=false`
const EMOTE_CDN = 'https://files.kick.com/emotes'

export type KickStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface KickChatHandlers {
  onMessage: (message: ChatMessage) => void
  onStatus: (status: KickStatus, detail?: string) => void
}

/** Insignias de Kick traducidas a las que sabemos dibujar. */
const BADGE_MAP: Record<string, BadgeId> = {
  broadcaster: 'broadcaster',
  moderator: 'mod',
  vip: 'vip',
  subscriber: 'sub',
  founder: 'sub',
  og: 'sub',
  sub_gifter: 'sub',
  verified: 'staff',
  staff: 'staff',
  trainwreckstv: 'staff',
}

export function kickEmoteUrl(id: string): string {
  return `${EMOTE_CDN}/${id}/fullsize`
}

interface KickBadge {
  type?: string
}

interface KickPayload {
  id?: string
  content?: string
  type?: string
  created_at?: string
  sender?: {
    username?: string
    slug?: string
    identity?: {
      color?: string
      badges?: KickBadge[]
    }
  }
}

/**
 * Parte el contenido en texto y emotes.
 *
 * Kick los deja escritos dentro del propio mensaje como `[emote:123:nombre]`,
 * asi que alcanza con una expresion regular. Mas simple que Twitch, que manda
 * las posiciones por separado.
 */
export function buildKickSegments(content: string): MessageSegment[] {
  const pattern = /\[emote:(\d+):([^\]]*)\]/g
  const segments: MessageSegment[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: content.slice(cursor, match.index) })
    }
    segments.push({ type: 'emote', url: kickEmoteUrl(match[1]), name: match[2] || 'emote' })
    cursor = match.index + match[0].length
  }

  if (cursor < content.length) segments.push({ type: 'text', value: content.slice(cursor) })
  return segments.length ? segments : [{ type: 'text', value: content }]
}

/** Texto plano, con los emotes reducidos a su nombre. */
function plainText(content: string): string {
  return content.replace(/\[emote:\d+:([^\]]*)\]/g, '$1')
}

function parseBadges(badges: KickBadge[] | undefined): BadgeId[] {
  const out: BadgeId[] = []
  for (const badge of badges ?? []) {
    const mapped = badge.type ? BADGE_MAP[badge.type] : undefined
    if (mapped && !out.includes(mapped)) out.push(mapped)
  }
  return out
}

function toMessage(payload: KickPayload): ChatMessage | null {
  const content = payload.content
  if (typeof content !== 'string') return null

  const user = payload.sender?.username?.trim() || payload.sender?.slug || 'usuario'
  const segments = buildKickSegments(content)

  return {
    id: payload.id || `kick${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user,
    text: plainText(content),
    // Kick siempre manda un color elegido, sin el "sin color" de Twitch.
    color: payload.sender?.identity?.color || '#53FC18',
    badges: parseBadges(payload.sender?.identity?.badges),
    createdAt: payload.created_at ? Date.parse(payload.created_at) || Date.now() : Date.now(),
    segments: segments.some((s) => s.type === 'emote') ? segments : undefined,
    platform: 'kick',
  }
}

/**
 * Abre la conexion y devuelve una funcion para cerrarla.
 * Reconecta sola con espera creciente si se cae.
 */
export function connectKickChat(chatroomId: string, handlers: KickChatHandlers): () => void {
  const room = chatroomId.trim()
  if (!room) {
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
      ws = new WebSocket(PUSHER_URL)
    } catch {
      handlers.onStatus('error', 'No se pudo abrir la conexion.')
      return
    }
    socket = ws

    ws.onmessage = (event) => {
      let frame: { event?: string; data?: unknown; channel?: string }
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }

      if (frame.event === 'pusher:connection_established') {
        // `auth` vacio: el canal del chat es publico y no pide firma.
        ws.send(
          JSON.stringify({
            event: 'pusher:subscribe',
            data: { auth: '', channel: `chatrooms.${room}.v2` },
          }),
        )
        return
      }

      if (frame.event === 'pusher_internal:subscription_succeeded') {
        retries = 0
        handlers.onStatus('connected')
        return
      }

      // Pusher pide latido cada tanto y corta si no se contesta.
      if (frame.event === 'pusher:ping') {
        ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }))
        return
      }

      if (frame.event === 'pusher:error') {
        handlers.onStatus('error', 'Kick rechazo la conexion.')
        return
      }

      if (!String(frame.event ?? '').includes('ChatMessageEvent')) return

      let payload: KickPayload
      try {
        payload = typeof frame.data === 'string' ? JSON.parse(frame.data) : (frame.data as KickPayload)
      } catch {
        return
      }

      const message = toMessage(payload)
      if (message) handlers.onMessage(message)
    }

    ws.onerror = () => {
      if (!disposed) handlers.onStatus('error', 'Se corto la conexion con Kick.')
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
