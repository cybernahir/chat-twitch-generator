import type { ChatConfig, Preset, PresetStorageMode } from '../types'

/**
 * Presets con dos respaldos.
 *
 * El principal es la API (`/api/presets`), que guarda en Netlify Blobs: es la
 * única forma de que los presets aparezcan al entrar desde otra computadora,
 * porque localStorage vive en un navegador concreto.
 *
 * El de respaldo es localStorage, y entra en juego cuando no hay backend
 * (por ejemplo corriendo `npm run dev`, que levanta Vite solo). Además hace
 * de caché: si la API responde, dejamos una copia local para que la pantalla
 * pinte al instante en la próxima visita.
 */

const CACHE_KEY = 'chat-twitch-generator:presets'
const API = '/api/presets'

export interface PresetsResult {
  presets: Preset[]
  mode: PresetStorageMode
}

export function newPresetId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/* ------------------------------ caché local ------------------------------ */

function readCache(): Preset[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Preset[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCache(presets: Preset[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(presets))
  } catch {
    // Una fuente embebida puede pasarse del cupo de localStorage. No es crítico:
    // si hay backend, la copia buena ya quedó allá.
  }
}

/* ------------------------------ API ------------------------------ */

/** La sesión venció: recargamos para que el gate muestre el login de nuevo. */
function handleExpiredSession(): never {
  window.location.reload()
  throw new Error('sesión vencida')
}

async function callApi(init: RequestInit & { search?: string } = {}): Promise<Preset[] | null> {
  const { search, ...rest } = init
  try {
    const res = await fetch(API + (search ?? ''), { credentials: 'same-origin', ...rest })

    if (res.status === 401) handleExpiredSession()
    if (!res.ok) return null

    const data = (await res.json()) as { presets?: Preset[] }
    return Array.isArray(data.presets) ? data.presets : null
  } catch {
    // Sin backend (Vite solo) el fetch devuelve el index.html o falla al parsear.
    return null
  }
}

function sorted(presets: Preset[]): Preset[] {
  return [...presets].sort((a, b) => b.updatedAt - a.updatedAt)
}

/* ------------------------------ operaciones ------------------------------ */

export async function listPresets(): Promise<PresetsResult> {
  const remote = await callApi()
  if (remote) {
    writeCache(remote)
    return { presets: sorted(remote), mode: 'cloud' }
  }
  return { presets: sorted(readCache()), mode: 'local' }
}

export async function savePreset(
  id: string,
  name: string,
  config: ChatConfig,
): Promise<PresetsResult> {
  const preset: Preset = { id, name, config, updatedAt: Date.now() }

  const remote = await callApi({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preset),
  })

  if (remote) {
    writeCache(remote)
    return { presets: sorted(remote), mode: 'cloud' }
  }

  const local = readCache()
  const at = local.findIndex((p) => p.id === id)
  if (at >= 0) local[at] = preset
  else local.push(preset)
  writeCache(local)

  return { presets: sorted(local), mode: 'local' }
}

export async function deletePreset(id: string): Promise<PresetsResult> {
  const remote = await callApi({
    method: 'DELETE',
    search: `?id=${encodeURIComponent(id)}`,
  })

  if (remote) {
    writeCache(remote)
    return { presets: sorted(remote), mode: 'cloud' }
  }

  const local = readCache().filter((p) => p.id !== id)
  writeCache(local)
  return { presets: sorted(local), mode: 'local' }
}
