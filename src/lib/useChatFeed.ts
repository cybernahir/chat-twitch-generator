import { useCallback, useEffect, useRef, useState } from 'react'
import { RANDOM_MESSAGES, RANDOM_USERS, TWITCH_COLORS } from '../defaults'
import { connectKickChat } from './kickChat'
import type { KickStatus } from './kickChat'
import { connectTwitchChat } from './twitchChat'
import type { TwitchStatus } from './twitchChat'
import type { BadgeId, ChatConfig, ChatMessage, ChatRemoval, Platform } from '../types'

const BADGE_POOL: BadgeId[][] = [
  [], [], [], [], [],
  ['sub'], ['sub'], ['prime'], ['mod'], ['vip'], ['turbo'],
  ['mod', 'sub'], ['vip', 'sub'], ['broadcaster'],
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Color estable por usuario, igual que hace Twitch con los usuarios sin color. */
function colorFor(user: string): string {
  let hash = 0
  for (let i = 0; i < user.length; i++) hash = (hash * 31 + user.charCodeAt(i)) >>> 0
  return TWITCH_COLORS[hash % TWITCH_COLORS.length]
}

let counter = 0
function nextId(): string {
  counter += 1
  return `m${Date.now().toString(36)}-${counter}`
}

function randomMessage(): ChatMessage {
  const user = pick(RANDOM_USERS)
  return {
    id: nextId(),
    user,
    text: pick(RANDOM_MESSAGES),
    color: colorFor(user),
    badges: pick(BADGE_POOL),
    createdAt: Date.now(),
  }
}

function parseBlocked(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export interface ChatFeed {
  messages: ChatMessage[]
  /**
   * Vacía la lista en pantalla.
   *
   * Sólo eso: no borra nada en Twitch ni en Kick, que además no se puede
   * hacer leyendo de forma anónima. Los mensajes que lleguen después entran
   * normalmente.
   */
  clear: () => void
  twitchStatus: TwitchStatus
  twitchDetail?: string
  kickStatus: KickStatus
  kickDetail?: string
  /** Id del canal de Twitch conectado, sacado del ROOMSTATE. */
  twitchRoomId: string | null
}

export interface ChatFeedOptions {
  /**
   * Dejar los mensajes moderados en la lista, marcados, en vez de sacarlos.
   *
   * Apagado por defecto: el overlay tiene que sacarlos. Lo prende la pantalla
   * de lectura, donde tacharlos es mejor que hacerlos desaparecer sin aviso.
   */
  keepDeleted?: boolean
  /**
   * Intercalar los avisos de suscripción en la lista.
   *
   * Apagado por defecto: el overlay muestra sólo mensajes y nadie pidió
   * cambiarlo. Lo prende la pantalla de lectura, donde ver que alguien renovó
   * —y con qué racha, si la compartió— es parte de seguir el chat.
   */
  showNotices?: boolean
}

/**
 * Motor del chat. Sirve las tres fuentes: mensajes al azar, un guion propio o
 * el chat en vivo, que puede ser de Twitch, de Kick o de las dos a la vez
 * mezcladas en una sola lista.
 *
 * La lista visible se recorta a `maxMessages` y opcionalmente se descarta lo
 * que pase de `fadeOutAfter` segundos.
 */
export function useChatFeed(
  config: ChatConfig,
  running = true,
  { keepDeleted = false, showNotices = false }: ChatFeedOptions = {},
): ChatFeed {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [twitchStatus, setTwitchStatus] = useState<TwitchStatus>('idle')
  const [twitchDetail, setTwitchDetail] = useState<string | undefined>()
  const [twitchRoomId, setTwitchRoomId] = useState<string | null>(null)
  const [kickStatus, setKickStatus] = useState<KickStatus>('idle')
  const [kickDetail, setKickDetail] = useState<string | undefined>()
  const scriptIndex = useRef(0)
  const timer = useRef<number | null>(null)

  const {
    source, script, loopScript, messageInterval, intervalJitter,
    maxMessages, fadeOutAfter, twitchChannel, kickChatroomId, hideCommands, blockedUsers,
  } = config

  const live = source === 'live'

  // Los filtros van por ref para que cambiarlos no reabra las conexiones.
  const filters = useRef({ maxMessages, hideCommands, blockedUsers })
  filters.current = { maxMessages, hideCommands, blockedUsers }

  // Y el guion tambien, para poder leerlo sin meterlo en las dependencias.
  const scriptRef = useRef(script)
  scriptRef.current = script

  /**
   * Clave por *valor* de lo que define el contenido del chat.
   *
   * Va serializada a proposito: `script` es un array, y con actualizacion en
   * vivo llega una referencia nueva en cada refresco aunque el contenido sea
   * identico. Si dependieramos de la referencia, el chat se vaciaria solo cada
   * vez que la streamer toca un color.
   */
  const contentKey =
    source === 'script'
      ? `script:${loopScript}:${JSON.stringify(script)}`
      : live
        ? `live:${twitchChannel.trim().toLowerCase()}:${kickChatroomId.trim()}`
        : 'random'

  // Al cambiar de verdad la fuente de contenido, arrancamos de cero.
  useEffect(() => {
    scriptIndex.current = 0
    setMessages([])
  }, [contentKey])

  /**
   * Entrada comun para los dos chats en vivo. Los filtros y el recorte son los
   * mismos vengan de donde vengan, asi que la mezcla es simplemente ir
   * agregando al final: cada mensaje llega cuando llega.
   */
  const accept = useCallback((message: ChatMessage) => {
    const { maxMessages: cap, hideCommands: hide, blockedUsers: blocked } = filters.current

    if (hide && message.text.trim().startsWith('!')) return
    if (parseBlocked(blocked).includes(message.user.toLowerCase())) return

    setMessages((prev) => [...prev, message].slice(-Math.max(1, cap)))
  }, [])

  /**
   * Entrada de los avisos de suscripción.
   *
   * Va aparte de `accept` por el filtro de comandos: un aviso no empieza con
   * `!` pero el mensaje que la persona escribe al renovar podría, y eso no es
   * un comando de bot. El filtro de usuarios ocultos sí se respeta.
   */
  const acceptNotice = useCallback((message: ChatMessage) => {
    const { maxMessages: cap, blockedUsers: blocked } = filters.current
    if (parseBlocked(blocked).includes(message.user.toLowerCase())) return
    setMessages((prev) => [...prev, message].slice(-Math.max(1, cap)))
  }, [])

  /**
   * ¿Este mensaje entra en lo que se borró?
   *
   * Se usa para las dos formas de reaccionar —sacarlo o tacharlo— así que la
   * regla vive en un solo lugar.
   */
  const alcanzado = (m: ChatMessage, platform: Platform, removal: ChatRemoval): boolean => {
    if (m.platform !== platform) return false
    if (removal.type === 'all') return true
    if (removal.type === 'message') return m.id === removal.id
    // Baneo o timeout: por id, que es lo exacto. El login sirve de respaldo
    // para los mensajes que ya estaban en pantalla sin id guardado.
    if (removal.userId && m.userId) return m.userId === removal.userId
    return Boolean(removal.login) && m.user.toLowerCase() === removal.login!.toLowerCase()
  }

  /**
   * Moderacion: refleja lo que borraron en la plataforma.
   *
   * Solo toca los mensajes de la plataforma que aviso. Con las dos fuentes
   * mezcladas, un /clear en Twitch no tiene por que llevarse el chat de Kick.
   *
   * Que pasa despues depende de `keepDeleted`, y la diferencia importa:
   *
   *  - En el overlay se **sacan**. Si un mod borro algo porque no queria que se
   *    viera, dejarlo en la transmision es justo lo que se estaba evitando.
   *  - En la pantalla de lectura se **tachan**. Ahi no lo ve nadie mas que
   *    quien lee, y enterarse de que algo se borro es parte de seguir el chat.
   */
  const removeFrom = useCallback(
    (platform: Platform, removal: ChatRemoval) => {
      setMessages((prev) => {
        if (!keepDeleted) {
          const kept = prev.filter((m) => !alcanzado(m, platform, removal))
          return kept.length === prev.length ? prev : kept
        }

        let cambio = false
        const next = prev.map((m) => {
          // Ya tachado: no se vuelve a marcar, asi no se pierde quien fue el
          // primero en borrarlo.
          if (m.deleted || !alcanzado(m, platform, removal)) return m
          cambio = true
          return { ...m, deleted: { by: removal.by, scope: removal.type } }
        })
        return cambio ? next : prev
      })
    },
    [keepDeleted],
  )

  /* ---------------------- chat real de Twitch ---------------------- */

  useEffect(() => {
    // El id viejo es de otro canal: se descarta antes de reconectar.
    setTwitchRoomId(null)

    if (!live || !running || !twitchChannel.trim()) {
      setTwitchStatus('idle')
      return
    }

    return connectTwitchChat(twitchChannel, {
      onStatus: (status, detail) => {
        setTwitchStatus(status)
        setTwitchDetail(detail)
      },
      onMessage: accept,
      onNotice: showNotices ? acceptNotice : undefined,
      onRoomId: setTwitchRoomId,
      onRemove: (removal) => removeFrom('twitch', removal),
    })
  }, [live, running, twitchChannel, accept, acceptNotice, showNotices, removeFrom])

  /* ---------------------- chat real de Kick ---------------------- */

  useEffect(() => {
    if (!live || !running || !kickChatroomId.trim()) {
      setKickStatus('idle')
      return
    }

    return connectKickChat(kickChatroomId, {
      onStatus: (status, detail) => {
        setKickStatus(status)
        setKickDetail(detail)
      },
      onMessage: accept,
      onNotice: showNotices ? acceptNotice : undefined,
      onRemove: (removal) => removeFrom('kick', removal),
    })
  }, [live, running, kickChatroomId, accept, acceptNotice, showNotices, removeFrom])

  /* ---------------------- simulacion ---------------------- */

  useEffect(() => {
    if (!running || live) return

    let cancelled = false

    const push = () => {
      if (cancelled) return

      let next: ChatMessage | null = null

      if (source === 'script') {
        const lines = scriptRef.current.filter((l) => l.text.trim() || l.user.trim())
        if (lines.length) {
          if (scriptIndex.current >= lines.length) {
            if (!loopScript) return
            scriptIndex.current = 0
          }
          const line = lines[scriptIndex.current]
          scriptIndex.current += 1
          next = {
            id: nextId(),
            user: line.user || 'usuario',
            text: line.text,
            color: line.color || colorFor(line.user || 'usuario'),
            badges: line.badges ?? [],
            createdAt: Date.now(),
          }
        }
      } else {
        next = randomMessage()
      }

      if (next) {
        const msg = next
        const cap = Math.max(1, filters.current.maxMessages)
        setMessages((prev) => [...prev, msg].slice(-cap))
      }

      const jitter = (messageInterval * intervalJitter) / 100
      const delay = Math.max(150, messageInterval - jitter / 2 + Math.random() * jitter)
      timer.current = window.setTimeout(push, delay)
    }

    // Primer mensaje casi inmediato para que la preview no arranque vacía.
    timer.current = window.setTimeout(push, 200)

    return () => {
      cancelled = true
      if (timer.current) window.clearTimeout(timer.current)
    }
    // `maxMessages` sale por ref: recortar la lista no tiene por que reiniciar
    // el temporizador mientras se arrastra el slider.
  }, [running, live, source, contentKey, messageInterval, intervalJitter])

  // Recorte por cantidad cuando se baja el tope estando ya lleno.
  useEffect(() => {
    setMessages((prev) =>
      prev.length > maxMessages ? prev.slice(-Math.max(1, maxMessages)) : prev,
    )
  }, [maxMessages])

  // Expiración por tiempo.
  useEffect(() => {
    if (!fadeOutAfter) return
    const id = window.setInterval(() => {
      const cutoff = Date.now() - fadeOutAfter * 1000
      setMessages((prev) => {
        const kept = prev.filter((m) => m.createdAt > cutoff)
        return kept.length === prev.length ? prev : kept
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [fadeOutAfter])

  const clear = useCallback(() => setMessages([]), [])

  return { messages, clear, twitchStatus, twitchDetail, kickStatus, kickDetail, twitchRoomId }
}
