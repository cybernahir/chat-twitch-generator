import { useEffect, useRef, useState } from 'react'
import { RANDOM_MESSAGES, RANDOM_USERS, TWITCH_COLORS } from '../defaults'
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

/**
 * Motor del chat simulado. Devuelve la lista visible de mensajes, que se recorta
 * a `maxMessages` y opcionalmente se descarta tras `fadeOutAfter` segundos.
 */
export function useChatFeed(config: ChatConfig, running = true) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const scriptIndex = useRef(0)
  const timer = useRef<number | null>(null)

  const {
    source, script, loopScript, messageInterval, intervalJitter,
    maxMessages, fadeOutAfter,
  } = config

  // Al cambiar la fuente de contenido arrancamos de cero.
  useEffect(() => {
    scriptIndex.current = 0
    setMessages([])
  }, [source, script, loopScript])

  useEffect(() => {
    if (!running) return

    let cancelled = false

    const push = () => {
      if (cancelled) return

      let next: ChatMessage | null = null

      if (source === 'script') {
        const lines = script.filter((l) => l.text.trim() || l.user.trim())
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
        setMessages((prev) => [...prev, msg].slice(-Math.max(1, maxMessages)))
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
  }, [running, source, script, loopScript, messageInterval, intervalJitter, maxMessages])

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

  return messages
}
