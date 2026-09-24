import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChatList from '../components/ChatList'
import { DEFAULT_CONFIG } from '../defaults'
import { HISTORY_MAX, clearHistory, loadHistory, saveHistory } from '../lib/chatHistory'
import { useChatFeed } from '../lib/useChatFeed'
import type { ChatConfig, ChatMessage } from '../types'
import '../styles/chat.css'

/**
 * Pantalla para *leer* el chat, no para transmitirlo.
 *
 * Es otra cosa que el overlay: allá el chat tiene que quedar bien sobre la
 * escena y desaparecer; acá tiene que leerse cómodo en un monitor al costado,
 * durante horas. Por eso no comparte nada de su diseño y trae el suyo, pensado
 * para contraste y tamaño.
 *
 * El canal va fijo acá adentro, a propósito: esta pantalla es para un solo
 * chat. Nada de presets ni de parámetros en la URL — se abre `/chat` y anda.
 */

const CANAL_TWITCH = 'cybernahir'
const CANAL_KICK = 'cybernahir'

/**
 * Sala de chat de Kick, resuelta una vez y anotada acá.
 *
 * Kick no deja que el navegador traduzca el nombre del canal a este número
 * (su endpoint no manda cabeceras CORS), así que o se pasa por el servidor en
 * cada carga o se deja escrito. Con el canal fijo, escribirlo es lo simple.
 */
const SALA_KICK = '80446367'

const SIZE_KEY = 'chat-reader:size'
const MIN_SIZE = 14
const MAX_SIZE = 34

