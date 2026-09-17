import { useCallback, useEffect, useRef, useState } from 'react'
import { RANDOM_MESSAGES, RANDOM_USERS, TWITCH_COLORS } from '../defaults'
import { connectKickChat } from './kickChat'
import type { KickStatus } from './kickChat'
import { connectTwitchChat } from './twitchChat'
import type { TwitchStatus } from './twitchChat'
import type { BadgeId, ChatConfig, ChatMessage } from '../types'

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
  twitchStatus: TwitchStatus
  twitchDetail?: string
  kickStatus: KickStatus
  kickDetail?: string
}

/**
 * Motor del chat. Sirve las tres fuentes: mensajes al azar, un guion propio o
 * el chat en vivo, que puede ser de Twitch, de Kick o de las dos a la vez
 * mezcladas en una sola lista.
 *
 * La lista visible se recorta a `maxMessages` y opcionalmente se descarta lo
 * que pase de `fadeOutAfter` segundos.
 */
export function useChatFeed(config: ChatConfig, running = true): ChatFeed {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [twitchStatus, setTwitchStatus] = useState<TwitchStatus>('idle')
  const [twitchDetail, setTwitchDetail] = useState<string | undefined>()
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

  /* ---------------------- chat real de Twitch ---------------------- */

  useEffect(() => {
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
    })
  }, [live, running, twitchChannel, accept])

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
    })
  }, [live, running, kickChatroomId, accept])

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

  return { messages, twitchStatus, twitchDetail, kickStatus, kickDetail }
}
