import { DEFAULT_CONFIG } from '../defaults'
import type { ChatConfig } from '../types'

/**
 * Deja cualquier configuración guardada lista para usar.
 *
 * Hace dos cosas: completa los campos que falten con los valores por defecto
 * (para presets creados con versiones anteriores) y migra lo que cambió de
 * forma. Todo lo que lee configuración guardada tiene que pasar por acá, así
 * la migración vive en un solo lugar.
 */
export function normalizeConfig(partial: Partial<ChatConfig> | null | undefined): ChatConfig {
  const merged = { ...DEFAULT_CONFIG, ...(partial ?? {}), v: 1 as const }

  // Antes la única fuente en vivo era Twitch y el modo se llamaba así. Ahora
  // el modo es "en vivo" y puede tener Twitch, Kick o las dos a la vez.
  if (merged.source === 'twitch') merged.source = 'live'

  // Antes la marca de origen era un sí/no que dibujaba una barrita de color.
  // Ahora se puede elegir logo, barrita o las dos: quien tenía el sí prendido
  // pasa a la barrita, que es lo que venía viendo.
  const legacy = (partial ?? {}) as { showPlatform?: boolean }
  if (typeof legacy.showPlatform === 'boolean' && partial?.platformMark === undefined) {
    merged.platformMark = legacy.showPlatform ? 'bar' : 'none'
  }

  return merged
}
