import type { Config, Context } from '@netlify/edge-functions'

/**
 * Puerta de entrada al editor.
 *
 * Corre en el borde de Netlify (Deno), antes de servir el HTML: la contraseña
 * vive en una variable de entorno y nunca se manda al navegador. La sesión es
 * una cookie firmada con HMAC-SHA256, sin estado del lado del servidor.
 *
 * El overlay (/overlay.html) queda fuera a propósito: OBS no puede loguearse.
 */

const SESSION_COOKIE = 'cg_session'
const UI_COOKIE = 'cg_auth' // legible por JS, sólo para que la UI sepa que hay sesión
const MAX_AGE = 60 * 60 * 24 * 30 // 30 días
const FAILED_LOGIN_DELAY_MS = 400

/* ------------------------------ firma ------------------------------ */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return toBase64Url(new Uint8Array(signature))
}

/** Comparación en tiempo constante: no filtra cuántos caracteres acertaste. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ba = enc.encode(a)
  const bb = enc.encode(b)
  // Comparamos siempre la misma cantidad de bytes; la diferencia de largo
  // se arrastra en `diff` para no cortar antes de tiempo.
  let diff = ba.length ^ bb.length
  const len = Math.max(ba.length, bb.length)
  for (let i = 0; i < len; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

async function createToken(secret: string): Promise<string> {
  const exp = String(Date.now() + MAX_AGE * 1000)
  return `${exp}.${await sign(secret, exp)}`
}

async function isValidToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot < 1) return false

  const exp = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!safeEqual(signature, await sign(secret, exp))) return false

  const expMs = Number(exp)
  return Number.isFinite(expMs) && expMs > Date.now()
}

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

const PAGE_STYLES = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
       background:#0b0b10;color:#ecedf3;
       font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
       -webkit-font-smoothing:antialiased}
  .card{width:100%;max-width:380px;background:#16161f;border:1px solid #272733;
        border-radius:16px;padding:32px 28px;
        box-shadow:0 30px 80px rgba(0,0,0,.55)}
  .logo{width:44px;height:44px;border-radius:13px;position:relative;margin-bottom:20px;
        background:linear-gradient(135deg,#9146ff 0%,#ff70c8 100%);
        box-shadow:0 8px 26px rgba(145,70,255,.4)}
  .logo::after{content:'';position:absolute;inset:12px 12px 16px 12px;border-radius:3px;
        background:rgba(255,255,255,.92);
        clip-path:polygon(0 0,100% 0,100% 70%,62% 70%,40% 100%,40% 70%,0 70%)}
  h1{margin:0 0 6px;font-size:19px;letter-spacing:-.01em}
  p.sub{margin:0 0 22px;font-size:13px;line-height:1.6;color:#8b8c9c}
  label{display:block;font-size:12px;color:#8b8c9c;margin-bottom:7px}
  input{width:100%;background:#0f0f16;border:1px solid #272733;border-radius:9px;
        padding:11px 13px;color:#ecedf3;font-size:14px;font-family:inherit;outline:none}
  input:focus{border-color:#9146ff}
  button{width:100%;margin-top:14px;background:#9146ff;color:#fff;border:none;
         border-radius:9px;padding:12px;font-size:14px;font-weight:600;font-family:inherit;
         cursor:pointer}
  button:hover{background:#a566ff}
  .error{margin:0 0 16px;font-size:12.5px;line-height:1.5;color:#ff8fa3;
         background:rgba(255,84,112,.1);border:1px solid rgba(255,84,112,.28);
         padding:10px 12px;border-radius:9px}
  .foot{margin:20px 0 0;font-size:11px;color:#5f6072;text-align:center;line-height:1.6}
  code{background:#0f0f16;border:1px solid #272733;border-radius:5px;padding:1px 5px;
       font-size:11px;color:#bf94ff}
`

function htmlResponse(body: string, status: number, url: URL, mutate?: (h: Headers) => void) {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, private',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  })
  mutate?.(headers)
  void url
  return new Response(body, { status, headers })
}

function loginPage(error?: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Acceso — Chat Twitch Generator</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
<style>${PAGE_STYLES}</style>
</head>
<body>
  <main class="card">
    <div class="logo"></div>
    <h1>Chat Twitch Generator</h1>
    <p class="sub">Este editor es privado. Ingresá la clave para entrar.</p>
    ${error ? `<p class="error">${error}</p>` : ''}
    <form method="POST" action="/">
      <label for="password">Clave de acceso</label>
      <input id="password" name="password" type="password" autocomplete="current-password"
             autofocus required>
      <button type="submit">Entrar</button>
    </form>
    <p class="foot">El link del overlay para OBS sigue funcionando sin clave.</p>
  </main>
</body>
</html>`
}

function misconfiguredPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Falta configurar el acceso</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
  <main class="card">
    <div class="logo"></div>
    <h1>Falta configurar el acceso</h1>
    <p class="sub">
      El sitio está protegido pero todavía no tiene clave, así que no deja entrar a nadie.
    </p>
    <p class="sub">
      Definí la variable de entorno <code>APP_PASSWORD</code> en
      <b>Netlify → Site configuration → Environment variables</b> y volvé a desplegar.
    </p>
  </main>
</body>
</html>`
}

/* ------------------------------ handler ------------------------------ */

export default async function gate(request: Request, context: Context): Promise<Response> {
  const url = new URL(request.url)
  const password = Netlify.env.get('APP_PASSWORD')

  // Sin clave configurada fallamos cerrado: mejor un sitio inaccesible que uno abierto.
  if (!password) return htmlResponse(misconfiguredPage(), 503, url)

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
      return htmlResponse(loginPage('Clave incorrecta. Probá de nuevo.'), 401, url)
    }

    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store, private' })
    setSessionCookies(headers, url, await createToken(secret))
    return new Response(null, { status: 303, headers })
  }

  // Sesión existente.
  const token = context.cookies.get(SESSION_COOKIE)
  if (await isValidToken(secret, token)) {
    const response = await context.next()
    // El HTML del editor no puede quedar cacheado en la CDN para anónimos.
    response.headers.set('Cache-Control', 'no-store, private')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return response
  }

  return htmlResponse(loginPage(), 401, url)
}

export const config: Config = {
  path: ['/', '/index.html'],
}
