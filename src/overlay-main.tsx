import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import OverlayPage from './pages/OverlayPage'
import './styles/overlay.css'

/**
 * Entrada propia para la página que consume OBS. No comparte bundle con el
 * editor ni carga sus estilos: sólo el chat sobre fondo transparente.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayPage />
  </StrictMode>,
)
