import { useRef, useState } from 'react'
import { CUSTOM_FONT_FAMILY } from '../fonts'
import { clearFont, injectFontFace, readFileAsDataUrl, removeFontFace, saveFont } from '../lib/fontStore'
import type { ChatConfig } from '../types'

/** Un data URL más largo que esto hace que el link para OBS sea incómodo de manejar. */
const URL_WARN_BYTES = 400 * 1024
const HARD_LIMIT_BYTES = 2 * 1024 * 1024

interface Props {
  config: ChatConfig
  patch: (p: Partial<ChatConfig>) => void
}

function prettySize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function CustomFontUploader({ config, patch }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [size, setSize] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = async (file: File) => {
    setError(null)

    if (!/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/.test(file.name)) {
      setError('Formato no soportado. Subí un archivo .ttf, .otf, .woff o .woff2.')
      return
    }
    if (file.size > HARD_LIMIT_BYTES) {
      setError(`La fuente pesa ${prettySize(file.size)}. El máximo es 2 MB — convertila a .woff2 y va a pesar mucho menos.`)
      return
    }

    setBusy(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '')

      injectFontFace(name, dataUrl)
      await saveFont({ name, dataUrl, size: file.size })
      setSize(file.size)

      patch({
        fontFamily: CUSTOM_FONT_FAMILY,
        customFontName: name,
        customFontData: dataUrl,
        customFontUrl: undefined,
      })
    } catch {
      setError('No se pudo leer el archivo. Probá con otro.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    removeFontFace()
    await clearFont()
    setSize(null)
    patch({
      customFontName: undefined,
      customFontData: undefined,
      fontFamily: config.fontFamily === CUSTOM_FONT_FAMILY ? 'Inter' : config.fontFamily,
    })
  }

  const active = Boolean(config.customFontName)
  const dataBytes = config.customFontData
    ? Math.round((config.customFontData.length * 3) / 4)
    : (size ?? 0)

  return (
    <div className="uploader">
      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
        <strong>{busy ? 'Cargando…' : 'Subí tu .ttf'}</strong>
        <span>Arrastrá el archivo o hacé clic. También acepta .otf, .woff y .woff2</span>
      </div>

      {error && <p className="uploader-error">{error}</p>}

      {active && (
        <div className="uploader-active">
          <div className="uploader-file">
            <span className="dot" />
            <div>
              <b>{config.customFontName}</b>
              <small>{dataBytes ? prettySize(dataBytes) : 'guardada'}</small>
            </div>
            <button type="button" className="btn-ghost" onClick={() => void remove()}>
              Quitar
            </button>
          </div>

          <p
            className="uploader-preview"
            style={{ fontFamily: `"${config.customFontName}", sans-serif` }}
          >
            Hola chat! Así se ven tus mensajes 1234
          </p>

          {config.fontFamily !== CUSTOM_FONT_FAMILY && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => patch({ fontFamily: CUSTOM_FONT_FAMILY })}
            >
              Usar esta fuente en el chat
            </button>
          )}

          {dataBytes > URL_WARN_BYTES && (
            <p className="uploader-warn">
              La fuente pesa {prettySize(dataBytes)} y viaja embebida en el link de OBS, así que el
              link va a quedar larguísimo. Funciona igual, pero si podés convertila a <b>.woff2</b>{' '}
              (suele bajar a menos de 100 KB) y volvé a subirla.
            </p>
          )}
        </div>
      )}

      <div className="uploader-alt">
        <label className="row row-wide">
          <span className="row-label">…o pegá la URL de una fuente ya hosteada</span>
          <input
            type="url"
            placeholder="https://misitio.com/mifuente.woff2"
            value={config.customFontUrl ?? ''}
            onChange={(e) => {
              const url = e.target.value.trim()
              patch({
                customFontUrl: url || undefined,
                customFontData: url ? undefined : config.customFontData,
                customFontName: url ? (config.customFontName || 'Fuente remota') : config.customFontName,
                fontFamily: url ? CUSTOM_FONT_FAMILY : config.fontFamily,
              })
              if (url) injectFontFace(config.customFontName || 'Fuente remota', url)
            }}
          />
        </label>
        <small className="hint">
          Con una URL el link para OBS queda corto. El archivo tiene que servirse por HTTPS y con
          CORS abierto (Google Fonts, jsDelivr, tu propio hosting…).
        </small>
      </div>
    </div>
  )
}
