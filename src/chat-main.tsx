import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ChatPage from './pages/ChatPage'
import './styles/chat.css'

/**
 * Entrada propia para la pantalla de lectura del chat. Igual que el overlay,
 * es una página aparte del editor: así queda fuera del login y se puede abrir
 * en cualquier monitor sin tener que pasar por la contraseña.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatPage />
  </StrictMode>,
)
