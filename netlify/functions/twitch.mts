import { getStore } from '@netlify/blobs'
import { SESSION_COOKIE, isValidToken, readCookie, safeEqual, sign } from '../shared/session.ts'

/**
 * Vinculacion de la cuenta de Twitch de la streamer.
 *
 * Flujo Authorization Code: el `client_secret` vive solo aca y los tokens se
 * guardan en Netlify Blobs. **Nunca salen al navegador**, ni siquiera al editor.
 *
 * Para que sirve tenerlo:
 *   - saber el canal sin escribirlo a mano
 *   - traer el arte real de las insignias del canal (subs, bits), que la API
 *     solo entrega con token de usuario
 *
 * Para que NO sirve, y conviene tenerlo claro: el overlay que se pega en OBS es
 * publico, asi que no puede llevar el token adentro. Por eso el overlay sigue
 * leyendo el chat por IRC anonimo y no por EventSub.
 */

const STORE = 'twitch-account'
const KEY = 'default'
const STATE_COOKIE = 'cg_twitch_state'

const AUTH_URL = 'https://id.twitch.tv/oauth2/authorize'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const HELIX = 'https://api.twitch.tv/helix'

interface StoredAccount {
  userId: string
  login: string
  displayName: string
  accessToken: string
  refreshToken: string
  /** Epoch ms en el que vence el access token. */
  expiresAt: number
}

/** Lo unico que el navegador llega a ver de la cuenta. */
interface PublicAccount {
  userId: string
  login: string
  displayName: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
    },
  })
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store, private' })
  if (cookie) headers.append('Set-Cookie', cookie)
  return new Response(null, { status: 303, headers })
}

function env(name: string): string | undefined {
  return process.env[name]
}

/** El editor esta detras del login propio: sin sesion no se toca nada de esto. */
async function requireSession(req: Request): Promise<Response | null> {
  const password = env('APP_PASSWORD')
  if (!password) return json({ error: 'Falta configurar APP_PASSWORD.' }, 503)

  const secret = env('SESSION_SECRET') || password
  const token = readCookie(req.headers.get('cookie'), SESSION_COOKIE)
  if (!(await isValidToken(secret, token))) return json({ error: 'Sesion no valida.' }, 401)

  return null
}

/* ------------------------------ almacenamiento ------------------------------ */

async function readAccount(): Promise<StoredAccount | null> {
  const data = (await getStore(STORE).get(KEY, { type: 'json' })) as StoredAccount | null
  return data ?? null
}

async function writeAccount(account: StoredAccount): Promise<void> {
  await getStore(STORE).setJSON(KEY, account)
}

async function clearAccount(): Promise<void> {
  await getStore(STORE).delete(KEY)
}

function toPublic(account: StoredAccount): PublicAccount {
  return { userId: account.userId, login: account.login, displayName: account.displayName }
}

/* ------------------------------ tokens ------------------------------ */

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('TWITCH_CLIENT_ID') ?? '',
      client_secret: env('TWITCH_CLIENT_SECRET') ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error(`Twitch devolvio ${res.status} al canjear el codigo.`)
  return (await res.json()) as TokenResponse
}

/** Devuelve un access token vigente, renovandolo si le queda poco. */
async function freshToken(account: StoredAccount): Promise<StoredAccount> {
  // Un minuto de margen para no usar un token que vence en el camino.
  if (account.expiresAt - 60_000 > Date.now()) return account

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('TWITCH_CLIENT_ID') ?? '',
      client_secret: env('TWITCH_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    }),
  })

  if (!res.ok) throw new Error('No se pudo renovar el token. Hay que volver a vincular la cuenta.')

  const data = (await res.json()) as TokenResponse
  const updated: StoredAccount = {
    ...account,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || account.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  await writeAccount(updated)
  return updated
}

async function helix(account: StoredAccount, path: string): Promise<any> {
  const res = await fetch(`${HELIX}${path}`, {
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Client-Id': env('TWITCH_CLIENT_ID') ?? '',
    },
  })
  if (!res.ok) throw new Error(`Twitch devolvio ${res.status} en ${path}.`)
  return res.json()
}

