import { getStore } from '@netlify/blobs'

/**
 * La encuesta que esta corriendo en el canal, sin login.
 *
 * Existe por la misma razon que `chat-badges`: la pantalla de lectura
 * (`/chat.html`) es publica y no tiene la sesion del editor, asi que no puede
 * pegarle a `/api/twitch/*`, que la exige en todas sus rutas.
 *
 * La diferencia importante es el token. Las insignias salen con el token de
 * aplicacion, que no representa a nadie. **Las encuestas no**: Twitch solo se
 * las muestra al dueño del canal, con un token de usuario que traiga
 * `channel:read:polls`. Por eso esto lee la cuenta vinculada de los Blobs y usa
 * su token, siempre del lado del servidor. Al navegador nunca sale otra cosa
 * que el titulo, las opciones y los votos.
 *
 * Que esto sea publico quiere decir que cualquiera que llame al endpoint ve la
 * encuesta del canal. Es lo mismo que ve cualquiera que este mirando el stream,
 * asi que no hay nada que proteger, pero por las dudas: el `broadcaster_id`
 * sale **siempre** de la cuenta guardada y nunca de la query. Esto no es un
 * proxy generico a Helix, lee una sola cosa de un solo canal.
 *
 * Si no hay cuenta vinculada, o si la que hay quedo sin el scope, contesta
 * `{ poll: null }` con un motivo y la pantalla sigue andando sin mostrar nada.
 */

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const HELIX = 'https://api.twitch.tv/helix'

const STORE = 'twitch-account'
const KEY = 'default'

/**
 * Cuanto vale una respuesta antes de volver a preguntarle a Twitch.
 *
 * Con una encuesta abierta la pantalla pregunta cada 3 segundos; esto hace que
 * varias pestañas abiertas no se multipliquen en llamadas a Helix, porque la
 * instancia caliente contesta de memoria. El CDN cachea otro tanto.
 */
const CACHE_MS = 2000

/** Lo que guarda el flujo de vinculacion en `twitch.mts`. */
interface StoredAccount {
  userId: string
  login: string
  displayName: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

/** Tal cual lo devuelve Helix. Solo los campos que se usan. */
interface HelixPoll {
  id: string
  title: string
  choices: { id: string; title: string; votes: number }[]
  status: string
  duration: number
  started_at: string
  ended_at: string | null
}

function json(body: unknown, status = 200, maxAgeSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAgeSeconds ? `public, max-age=${maxAgeSeconds}` : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/* ------------------------------ cuenta y token ------------------------------ */

async function readAccount(): Promise<StoredAccount | null> {
  const data = (await getStore(STORE).get(KEY, { type: 'json' })) as StoredAccount | null
  return data ?? null
}

/**
 * Renovacion compartida dentro de la instancia.
 *
 * Twitch invalida el refresh token viejo cada vez que entrega uno nuevo, asi
 * que dos renovaciones en paralelo se pisan y dejan la vinculacion rota. El
 * token de usuario dura unas cuatro horas y esto se llama cada pocos segundos,
 * o sea que la ventana existe de verdad. Con una sola promesa por instancia
 * alcanza para el caso real (una pantalla, alguna pestaña de mas).
 */
let renovando: Promise<StoredAccount> | null = null

async function freshToken(account: StoredAccount): Promise<StoredAccount> {
  // Un minuto de margen para no usar un token que vence en el camino.
  if (account.expiresAt - 60_000 > Date.now()) return account

  if (!renovando) {
    renovando = renovar(account).finally(() => {
      renovando = null
    })
  }
  return renovando
}

async function renovar(account: StoredAccount): Promise<StoredAccount> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID ?? '',
      client_secret: process.env.TWITCH_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    }),
  })

  if (!res.ok) throw new Error(`Twitch devolvio ${res.status} al renovar el token.`)

  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  const updated: StoredAccount = {
    ...account,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || account.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  await getStore(STORE).setJSON(KEY, updated)
  return updated
}

/* ------------------------------ encuesta ------------------------------ */

/**
 * De los seis estados que maneja Twitch solo dos se dibujan.
 *
 * `ARCHIVED` y `MODERATED` son encuestas que la streamer saco de la vista o que
 * Twitch bajo: mostrarlas seria resucitar algo que alguien eligio esconder.
 */
function estado(status: string): 'active' | 'ended' | null {
  const s = status.toUpperCase()
  if (s === 'ACTIVE') return 'active'
  if (s === 'COMPLETED' || s === 'TERMINATED') return 'ended'
  return null
}

function aPublico(poll: HelixPoll) {
  const status = estado(poll.status)
  if (!status) return null

  const startedAt = Date.parse(poll.started_at) || Date.now()
  const endedAt = poll.ended_at ? Date.parse(poll.ended_at) || undefined : undefined

  return {
    id: poll.id,
    title: poll.title,
    // `votes` ya viene con todo sumado, los sueltos y los de puntos de canal.
    choices: poll.choices.map((c) => ({ id: c.id, title: c.title, votes: c.votes ?? 0 })),
    status,
    startedAt,
    endsAt: startedAt + poll.duration * 1000,
    endedAt,
  }
}

let cached: { at: number; body: unknown; maxAge: number } | null = null

export default async function handler(): Promise<Response> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return json(cached.body, 200, cached.maxAge)
  }

  const clientId = process.env.TWITCH_CLIENT_ID
  if (!clientId || !process.env.TWITCH_CLIENT_SECRET) {
    return json({ poll: null, motivo: 'sin_configurar' })
  }

  let account: StoredAccount | null
  try {
    account = await readAccount()
  } catch (e) {
    console.error('[chat-poll]', e)
    return json({ poll: null, motivo: 'sin_cuenta' })
  }

  if (!account) return json({ poll: null, motivo: 'sin_cuenta' })

  try {
    const vigente = await freshToken(account)

    // El canal es el de la cuenta vinculada y nada mas. Twitch tampoco deja
    // otra cosa: el id tiene que coincidir con el dueño del token.
    const res = await fetch(`${HELIX}/polls?broadcaster_id=${vigente.userId}&first=1`, {
      headers: {
        Authorization: `Bearer ${vigente.accessToken}`,
        'Client-Id': clientId,
      },
    })

    if (res.status === 401 || res.status === 403) {
      // Lo normal es que falte `channel:read:polls`: la vinculacion vieja se
      // pidio sin scopes. Se arregla volviendo a vincular desde el editor.
      return json({ poll: null, motivo: 'sin_permiso' })
    }

    if (!res.ok) {
      console.error('[chat-poll] Twitch devolvio', res.status)
      return json({ poll: null, motivo: 'error' })
    }

    const data = (await res.json()) as { data?: HelixPoll[] }
    const cruda = data.data?.[0]
    const poll = cruda ? aPublico(cruda) : null

    // Una encuesta abierta cambia todo el tiempo; sin nada que mostrar se
    // puede esperar mas. Igual la pantalla espacia sus propios pedidos.
    const maxAge = poll?.status === 'active' ? 2 : 5
    const body = { poll }
    cached = { at: Date.now(), body, maxAge }

    return json(body, 200, maxAge)
  } catch (e) {
    console.error('[chat-poll]', e)
    return json({ poll: null, motivo: 'error' })
  }
}

export const config = {
  path: '/api/chat-poll',
}
