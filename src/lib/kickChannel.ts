/**
 * Traduce el nombre de un canal de Kick a su id de sala de chat.
 *
 * Pasa por nuestra function porque el endpoint de Kick no manda cabeceras CORS
 * y el navegador no puede pedirlo directo. Se usa una sola vez, desde el
 * editor: el id queda guardado en el preset y el overlay ya no necesita esto.
 */

export interface KickChannelInfo {
  slug: string
  displayName: string
  chatroomId: string
  live: boolean
  /** Insignias de sub propias del canal, de menor a mayor antiguedad. */
  subscriberBadges?: { months: number; src: string }[]
}

export interface KickChannelError {
  error: string
  /** true cuando puede ser la proteccion anti-bots de Kick, no un typo. */
  blocked?: boolean
}

export async function resolveKickChannel(
  slug: string,
): Promise<KickChannelInfo | KickChannelError> {
  const clean = slug.trim().toLowerCase().replace(/^.*kick\.com\//, '').replace(/\/.*$/, '')
  if (!clean) return { error: 'Escribí el nombre del canal.' }

  try {
    const res = await fetch(`/api/kick/${encodeURIComponent(clean)}`, {
      credentials: 'same-origin',
    })
    const data = await res.json()

    if (!res.ok || data?.error) {
      return { error: String(data?.error ?? `Error ${res.status}.`), blocked: data?.blocked }
    }
    return data as KickChannelInfo
  } catch {
    // Sin backend (por ejemplo con `npm run dev`) Vite devuelve el index.html.
    return {
      error: 'Esto necesita el backend, así que sólo anda en el sitio publicado.',
      blocked: true,
    }
  }
}
