import { DEFAULT_CONFIG } from '../defaults'
import type { ChatConfig } from '../types'

/** base64url sobre UTF-8, apto para meter en la URL. */
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodeConfig(config: ChatConfig): string {
  return toBase64Url(JSON.stringify(config))
}

export function decodeConfig(raw: string | null): ChatConfig {
  if (!raw) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as Partial<ChatConfig>
    // Merge contra los defaults para tolerar links viejos a los que les falten campos.
    return { ...DEFAULT_CONFIG, ...parsed, v: 1 }
  } catch {
    console.warn('[chat-generator] No se pudo leer la config de la URL, uso los valores por defecto.')
    return DEFAULT_CONFIG
  }
}

/**
 * Arma la URL del overlay.
 *
 * `overlay.html` es una página aparte y pública a propósito: OBS no puede pasar
 * por el login, y el gate del editor sólo cubre la raíz del sitio. La config
 * viaja en el hash, así que no llega al servidor ni tiene el límite de longitud
 * de un query string normal.
 */
export function buildOverlayUrl(config: ChatConfig, origin = window.location.origin): string {
  // Soporta que el sitio esté servido desde un subdirectorio.
  const dir = window.location.pathname.replace(/\/[^/]*$/, '')
  return `${origin}${dir}/overlay.html#c=${encodeConfig(config)}`
}