export default function ChatPage() {
  const [badgeImages, setBadgeImages] = useState<Record<string, string> | undefined>()

  const [size, setSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(SIZE_KEY))
      if (Number.isFinite(saved) && saved >= MIN_SIZE && saved <= MAX_SIZE) return saved
    } catch {
      /* navegación privada o cookies bloqueadas: se usa el tamaño de fábrica */
    }
    return 19
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, String(size))
    } catch {
      /* no pasa nada: es sólo una comodidad */
    }
  }, [size])

  /**
   * Arte real de las insignias del canal.
   *
   * Sin esto se dibujan los iconos vectoriales de respaldo, que sirven para
   * distinguir un mod de un sub pero no son las insignias del canal. Va por
   * una function propia porque la del editor pide sesión y esta pantalla es
   * pública.
   *
   * Si falla no se muestra ningún error: el chat se lee igual, sólo que con
   * los iconos genéricos.
   */
  useEffect(() => {
    let cancelled = false

    void fetch(`/api/chat-badges?twitch=${CANAL_TWITCH}&kick=${CANAL_KICK}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { images?: Record<string, string> } | null) => {
        if (cancelled || !data?.images) return
        if (Object.keys(data.images).length) setBadgeImages(data.images)
      })
      .catch(() => {
        /* sin backend o sin red: quedan los iconos de respaldo */
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Se parte de los valores por defecto y se pisa lo que importa acá.
   *
   * `source` va en `live` y el tope de mensajes sube bastante: el overlay
   * muestra los últimos y esto es para leer, con la posibilidad de subir un
   * poco. `fadeOutAfter` en cero para que nada se borre solo.
   */
  const config = useMemo<ChatConfig>(
    () => ({
      ...DEFAULT_CONFIG,
      source: 'live',
      maxMessages: HISTORY_MAX,
      fadeOutAfter: 0,
      twitchChannel: CANAL_TWITCH,
      kickChannel: CANAL_KICK,
      kickChatroomId: SALA_KICK,
      badgeImages,
    }),
    [badgeImages],
  )

  // `keepDeleted`: acá los mensajes moderados se tachan en vez de irse. El
  // overlay hace lo contrario, y tiene que seguir haciéndolo.
  const { messages, clear, twitchStatus, kickStatus } = useChatFeed(config, true, {
    keepDeleted: true,
  })

  /* ---------------------- historial ---------------------- */

  // Lo que había antes de recargar. Se lee una sola vez, al montar.
  const [previos, setPrevios] = useState<ChatMessage[]>(() => loadHistory())

  /**
   * Lo de antes y lo que va llegando, en una sola lista.
   *
   * Ni Twitch ni Kick reenvían lo ya dicho al conectarse, así que no hay
   * solapamiento real; el descarte por id está igual por las dudas, para el
   * caso de recargar dos veces seguidas muy rápido.
   */
  const visibles = useMemo(() => {
    if (!previos.length) return messages
    const vistos = new Set(messages.map((m) => m.id))
    return [...previos.filter((m) => !vistos.has(m.id)), ...messages].slice(-HISTORY_MAX)
  }, [previos, messages])

  /**
   * Guardado espaciado.
   *
   * Escribir en cada mensaje sería una escritura a disco por mensaje durante
   * horas. Con un intervalo alcanza, porque el caso que importa —recargar o
   * cerrar— lo cubre `pagehide`, que corre justo antes de irse.
   */
  const pendiente = useRef<ChatMessage[] | null>(null)
  pendiente.current = visibles

  useEffect(() => {
    const guardar = () => {
      if (pendiente.current) saveHistory(pendiente.current)
    }

    const id = window.setInterval(guardar, 5000)
    window.addEventListener('pagehide', guardar)

    return () => {
      window.clearInterval(id)
      window.removeEventListener('pagehide', guardar)
      guardar()
    }
  }, [])

  /* ---------------------- limpiar ---------------------- */

  /**
   * Vacía **esta pantalla** y lo que tenía guardado. Nada más.
   *
   * No borra nada en Twitch ni en Kick —leyendo de forma anónima ni siquiera
   * se podría— y no le cambia nada a quien esté mirando el stream. Los
   * mensajes que lleguen después entran normalmente.
   */
  const [confirmando, setConfirmando] = useState(false)

  // El pedido de confirmación se cae solo: si fue un toque sin querer, el
  // botón vuelve a su lugar y no queda una pantalla esperando respuesta.
  useEffect(() => {
    if (!confirmando) return
    const id = window.setTimeout(() => setConfirmando(false), 3000)
    return () => window.clearTimeout(id)
  }, [confirmando])

  const limpiar = () => {
    if (!confirmando) {
      setConfirmando(true)
      return
    }
    setConfirmando(false)
    setPrevios([])
    clear()
    clearHistory()
  }

  /* ---------------------- seguir el fondo ---------------------- */

  const listRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  // Pegado al fondo mientras no se haya subido a releer. Si se subió, los
  // mensajes nuevos no tienen por qué arrastrar la lectura.
  useEffect(() => {
    if (!pinned) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visibles, pinned])

  const onScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48)
  }, [])

  const toBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
    setPinned(true)
  }

  /* ---------------------- estado ---------------------- */

  // Una luz por plataforma: con las dos mezcladas, un "conectado" a secas
  // taparía que una de las dos se cayó y faltan la mitad de los mensajes.
  const luces = [
    { nombre: 'Twitch', estado: twitchStatus },
    { nombre: 'Kick', estado: kickStatus },
  ]

  const ESTADO_TEXTO: Record<string, string> = {
    idle: 'sin conectar',
    connecting: 'conectando',
    connected: 'conectado',
    reconnecting: 'reconectando',
    error: 'sin conexión',
  }

  const ninguna = twitchStatus !== 'connected' && kickStatus !== 'connected'

  return (
    <div className="cr">
      <header className="cr-head">
        <h1>Chat</h1>

        {/* Sólo las luces, sin texto: el nombre de cada plataforma ya lo dice
            el icono de cada mensaje. Queda el título para el que pase el mouse
            y quiera saber cuál se cayó. */}
        <div className="cr-status-group">
          {luces.map(({ nombre, estado }) => (
            <span
              key={nombre}
              className={`cr-status is-${estado}`}
              title={`${nombre}: ${ESTADO_TEXTO[estado]}`}
            >
              <i />
              <span className="sr-only">{`${nombre}: ${ESTADO_TEXTO[estado]}`}</span>
            </span>
          ))}
        </div>

        <div className="cr-size" role="group" aria-label="Tamaño del texto">
          <button
            type="button"
            onClick={() => setSize((s) => Math.max(MIN_SIZE, s - 1))}
            disabled={size <= MIN_SIZE}
            aria-label="Achicar el texto"
          >
            A−
          </button>
          <button
            type="button"
            onClick={() => setSize((s) => Math.min(MAX_SIZE, s + 1))}
            disabled={size >= MAX_SIZE}
            aria-label="Agrandar el texto"
          >
            A+
          </button>
        </div>

        <button
          type="button"
          className={`cr-clear ${confirmando ? 'is-asking' : ''}`}
          onClick={limpiar}
          disabled={visibles.length === 0}
          title="Vacía sólo esta pantalla. No toca el chat de Twitch ni el de Kick."
        >
          {confirmando ? '¿Seguro?' : 'Limpiar'}
        </button>
      </header>

      <div className="cr-list" ref={listRef} onScroll={onScroll} style={{ fontSize: size }}>
        {visibles.length === 0 && (
          <p className="cr-note">
            {ninguna ? 'Conectando con el chat…' : 'Conectado. Esperando el primer mensaje…'}
          </p>
        )}

        <ChatList messages={visibles} badgeImages={badgeImages} size={size} showPlatform />
      </div>

      {!pinned && (
        <button type="button" className="cr-jump" onClick={toBottom}>
          Ir a los últimos mensajes
        </button>
      )}
    </div>
  )
}
