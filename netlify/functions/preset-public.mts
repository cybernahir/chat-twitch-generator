import { getStore } from '@netlify/blobs'

/**
 * Lectura publica de un preset, por id.
 *
 * Existe para que el link que se pega en OBS sea corto y estable en vez de
 * llevar la configuracion entera codificada en la URL. Con el link viejo, cada
 * cambio en el editor generaba una URL distinta y OBS se quedaba mostrando la
 * version vieja; ademas la fuente propia viajaba en base64 adentro de la URL,
 * que quedaba impracticable de pegar.
 *
 * Va sin sesion a proposito: la fuente de navegador de OBS no puede loguearse.
 * Lo que se expone es la configuracion visual del chat (colores, fuente, canal),
 * que no es informacion sensible y no incluye ningun token.
 */

const STORE = 'chat-presets'
const KEY = 'all'

interface StoredPreset {
  id: string
  name: string
  updatedAt: number
  config: unknown
}

function json(body: unknown, status = 200, etag?: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    // Sin cache de CDN: lo que acaba de guardar tiene que verse ya. La
    // revalidacion barata la resuelve el ETag.
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  }
  if (etag) headers.ETag = etag

  return new Response(JSON.stringify(body), { status, headers })
}

export default async function handler(req: Request): Promise<Response> {
  const id = new URL(req.url).pathname.split('/').pop() ?? ''
  if (!id) return json({ error: 'Falta el id.' }, 400)

  try {
    const data = (await getStore(STORE).get(KEY, { type: 'json' })) as StoredPreset[] | null
    const preset = Array.isArray(data) ? data.find((p) => p.id === id) : null

    if (!preset) return json({ error: 'Ese preset no existe.' }, 404)

    // El overlay consulta cada pocos segundos para aplicar los cambios en vivo.
    // Con ETag, mientras no se guarde nada nuevo la respuesta es un 304 vacio
    // en vez de mandar la configuracion entera (que puede traer una fuente).
    const etag = `"${preset.updatedAt}"`
    if (req.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
      })
    }

    return json(
      { name: preset.name, updatedAt: preset.updatedAt, config: preset.config },
      200,
      etag,
    )
  } catch (error) {
    console.error('[preset-public]', error)
    return json({ error: 'No se pudo leer el preset.' }, 500)
  }
}

export const config = {
  path: '/api/preset/:id',
}
