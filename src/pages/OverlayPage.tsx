import { useEffect, useMemo, useState } from 'react'
import ChatOverlay from '../components/ChatOverlay'
import { decodeConfig } from '../lib/encode'
import { useChatFeed } from '../lib/useChatFeed'

/** La config viaja en el hash (`overlay.html#c=…`), así que nunca llega al servidor. */
function readConfigParam(): string | null {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('c')
}

/**
 * Página que se pone en OBS como Browser Source.
 * No necesita backend, sesión ni storage: todo está en la URL.
 */
export default function OverlayPage() {
  const [raw, setRaw] = useState<string | null>(readConfigParam)

  // Si cambiás la URL de la fuente de navegador sin recargarla, se reconfigura solo.
  useEffect(() => {
    const onHashChange = () => setRaw(readConfigParam())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const config = useMemo(() => decodeConfig(raw), [raw])
  const messages = useChatFeed(config)

  useEffect(() => {
    document.body.classList.add('overlay-mode')
    return () => document.body.classList.remove('overlay-mode')
  }, [])

  return <ChatOverlay config={config} messages={messages} />
}
