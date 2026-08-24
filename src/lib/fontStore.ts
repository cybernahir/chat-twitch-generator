/**
 * Guarda la fuente subida por el streamer en IndexedDB para que el editor la
 * recuerde entre sesiones. En el overlay la fuente viaja embebida en la URL,
 * porque OBS abre la página en su propio navegador y no comparte storage.
 */
const DB_NAME = 'chat-twitch-generator'
const STORE = 'fonts'
const KEY = 'custom'

export interface StoredFont {
  name: string
  dataUrl: string
  size: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveFont(font: StoredFont): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(font, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadFont(): Promise<StoredFont | null> {
  try {
    const db = await openDb()
    const font = await new Promise<StoredFont | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as StoredFont) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return font
  } catch {
    return null
  }
}

export async function clearFont(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    /* si no hay IndexedDB no pasa nada */
  }
}

const MIME: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

export function fontMimeFor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'font/ttf'
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // Forzamos el mime correcto: algunos navegadores devuelven application/octet-stream
      // y Chromium se pone quisquilloso al registrar la @font-face.
      const result = String(reader.result)
      const mime = fontMimeFor(file.name)
      resolve(result.replace(/^data:[^;]*;/, `data:${mime};`))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Registro de fuentes propias ya declaradas en el documento.
 *
 * Es un mapa y no una sola regla porque la biblioteca de presets muestra
 * varias miniaturas a la vez y cada preset puede traer su propia fuente: si
 * reescribiéramos una única @font-face, la última cargada le pisaría la
 * tipografía a todas las demás.
 */
const faces = new Map<string, string>()

function renderFaces(): void {
  const id = 'custom-font-faces'
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  style.textContent = Array.from(faces)
    .map(([name, src]) => `@font-face{font-family:"${name}";src:url("${src}");font-display:swap;}`)
    .join('\n')
}

/** Registra la fuente en el documento actual bajo el nombre indicado. */
export function injectFontFace(name: string, src: string): void {
  if (!name || !src || faces.get(name) === src) return
  faces.set(name, src)
  renderFaces()
}

/** Sin nombre borra todas; con nombre, sólo esa. */
export function removeFontFace(name?: string): void {
  if (name) faces.delete(name)
  else faces.clear()
  renderFaces()
}
