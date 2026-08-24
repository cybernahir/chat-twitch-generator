import { getStore } from '@netlify/blobs'
import { SESSION_COOKIE, isValidToken, readCookie } from '../shared/session.ts'

/**
 * Presets del streamer, guardados del lado del servidor.
 *
 * Van a Netlify Blobs y no a localStorage porque el pedido era poder entrar
 * desde otra computadora: localStorage vive en un navegador concreto y no
 * viaja. La app es de un solo usuario (el que pasa el login), así que todo
 * el listado entra en un único blob y se lee y escribe completo.
 */

const STORE = 'chat-presets'
const KEY = 'all'

interface StoredPreset {
  id: string
  name: string
  updatedAt: number
  config: unknown
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

async function authorize(req: Request): Promise<Response | null> {
  const password = process.env.APP_PASSWORD
  if (!password) return json({ error: 'Falta configurar APP_PASSWORD en Netlify.' }, 503)

  const secret = process.env.SESSION_SECRET || password
  const token = readCookie(req.headers.get('cookie'), SESSION_COOKIE)
  if (!(await isValidToken(secret, token))) return json({ error: 'Sesión no válida.' }, 401)

  return null
}

async function readAll(): Promise<StoredPreset[]> {
  const store = getStore(STORE)
  const data = (await store.get(KEY, { type: 'json' })) as StoredPreset[] | null
  return Array.isArray(data) ? data : []
}

async function writeAll(presets: StoredPreset[]): Promise<void> {
  await getStore(STORE).setJSON(KEY, presets)
}

export default async function handler(req: Request): Promise<Response> {
  const denied = await authorize(req)
  if (denied) return denied

  try {
    if (req.method === 'GET') {
      return json({ presets: await readAll() })
    }

    if (req.method === 'POST') {
      const incoming = (await req.json()) as Partial<StoredPreset>
      if (!incoming?.id || typeof incoming.name !== 'string') {
        return json({ error: 'Falta el id o el nombre del preset.' }, 400)
      }

      const preset: StoredPreset = {
        id: incoming.id,
        name: incoming.name.slice(0, 80),
        updatedAt: Date.now(),
        config: incoming.config ?? {},
      }

      const presets = await readAll()
      const at = presets.findIndex((p) => p.id === preset.id)
      if (at >= 0) presets[at] = preset
      else presets.push(preset)

      await writeAll(presets)
      return json({ preset, presets })
    }

    if (req.method === 'DELETE') {
      const id = new URL(req.url).searchParams.get('id')
      if (!id) return json({ error: 'Falta el id.' }, 400)

      const presets = (await readAll()).filter((p) => p.id !== id)
      await writeAll(presets)
      return json({ presets })
    }

    return json({ error: 'Método no soportado.' }, 405)
  } catch (error) {
    console.error('[presets]', error)
    return json({ error: 'No se pudo acceder al almacenamiento.' }, 500)
  }
}

export const config = {
  path: '/api/presets',
}
