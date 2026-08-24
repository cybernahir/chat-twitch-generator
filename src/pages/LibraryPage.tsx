import {
  ArrowSquareOut,
  Check,
  CopySimple,
  LinkSimple,
  Plus,
  SignOut,
  Trash,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import ChatOverlay from '../components/ChatOverlay'
import { buildOverlayUrl } from '../lib/encode'
import { injectFontFace } from '../lib/fontStore'
import { deletePreset, newPresetId, savePreset } from '../lib/presetStore'
import { navigate } from '../lib/useHashRoute'
import type { ChatMessage, Preset, PresetStorageMode } from '../types'

/** Mensajes fijos: así todas las miniaturas se comparan entre sí. */
const THUMB_MESSAGES: ChatMessage[] = [
  {
    id: 't1',
    user: 'lupita_ok',
    text: 'que grande ese clutch',
    color: '#FF69B4',
    badges: ['sub'],
    createdAt: 0,
  },
  {
    id: 't2',
    user: 'ElTanoStream',
    text: 'vamos que se puede',
    color: '#1E90FF',
    badges: [],
    createdAt: 0,
  },
  {
    id: 't3',
    user: 'moderadorx',
    text: 'bienvenidos al directo',
    color: '#00FF7F',
    badges: ['mod'],
    createdAt: 0,
  },
]

const THUMB_W = 250
const THUMB_H = 150

function sinceLabel(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `hace ${days} d`
  return new Date(ts).toLocaleDateString('es-AR')
}

interface Props {
  presets: Preset[]
  mode: PresetStorageMode
  loading: boolean
  onPresetsChange: (presets: Preset[], mode: PresetStorageMode) => void
}

export default function LibraryPage({ presets, mode, loading, onPresetsChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Las miniaturas necesitan las fuentes propias de cada preset declaradas.
  useEffect(() => {
    for (const p of presets) {
      const src = p.config.customFontData || p.config.customFontUrl
      if (p.config.customFontName && src) injectFontFace(p.config.customFontName, src)
    }
  }, [presets])

  const hasSession = document.cookie.split('; ').some((c) => c.startsWith('cg_auth='))

  const copyLink = async (preset: Preset) => {
    const url = buildOverlayUrl(preset.config)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopiedId(preset.id)
    window.setTimeout(() => setCopiedId(null), 1800)
  }

  const duplicate = async (preset: Preset) => {
    setBusyId(preset.id)
    const result = await savePreset(newPresetId(), `${preset.name} copia`, preset.config)
    onPresetsChange(result.presets, result.mode)
    setBusyId(null)
  }

  const remove = async (preset: Preset) => {
    if (!confirm(`¿Borrar "${preset.name}"? No se puede deshacer.`)) return
    setBusyId(preset.id)
    const result = await deletePreset(preset.id)
    onPresetsChange(result.presets, result.mode)
    setBusyId(null)
  }

  return (
    <div className="library">
      <header className="lib-head">
        <div className="lib-head-left">
          <span className="mark">
            <i />
            Chat Generator
          </span>
          <h1>
            Tus
            <br />
            presets
          </h1>
        </div>

        <div className="lib-head-right">
          <p className="lib-store">
            {loading
              ? 'Buscando tus presets…'
              : mode === 'cloud'
                ? 'Guardados en tu cuenta. Entrás desde cualquier computadora y están.'
                : 'Guardados en este navegador. Publicá el sitio en Netlify para que te sigan a cualquier computadora.'}
          </p>
          <div className="lib-head-actions">
            <button type="button" className="btn btn-primary" onClick={() => navigate('/new')}>
              <Plus size={15} weight="bold" />
              Nuevo preset
            </button>
            {hasSession && (
              <a className="btn btn-ghost" href="/?logout=1">
                <SignOut size={15} />
                Salir
              </a>
            )}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="lib-grid">
          {[0, 1, 2].map((i) => (
            <div className="card card-skeleton" key={i}>
              <div className="thumb" />
              <div className="card-body">
                <span className="skel-line" />
                <span className="skel-line short" />
              </div>
            </div>
          ))}
        </div>
      ) : presets.length === 0 ? (
        <div className="empty">
          <div className="empty-art" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h2>Todavía no hay ningún preset</h2>
          <p>
            Un preset guarda un chat entero: la fuente, los colores, la rotación y el ritmo de los
            mensajes. Creá el primero y después lo abrís cuando quieras, desde donde quieras.
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate('/new')}>
            <Plus size={17} weight="bold" />
            Crear mi primer preset
          </button>
        </div>
      ) : (
        <div className="lib-grid">
          {presets.map((preset) => {
            const scale = Math.min(
              THUMB_W / preset.config.width,
              THUMB_H / preset.config.height,
            )
            return (
              <article className={`card ${busyId === preset.id ? 'is-busy' : ''}`} key={preset.id}>
                <button
                  type="button"
                  className="thumb"
                  onClick={() => navigate(`/edit/${encodeURIComponent(preset.id)}`)}
                  aria-label={`Abrir ${preset.name}`}
                >
                  <span
                    className="thumb-inner"
                    style={{
                      width: preset.config.width,
                      height: preset.config.height,
                      transform: `scale(${scale})`,
                    }}
                  >
                    <ChatOverlay config={preset.config} messages={THUMB_MESSAGES} />
                  </span>
                  <span className="thumb-open">
                    Abrir
                    <ArrowSquareOut size={13} weight="bold" />
                  </span>
                </button>

                <div className="card-body">
                  <h3>{preset.name}</h3>
                  <p className="meta">
                    <span className="readout">
                      {preset.config.width} × {preset.config.height}
                    </span>
                    <span className="meta-sep" />
                    <span className="readout faint">{sinceLabel(preset.updatedAt)}</span>
                  </p>
                </div>

                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void copyLink(preset)}
                  >
                    {copiedId === preset.id ? (
                      <Check size={14} weight="bold" />
                    ) : (
                      <LinkSimple size={14} weight="bold" />
                    )}
                    {copiedId === preset.id ? 'Copiado' : 'Link OBS'}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Duplicar"
                    onClick={() => void duplicate(preset)}
                  >
                    <CopySimple size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    title="Borrar"
                    onClick={() => void remove(preset)}
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </article>
            )
          })}

          <button type="button" className="card card-new" onClick={() => navigate('/new')}>
            <Plus size={26} weight="bold" />
            <b>Nuevo preset</b>
            <span>Arrancá de cero</span>
          </button>
        </div>
      )}
    </div>
  )
}
