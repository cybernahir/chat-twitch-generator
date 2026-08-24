import type { Config, Context } from '@netlify/edge-functions'
import {
  MAX_AGE,
  SESSION_COOKIE,
  UI_COOKIE,
  createToken,
  isValidToken,
  safeEqual,
} from '../shared/session.ts'

/**
 * Puerta de entrada al editor.
 *
 * Corre en el borde de Netlify (Deno), antes de servir el HTML: la contraseña
 * vive en una variable de entorno y nunca se manda al navegador. La sesión es
 * una cookie firmada con HMAC-SHA256, sin estado del lado del servidor.
 *
 * El overlay (/overlay.html) queda fuera a propósito: OBS no puede loguearse.
 */

const FAILED_LOGIN_DELAY_MS = 400

/* ------------------------------ cookies ------------------------------ */

function cookieOptions(url: URL, maxAge: number): string {
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  return `; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

function setSessionCookies(headers: Headers, url: URL, token: string): void {
  headers.append('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly${cookieOptions(url, MAX_AGE)}`)
  headers.append('Set-Cookie', `${UI_COOKIE}=1${cookieOptions(url, MAX_AGE)}`)
}

function clearSessionCookies(headers: Headers, url: URL): void {
  headers.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly${cookieOptions(url, 0)}`)
  headers.append('Set-Cookie', `${UI_COOKIE}=; ${cookieOptions(url, 0)}`)
}

/* ------------------------------ páginas ------------------------------ */

/* Mismos tokens que src/styles/app.css: fondo oscuro, borde de 1.5px, esquinas
   casi rectas, sombra dura sin desenfoque y el morado de Twitch como acento. */
const PAGE_STYLES = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
       background:#08080c;color:#edeef4;
       font-family:'Space Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif;
       -webkit-font-smoothing:antialiased}
  .card{width:100%;max-width:392px;background:#101017;border:1.5px solid #2b2b3a;
        border-radius:6px;padding:30px 28px;box-shadow:5px 5px 0 #55199f}
  .mark{display:inline-flex;align-items:center;gap:8px;margin-bottom:22px;
        border:1.5px solid #a06bff;border-radius:4px;padding:4px 9px 4px 5px;
        background:#9146ff;color:#fff;font-family:'JetBrains Mono',monospace;
        font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;font-weight:600}
  .mark i{width:11px;height:11px;background:#fff;display:block;
        clip-path:polygon(0 0,100% 0,100% 68%,60% 68%,38% 100%,38% 68%,0 68%)}
  h1{margin:0 0 8px;font-family:'Bricolage Grotesque',system-ui,sans-serif;
     font-size:30px;font-weight:700;line-height:1.05;letter-spacing:-.03em}
  p.sub{margin:0 0 24px;font-size:13.5px;line-height:1.55;color:#8a8b9f}
  label{display:block;font-family:'JetBrains Mono',monospace;font-size:10.5px;
        text-transform:uppercase;letter-spacing:.08em;color:#8a8b9f;margin-bottom:8px}
  input{width:100%;background:#16161f;border:1.5px solid #2b2b3a;border-radius:4px;
        padding:11px 13px;color:#edeef4;font-size:14px;font-family:inherit;outline:none;
        transition:border-color 120ms ease,box-shadow 120ms ease}
  input:focus{border-color:#9146ff;box-shadow:3px 3px 0 #9146ff}
  button{width:100%;margin-top:16px;background:#9146ff;color:#fff;
         border:1.5px solid #a06bff;border-radius:4px;padding:12px;font-size:14px;
         font-weight:600;font-family:inherit;cursor:pointer;box-shadow:3px 3px 0 #55199f;
         transition:transform 120ms ease,box-shadow 120ms ease,background 120ms ease}
  button:hover{background:#a06bff;transform:translate(-1px,-1px);box-shadow:4px 4px 0 #55199f}
  button:active{transform:translate(3px,3px);box-shadow:0 0 0 #55199f}
  :focus-visible{outline:2px solid #a06bff;outline-offset:2px}
  .error{margin:0 0 18px;font-size:12.5px;line-height:1.5;color:#ffb3bf;
         background:rgba(255,107,131,.12);border:1.5px solid rgba(255,107,131,.32);
         border-radius:4px;padding:10px 12px}
  .foot{margin:22px 0 0;padding-top:16px;border-top:1.5px solid rgba(255,255,255,.09);
        font-size:11.5px;color:#7e7f95;text-align:center;line-height:1.6}
  code{background:#16161f;border:1px solid #2b2b3a;border-radius:3px;
       padding:1px 5px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#c4a4ff}
  @media (prefers-reduced-motion:reduce){*{transition-duration:.01ms !important}}
`

const FONT_LINKS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">`

function htmlResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    }),
  })
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="dark">
<title>${title}</title>${FONT_LINKS}
<style>${PAGE_STYLES}</style>
</head>
<body><main class="card">${body}</main></body>
</html>`
}

function loginPage(error?: string): string {
  return shell(
    'Acceso privado',
    `
    <span class="mark"><i></i>Chat Generator</span>
    <h1>Estudio privado</h1>
    <p class="sub">Ingresá la clave para entrar a tus presets.</p>
    ${error ? `<p class="error">${error}</p>` : ''}
    <form method="POST" action="/">
      <label for="password">Clave de acceso</label>
      <input id="password" name="password" type="password" autocomplete="current-password"
             autofocus required>
      <button type="submit">Entrar</button>
    </form>
    <p class="foot">El link del overlay para OBS sigue funcionando sin clave.</p>`,
  )
}

function misconfiguredPage(): string {
  return shell(
    'Falta configurar el acceso',
    `
    <span class="mark"><i></i>Chat Generator</span>
    <h1>Falta la clave</h1>
    <p class="sub">
      El sitio está protegido pero todavía no tiene contraseña, así que no deja entrar a nadie.
    </p>
    <p class="sub">
      Definí la variable de entorno <code>APP_PASSWORD</code> en
      Netlify, en Site configuration y luego Environment variables, y volvé a desplegar.
    </p>`,
  )
}

/* ------------------------------ handler ------------------------------ */

export default async function gate(request: Request, context: Context): Promise<Response> {
  const url = new URL(request.url)
  const password = Netlify.env.get('APP_PASSWORD')

  // Sin clave configurada fallamos cerrado: mejor un sitio inaccesible que uno abierto.
  if (!password) return htmlResponse(misconfiguredPage(), 503)

  const secret = Netlify.env.get('SESSION_SECRET') || password

  // Cerrar sesión.
  if (url.searchParams.has('logout')) {
    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store, private' })
    clearSessionCookies(headers, url)
    return new Response(null, { status: 303, headers })
  }

  // Envío del formulario.
  if (request.method === 'POST') {
    let candidate = ''
    try {
      candidate = String((await request.formData()).get('password') ?? '')
    } catch {
      candidate = ''
    }

    if (!safeEqual(candidate, password)) {
      // Pequeña demora: hace inviable probar claves a fuerza bruta.
      await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS))
      return htmlResponse(loginPage('Clave incorrecta. Probá de nuevo.'), 401)
    }

    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store, private' })
    setSessionCookies(headers, url, await createToken(secret))
    return new Response(null, { status: 303, headers })
  }

  // Sesión existente.
  if (await isValidToken(secret, context.cookies.get(SESSION_COOKIE))) {
    const response = await context.next()
    // El HTML del editor no puede quedar cacheado en la CDN para anónimos.
    response.headers.set('Cache-Control', 'no-store, private')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return response
  }

  return htmlResponse(loginPage(), 401)
}

export const config: Config = {
  path: ['/', '/index.html'],
}
