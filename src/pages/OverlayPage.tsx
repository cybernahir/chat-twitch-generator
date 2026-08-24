import { useEffect, useMemo, useRef, useState } from 'react'
import ChatOverlay from '../components/ChatOverlay'
import { DEFAULT_CONFIG } from '../defaults'
import { decodeConfig } from '../lib/encode'
import { useChatFeed } from '../lib/useChatFeed'
import type { ChatConfig } from '../types'

/**
 * La configuración llega de dos formas, siempre por el hash (que nunca viaja
 * al servidor):
 *
 *   #p=<id>  link corto atado a un preset guardado. Es el recomendado: no
 *            cambia al editar, la fuente propia no viaja en la URL y los
 *            cambios se aplican solos sin tocar OBS.
 *   #c=<b64> configuración entera embebida. Sirve sin backend y mantiene
 *            andando los links viejos, pero es una foto fija.
 */
function readHash(): { presetId: string | null; encoded: string | null } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return { presetId: params.get('p'), encoded: params.get('c') }
}

/**
 * Ritmo del sondeo.
 *
 * Netlify no sostiene conexiones persistentes, así que no hay push: el overlay
 * pregunta. Para que se sienta en vivo sin gastar invocaciones toda la
 * transmisión, el ritmo se adapta: cuando llega un cambio se asume que la
 * streamer está retocando y se consulta seguido; si se queda quieta, afloja.
 */
const FAST_MS = 2000
const SLOW_MS = 15000
const FAST_WINDOW_MS = 120000

export default function OverlayPage() {
  const [hash, setHash] = useState(readHash)
  const [fetched, setFetched] = useState<ChatConfig | null>(null)
  const [failed, setFailed] = useState(false)

  const etag = useRef<string | null>(null)
  const lastUpdatedAt = useRef<number | null>(null)
  const lastChange = useRef(0)

  // El sondeo lee la config por ref para no reiniciarse a cada cambio.
  const fetchedRef = useRef<ChatConfig | null>(null)
  fetchedRef.current = fetched

  useEffect(() => {
    const onHashChange = () => {
      etag.current = null
      setHash(readHash())
      setFetched(null)
      setFailed(false)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.body.classList.add('overlay-mode')
    return () => document.body.classList.remove('overlay-mode')
  }, [])

  // Link corto: primera carga y luego seguimiento de los cambios guardados.
  const presetId = hash.presetId
  useEffect(() => {
    if (!presetId) return

    let cancelled = false
    let timer: number | null = null

    const poll = async () => {
      if (cancelled) return

      try {
        const res = await fetch(`/api/preset/${encodeURIComponent(presetId)}`, {
          headers: etag.current ? { 'If-None-Match': etag.current } : undefined,
        })

        if (res.status === 404) {
          if (!cancelled) setFailed(true)
        } else if (res.ok) {
          const data = (await res.json()) as {
            config?: Partial<ChatConfig>
            updatedAt?: number
          }
          etag.current = res.headers.get('etag')

          // Comparamos por `updatedAt` y no solo por el 304: si algun dia el
          // ETag no llega, esto igual evita quedarse en modo rapido para siempre.
          const stamp = data.updatedAt ?? null
          if (stamp === null || stamp !== lastUpdatedAt.current) {
            lastUpdatedAt.current = stamp
            lastChange.current = Date.now()
            if (!cancelled) {
              setFetched({ ...DEFAULT_CONFIG, ...(data.config ?? {}), v: 1 })
              setFailed(false)
            }
          }
        }
        // Un 304 significa "sin novedades": no tocamos nada y el chat sigue.
      } catch {
        // Un corte de red no tiene que tumbar el overlay: se reintenta solo.
        if (!cancelled && fetchedRef.current === null) setFailed(true)
      }

      if (cancelled) return

      // Con la sincronizacion apagada nos quedamos con lo que cargo al principio.
      if (fetchedRef.current && !fetchedRef.current.liveSync) return

      const recent = Date.now() - lastChange.current < FAST_WINDOW_MS
      timer = window.setTimeout(poll, recent ? FAST_MS : SLOW_MS)
    }

    void poll()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [presetId])

  const config = useMemo(
    () => (presetId ? (fetched ?? DEFAULT_CONFIG) : decodeConfig(hash.encoded)),
    [presetId, hash.encoded, fetched],
  )

  // Mientras no tengamos el preset no arrancamos el chat: si no, en OBS se ve
  // un instante del estilo por defecto antes de aplicar el bueno.
  const ready = !presetId || fetched !== null
  const { messages } = useChatFeed(config, ready)

  if (presetId && failed) {
    // En OBS esto no se ve (fondo transparente), pero al abrir el link en el
    // navegador explica que pasó en vez de mostrar una pantalla vacía.
    return (
      <p className="overlay-error">
        No se encontró ese preset. Puede que lo hayas borrado, o que estés abriendo el link sin el
        sitio publicado.
      </p>
    )
  }

  if (!ready) return null

  return <ChatOverlay config={config} messages={messages} />
}
