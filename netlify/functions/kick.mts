import { SESSION_COOKIE, isValidToken, readCookie } from '../shared/session.ts'

/**
 * Traduce el nombre de un canal de Kick a su id de sala de chat.
 *
 * Existe porque `kick.com/api/v2/channels/<slug>` **no manda cabeceras CORS**,
 * asi que el navegador no puede pedirlo directo. Lo pedimos desde el servidor
 * y devolvemos solo el id.
 *
 * Se usa una sola vez, desde el editor: el id queda guardado en el preset y el
 * overlay se conecta derecho al WebSocket de Kick sin pasar por aca.
 */

const KICK_API = 'https://kick.com/api/v2/channels'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, private',
    },
  })
}

export default async function handler(req: Request): Promise<Response> {
  // Es una operacion del editor, que ya esta detras del login propio.
  const password = process.env.APP_PASSWORD
  if (!password) return json({ error: 'Falta configurar APP_PASSWORD.' }, 503)

  const secret = process.env.SESSION_SECRET || password
  const token = readCookie(req.headers.get('cookie'), SESSION_COOKIE)
  if (!(await isValidToken(secret, token))) return json({ error: 'Sesion no valida.' }, 401)

  const slug = (new URL(req.url).pathname.split('/').pop() ?? '').toLowerCase()
  if (!/^[a-z0-9_-]{1,64}$/.test(slug)) return json({ error: 'Nombre de canal invalido.' }, 400)

  try {
    const res = await fetch(`${KICK_API}/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    })

    // "No existe" va con 200 y el error en el cuerpo, no con 404: ante un 404
    // Netlify reintenta el pedido agregando `.html` buscando un estatico, eso
    // vuelve a entrar aca con un punto en el nombre y la respuesta que termina
    // ganando es "nombre invalido", que confunde a quien solo escribio mal el
    // canal. El cliente mira `error`, asi que el estado no le cambia nada.
    if (res.status === 404) return json({ error: `No existe el canal "${slug}" en Kick.` })

    if (!res.ok) {
      // Kick esta detras de Cloudflare y a veces corta pedidos de datacenter.
      return json(
        {
          error: `Kick respondio ${res.status}. Puede ser su proteccion anti-bots: cargá el id de la sala a mano.`,
          blocked: true,
        },
        502,
      )
    }

    const data = (await res.json()) as {
      id?: number
      slug?: string
      user?: { username?: string }
      chatroom?: { id?: number }
      livestream?: unknown
    }

    const chatroomId = data?.chatroom?.id
    if (!chatroomId) return json({ error: 'Ese canal no expone sala de chat.' }, 404)

    return json({
      slug: data.slug ?? slug,
      displayName: data.user?.username ?? data.slug ?? slug,
      chatroomId: String(chatroomId),
      live: Boolean(data.livestream),
    })
  } catch (error) {
    console.error('[kick]', error)
    return json(
      {
        error: 'No se pudo contactar a Kick. Cargá el id de la sala a mano.',
        blocked: true,
      },
      502,
    )
  }
}

export const config = {
  path: '/api/kick/:slug',
}
