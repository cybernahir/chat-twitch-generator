/**
 * Verificación de la sesión, compartida por el gate del editor (edge function,
 * Deno) y la API de presets (function, Node 20+). Ambos runtimes traen Web
 * Crypto global, así que el mismo código sirve para los dos y no hay dos
 * implementaciones de seguridad que puedan divergir.
 */

export const SESSION_COOKIE = 'cg_session'
export const UI_COOKIE = 'cg_auth' // legible por JS, sólo para que la UI sepa que hay sesión
export const MAX_AGE = 60 * 60 * 24 * 30 // 30 días

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sign(secret: string, data: string): Promise<string> {
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
export function safeEqual(a: string, b: string): boolean {
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

export async function createToken(secret: string): Promise<string> {
  const exp = String(Date.now() + MAX_AGE * 1000)
  return `${exp}.${await sign(secret, exp)}`
}

export async function isValidToken(secret: string, token: string | undefined): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot < 1) return false

  const exp = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!safeEqual(signature, await sign(secret, exp))) return false

  const expMs = Number(exp)
  return Number.isFinite(expMs) && expMs > Date.now()
}

/** Lee una cookie del header crudo. Las functions no traen un parser propio. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return undefined
}
