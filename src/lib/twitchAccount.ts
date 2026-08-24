/**
 * Vinculacion con la cuenta de Twitch, del lado del navegador.
 *
 * Aca nunca hay tokens: la API devuelve solo el nombre de la cuenta vinculada.
 * El access token y el refresh token viven en el servidor.
 */

export const TWITCH_LOGIN_URL = '/api/twitch/login'

export interface TwitchAccount {
  userId: string
  login: string
  displayName: string
}

export interface TwitchAccountState {
  /** false cuando no hay backend (por ejemplo corriendo `npm run dev`). */
  available: boolean
  /** false cuando falta cargar TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET. */
  configured: boolean
  account: TwitchAccount | null
  error?: string
}

async function callApi(path: string, init?: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', ...init })
    // Sin backend, Vite responde el index.html y el parseo revienta.
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchTwitchStatus(): Promise<TwitchAccountState> {
  const data = await callApi('/api/twitch/status')
  if (!data) return { available: false, configured: false, account: null }

  return {
    available: true,
    configured: Boolean(data.configured),
    account: (data.account as TwitchAccount) ?? null,
    error: data.error,
  }
}

/** Arte real de las insignias del canal vinculado. */
export async function fetchBadgeImages(
  broadcasterId?: string,
): Promise<{ images: Record<string, string> } | { error: string }> {
  const query = broadcasterId ? `?broadcaster_id=${encodeURIComponent(broadcasterId)}` : ''
  const data = await callApi(`/api/twitch/badges${query}`)

  if (!data) return { error: 'No hay backend para pedir las insignias.' }
  if (data.error) return { error: String(data.error) }
  return { images: (data.images ?? {}) as Record<string, string> }
}

export async function unlinkTwitch(): Promise<void> {
  await callApi('/api/twitch/unlink', { method: 'POST' })
}

const RETURN_KEY = 'cg:twitch-return'

/**
 * Manda a Twitch recordando en que preset estabamos: el callback vuelve a la
 * raiz del sitio, y sin esto la streamer perderia de vista lo que editaba.
 */
export function startTwitchLogin(): void {
  try {
    sessionStorage.setItem(RETURN_KEY, window.location.hash || '#/')
  } catch {
    /* si no hay sessionStorage, simplemente vuelve a la biblioteca */
  }
  window.location.href = TWITCH_LOGIN_URL
}

/** Al volver de Twitch, restaura la pantalla anterior y dice como salio. */
export function consumeTwitchReturn(): 'ok' | 'error' | null {
  const match = /[?&]twitch=([^&]+)/.exec(window.location.hash)
  if (!match) return null

  let back = '#/'
  try {
    back = sessionStorage.getItem(RETURN_KEY) || '#/'
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    /* nada que restaurar */
  }

  window.location.replace(back)
  return decodeURIComponent(match[1]) === 'ok' ? 'ok' : 'error'
}
