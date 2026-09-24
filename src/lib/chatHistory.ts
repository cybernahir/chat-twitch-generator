import type { ChatMessage } from '../types'

/**
 * Historial de la pantalla de lectura, guardado en el navegador.
 *
 * Sirve para una cosa concreta: que apretar F5 sin querer no se lleve puesto
 * el chat. No es un archivo del chat ni pretende serlo — vive en el navegador
 * que lo abrió y nada más.
 *
 * Sólo lo usa la pantalla de lectura. El overlay de OBS **no** tiene que
 * restaurar nada: al abrirse tiene que estar vacío y llenarse en vivo.
 */

const KEY = 'chat-reader:history'

/**
 * Tope de mensajes, guardados y en pantalla.
 *
 * Medido en el navegador con mensajes con emotes, insignias y respuestas:
 * mil ocupan ~1,3 MB (de los ~5 MB que da `localStorage`), tardan ~4 ms en
 * guardarse y ~3,5 ms en dibujar cada mensaje nuevo. Con 300 alcanzaba para
 * unos pocos minutos de un chat movido, que es poco para poder subir a releer.
 */
export const HISTORY_MAX = 1000

/**
 * Antigüedad máxima de lo que se restaura.
 *
 * Sin esto, abrir la pantalla a la mañana mostraría el chat de anoche arriba de
 * todo y daría la impresión de que hay gente hablando. Ocho horas cubre volver
 * después de un rato largo sin arrastrar la transmisión anterior.
 */
const MAX_AGE_MS = 8 * 60 * 60 * 1000

export function loadHistory(now = Date.now()): ChatMessage[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return (parsed as ChatMessage[])
      .filter((m) => m && typeof m.id === 'string' && typeof m.text === 'string')
      .filter((m) => now - (m.createdAt || 0) < MAX_AGE_MS)
      .slice(-HISTORY_MAX)
  } catch {
    // Sin permiso para leer, o basura guardada por una versión anterior: se
    // arranca de cero, que es exactamente lo que pasaba antes de todo esto.
    return []
  }
}

/** Tira lo guardado. Sólo toca este navegador. */
export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* sin acceso al almacenamiento no hay nada que tirar */
  }
}

export function saveHistory(messages: ChatMessage[]): void {
  const recortado = messages.slice(-HISTORY_MAX)

  try {
    localStorage.setItem(KEY, JSON.stringify(recortado))
  } catch {
    // Lo más probable es que se haya llenado el cupo: un chat con muchos
    // emotes ocupa bastante. Se reintenta con la mitad antes de rendirse, así
    // se conserva algo en vez de nada.
    try {
      localStorage.setItem(KEY, JSON.stringify(recortado.slice(-Math.floor(HISTORY_MAX / 3))))
    } catch {
      /* navegación privada o cupo agotado: el chat anda igual, sin memoria */
    }
  }
}