/* ------------------------------ handler ------------------------------ */

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const action = url.pathname.split('/').pop() ?? ''
  const clientId = env('TWITCH_CLIENT_ID')
  const clientSecret = env('TWITCH_CLIENT_SECRET')
  const appSecret = env('SESSION_SECRET') || env('APP_PASSWORD') || ''
  const redirectUri = `${url.origin}/api/twitch/callback`

  // El callback lo abre Twitch en el navegador de la streamer, que ya tiene la
  // sesion del editor: igual lo exigimos en todas las rutas.
  const denied = await requireSession(req)
  if (denied) return denied

  if (!clientId || !clientSecret) {
    return json(
      {
        error: 'Falta configurar TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET en Netlify.',
        configured: false,
      },
      action === 'status' ? 200 : 503,
    )
  }

  try {
    /* --- estado actual de la vinculacion --- */
    if (action === 'status') {
      const account = await readAccount()
      return json({ configured: true, account: account ? toPublic(account) : null })
    }

    /* --- arranque del flujo --- */
    if (action === 'login') {
      // `state` firmado: al volver comprobamos que el pedido salio de aca.
      const nonce = crypto.randomUUID()
      const signature = await sign(appSecret, nonce)
      const state = `${nonce}.${signature}`

      const authorize = new URL(AUTH_URL)
      authorize.searchParams.set('client_id', clientId)
      authorize.searchParams.set('redirect_uri', redirectUri)
      authorize.searchParams.set('response_type', 'code')
      // Sin scopes: solo necesitamos identidad y las insignias del canal.
      authorize.searchParams.set('scope', '')
      authorize.searchParams.set('state', state)

      const secure = url.protocol === 'https:' ? '; Secure' : ''
      return redirect(
        authorize.toString(),
        `${STATE_COOKIE}=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${secure}`,
      )
    }

    /* --- vuelta de Twitch --- */
    if (action === 'callback') {
      const error = url.searchParams.get('error')
      if (error) return redirect(`/#/?twitch=${encodeURIComponent(error)}`)

      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state') ?? ''
      const expected = readCookie(req.headers.get('cookie'), STATE_COOKIE)

      if (!code || !state || !expected || !safeEqual(state, expected)) {
        return redirect('/#/?twitch=estado_invalido')
      }

      const [nonce, signature] = state.split('.')
      if (!nonce || !signature || !safeEqual(signature, await sign(appSecret, nonce))) {
        return redirect('/#/?twitch=estado_invalido')
      }

      const tokens = await exchangeCode(code, redirectUri)
      const partial: StoredAccount = {
        userId: '',
        login: '',
        displayName: '',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      }

      const me = await helix(partial, '/users')
      const user = me?.data?.[0]
      if (!user) return redirect('/#/?twitch=sin_usuario')

      await writeAccount({
        ...partial,
        userId: user.id,
        login: user.login,
        displayName: user.display_name || user.login,
      })

      const secure = url.protocol === 'https:' ? '; Secure' : ''
      return redirect(
        '/#/?twitch=ok',
        `${STATE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`,
      )
    }

    /* --- insignias reales del canal --- */
    if (action === 'badges') {
      const stored = await readAccount()
      if (!stored) return json({ error: 'No hay cuenta vinculada.' }, 400)

      const account = await freshToken(stored)
      const channel = url.searchParams.get('broadcaster_id') || account.userId

      const [global_, channelBadges] = await Promise.all([
        helix(account, '/chat/badges/global'),
        helix(account, `/chat/badges?broadcaster_id=${encodeURIComponent(channel)}`),
      ])

      // Las del canal pisan a las globales: si tiene insignia de sub propia,
      // esa es la que hay que mostrar.
      const images: Record<string, string> = {}
      for (const set of [...(global_?.data ?? []), ...(channelBadges?.data ?? [])]) {
        for (const version of set.versions ?? []) {
          const src = version.image_url_4x || version.image_url_2x || version.image_url_1x
          if (src) images[`${set.set_id}/${version.id}`] = src
        }
      }

      return json({ images, count: Object.keys(images).length })
    }

    /* --- desvincular --- */
    if (action === 'unlink') {
      await clearAccount()
      return json({ account: null })
    }

    return json({ error: 'Ruta desconocida.' }, 404)
  } catch (error) {
    console.error('[twitch]', error)
    return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 500)
  }
}

export const config = {
  path: '/api/twitch/:action',
}
