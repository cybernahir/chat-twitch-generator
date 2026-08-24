import { useEffect, useMemo, useState } from 'react'
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
 *            cambia al editar y la fuente propia no viaja en la URL.
 *   #c=<b64> configuración entera embebida. Sirve sin backend y mantiene
 *            andando los links viejos.
 */
function readHash(): { presetId: string | null; encoded: string | null } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return { presetId: params.get('p'), encoded: params.get('c') }
}

export default function OverlayPage() {
  const [hash, setHash] = useState(readHash)
  const [fetched, setFetched] = useState<ChatConfig | null>(null)
  const [failed, setFailed] = useState(false)

  // Si cambiás la URL de la fuente de navegador sin recargarla, se reconfigura solo.
  useEffect(() => {
    const onHashChange = () => {
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

  // Link corto: buscamos el preset en el servidor.
  useEffect(() => {
    if (!hash.presetId) return
    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(`/api/preset/${encodeURIComponent(hash.presetId!)}`)
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { config?: Partial<ChatConfig> }
        if (cancelled) return
        setFetched({ ...DEFAULT_CONFIG, ...(data.config ?? {}), v: 1 })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hash.presetId])

  const config = useMemo(
    () => (hash.presetId ? (fetched ?? DEFAULT_CONFIG) : decodeConfig(hash.encoded)),
    [hash, fetched],
  )

  // Mientras no tengamos el preset no arrancamos el chat: si no, en OBS se ve
  // un instante del estilo por defecto antes de aplicar el bueno.
  const ready = !hash.presetId || fetched !== null
  const { messages } = useChatFeed(config, ready)

  if (hash.presetId && failed) {
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
