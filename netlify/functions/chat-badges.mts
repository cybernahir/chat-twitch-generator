/**
 * Insignias del canal, sin login.
 *
 * Existe porque la pantalla de lectura (`/chat.html`) es pública: la abre quien
 * mira el chat, que no tiene la sesión del editor. `/api/twitch/badges` sí la
 * exige, así que desde ahí devolvería 401 y los mensajes saldrían sin las
 * insignias personalizadas del canal.
 *
 * Lo que expone es arte público de Twitch y de Kick —las mismas imágenes que
 * ve cualquiera que entre al canal— y **no** usa ningún token de usuario: del
 * lado de Twitch va con el token de aplicación (client_credentials), que no
 * representa a nadie y sirve para cualquier canal.
 *
 * Nota: la lógica del token está repetida de `twitch.mts` a propósito. Las
 * functions no entran en el `tsc` del proyecto, así que tocar la que ya anda
 * (y de la que depende el editor) para compartir 30 líneas salía más caro que
 * duplicarlas. Si aparece un tercer consumidor, conviene extraerlas.
 */

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const HELIX = 'https://api.twitch.tv/helix'
const KICK_API = 'https://kick.com/api/v2/channels'
const BADGE_CDN = 'https://static-cdn.jtvnw.net/badges/v1/'

/** Mismo prefijo que usa el editor, para que las de Kick no pisen a las de Twitch. */
const KICK_PREFIX = 'kick:'

/** Cuánto vale una respuesta antes de volver a preguntar. */
const CACHE_MS = 10 * 60 * 1000

function json(body: unknown, status = 200, maxAgeSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Las insignias de un canal casi nunca cambian: que las cachee el CDN
      // evita pegarle a Twitch en cada visita.
      'Cache-Control': maxAgeSeconds
        ? `public, max-age=${maxAgeSeconds}, stale-while-revalidate=86400`
        : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/* ------------------------------ Twitch ------------------------------ */

let cachedToken: { token: string; expiresAt: number } | null = null

async function appToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID ?? '',
      client_secret: process.env.TWITCH_CLIENT_SECRET ?? '',
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`Twitch devolvio ${res.status} al pedir el token de la app.`)

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

async function helix(token: string, path: string): Promise<any> {
  const res = await fetch(`${HELIX}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': process.env.TWITCH_CLIENT_ID ?? '',
    },
  })
  if (!res.ok) throw new Error(`Twitch devolvio ${res.status} en ${path}.`)
  return res.json()
}

/**
 * Insignias de Twitch: las globales más las propias del canal, que pisan a las
 * globales (si tiene insignia de sub personalizada, esa es la que va).
 *
 * Se guarda sólo el id y no la URL entera porque son ~530 por canal y el
 * prefijo del CDN repetido costaba 20 KB al pedo. `badgeUrl` la rearma.
 */
async function twitchBadges(login: string): Promise<Record<string, string>> {
  const token = await appToken()

  const found = await helix(token, `/users?login=${encodeURIComponent(login)}`)
  const id = found?.data?.[0]?.id
  if (!id) throw new Error(`No encontre el canal "${login}" en Twitch.`)

  const [globales, propias] = await Promise.all([
    helix(token, '/chat/badges/global'),
    helix(token, `/chat/badges?broadcaster_id=${encodeURIComponent(id)}`),
  ])

  const images: Record<string, string> = {}
  for (const set of [...(globales?.data ?? []), ...(propias?.data ?? [])]) {
    for (const version of set.versions ?? []) {
      const src = version.image_url_4x || version.image_url_2x || version.image_url_1x
      if (!src) continue
      images[`${set.set_id}/${version.id}`] =
        src.startsWith(BADGE_CDN) && src.endsWith('/3') ? src.slice(BADGE_CDN.length, -2) : src
    }
  }
  return images
}

/* ------------------------------ Kick ------------------------------ */

/**
 * Insignias de sub propias del canal de Kick.
 *
 * Kick manda los meses que lleva suscripto cada persona, no cuál de las
 * insignias corresponde, así que se guardan todos los tramos y el overlay
 * busca el más alto que no los pase.
 */
async function kickBadges(slug: string): Promise<Record<string, string>> {
  const res = await fetch(`${KICK_API}/${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Kick devolvio ${res.status}.`)

  const data = (await res.json()) as {
    subscriber_badges?: { months?: number; badge_image?: { src?: string } }[]
  }

  const images: Record<string, string> = {}
  for (const badge of data.subscriber_badges ?? []) {
    const meses = Number(badge.months) || 0
    const src = badge.badge_image?.src
    if (meses > 0 && src) images[`${KICK_PREFIX}subscriber/${meses}`] = src
  }
  return images
}

/* ------------------------------ handler ------------------------------ */

let cached: { key: string; at: number; body: unknown } | null = null

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const twitch = (url.searchParams.get('twitch') ?? '').trim().toLowerCase()
  const kick = (url.searchParams.get('kick') ?? '').trim().toLowerCase()

  const valido = /^[a-z0-9_-]{1,64}$/
  if (twitch && !valido.test(twitch)) return json({ error: 'Canal de Twitch invalido.' }, 400)
  if (kick && !valido.test(kick)) return json({ error: 'Canal de Kick invalido.' }, 400)
  if (!twitch && !kick) return json({ error: 'Decime de que canal traer las insignias.' }, 400)

  const key = `${twitch}|${kick}`
  if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) {
    return json(cached.body, 200, 600)
  }

  const images: Record<string, string> = {}
  const fallaron: string[] = []

  // Cada plataforma se resuelve por separado: que Kick esté caído no tiene por
  // qué dejar al chat de Twitch sin insignias.
  const partes = await Promise.allSettled([
    twitch ? twitchBadges(twitch) : Promise.resolve({}),
    kick ? kickBadges(kick) : Promise.resolve({}),
  ])

  for (const [i, parte] of partes.entries()) {
    if (parte.status === 'fulfilled') {
      Object.assign(images, parte.value)
    } else {
      fallaron.push(i === 0 ? 'twitch' : 'kick')
      console.error('[chat-badges]', parte.reason)
    }
  }

  const body = { images, count: Object.keys(images).length, fallaron }

  // Sólo se cachea lo que salió entero: si algo falló, el próximo pedido
  // reintenta en vez de quedarse diez minutos con la mitad.
  if (fallaron.length === 0) cached = { key, at: Date.now(), body }

  return json(body, 200, fallaron.length ? 0 : 600)
}

export const config = {
  path: '/api/chat-badges',
}
