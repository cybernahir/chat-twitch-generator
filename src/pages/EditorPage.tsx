import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowSquareOut,
  Cards,
  ChatCircleDots,
  Check,
  Copy,
  Crop,
  CubeTransparent,
  FloppyDisk,
  Pause,
  Play,
  TextAa,
  UploadSimple,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChatOverlay from '../components/ChatOverlay'
import CustomFontUploader from '../components/CustomFontUploader'
import FontPicker from '../components/FontPicker'
import ScriptEditor from '../components/ScriptEditor'
import {
  ColorInput,
  NumberField,
  Section,
  SegmentedControl,
  Select,
  Slider,
  Toggle,
} from '../components/ui/Controls'
import { DEFAULT_CONFIG } from '../defaults'
import { CUSTOM_FONT_FAMILY } from '../fonts'
import { buildOverlayUrl } from '../lib/encode'
import { injectFontFace, loadFont } from '../lib/fontStore'
import { newPresetId, savePreset } from '../lib/presetStore'
import { useChatFeed } from '../lib/useChatFeed'
import { navigate } from '../lib/useHashRoute'
import type { AnimationType, ChatConfig, Preset, PresetStorageMode } from '../types'

type GroupId = 'mensajes' | 'texto' | 'fuente' | 'burbuja' | 'escena' | 'lienzo'

const GROUPS: { id: GroupId; label: string; Glyph: Icon; hint: string }[] = [
  { id: 'mensajes', label: 'Mensajes', Glyph: ChatCircleDots, hint: 'Qué se dice y a qué ritmo' },
  { id: 'texto', label: 'Texto', Glyph: TextAa, hint: 'Fuente, color, contorno' },
  { id: 'fuente', label: 'Tu fuente', Glyph: UploadSimple, hint: 'Subí el .ttf de tu marca' },
  { id: 'burbuja', label: 'Burbuja', Glyph: Cards, hint: 'La caja de cada mensaje' },
  { id: 'escena', label: 'Escena', Glyph: CubeTransparent, hint: 'Rotación, posición, entrada' },
  { id: 'lienzo', label: 'Lienzo', Glyph: Crop, hint: 'El tamaño que va en OBS' },
]

function snapshotOf(name: string, config: ChatConfig): string {
  return JSON.stringify({ name, config })
}

interface Props {
  /** `null` cuando se está creando uno nuevo y todavía no se guardó. */
  presetId: string | null
  presets: Preset[]
  loading: boolean
  onPresetsChange: (presets: Preset[], mode: PresetStorageMode) => void
}

export default function EditorPage({ presetId, presets, loading, onPresetsChange }: Props) {
  const [config, setConfig] = useState<ChatConfig>(DEFAULT_CONFIG)
  const [name, setName] = useState('Preset sin nombre')
  const [snapshot, setSnapshot] = useState(() => snapshotOf('Preset sin nombre', DEFAULT_CONFIG))
  const [hydrated, setHydrated] = useState(presetId === null)
  const [saving, setSaving] = useState(false)

  const [group, setGroup] = useState<GroupId>('mensajes')
  const [copied, setCopied] = useState(false)
  const [running, setRunning] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 })

  const patch = useCallback((p: Partial<ChatConfig>) => setConfig((c) => ({ ...c, ...p })), [])

  // Cargamos el preset apenas llega el listado. Puede tardar: la lista viaja
  // desde el servidor y el editor se monta antes de que responda.
  useEffect(() => {
    if (hydrated || loading) return

    const found = presets.find((p) => p.id === presetId)
    if (!found) {
      // El preset ya no existe (lo borraron o el link quedó viejo).
      navigate('/')
      return
    }

    // Mezclamos contra los valores por defecto por si el preset es de una
    // versión anterior a la que le falten campos nuevos.
    const merged = { ...DEFAULT_CONFIG, ...found.config, v: 1 as const }
    setConfig(merged)
    setName(found.name)
    setSnapshot(snapshotOf(found.name, merged))
    setHydrated(true)
  }, [hydrated, loading, presets, presetId])

  // Recuperamos la fuente subida en una sesión anterior.
  useEffect(() => {
    void loadFont().then((font) => {
      if (!font) return
      injectFontFace(font.name, font.dataUrl)
      setConfig((c) =>
        c.customFontName === font.name && !c.customFontData
          ? { ...c, customFontData: font.dataUrl }
          : c,
      )
    })
  }, [])

  const dirty = hydrated && snapshotOf(name, config) !== snapshot

  // Nada de autoguardado: el streamer decide cuándo pisar el preset. Pero si se
  // va con cambios sin guardar, el navegador le pregunta antes de perderlos.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = async () => {
    setSaving(true)
    const id = presetId ?? newPresetId()
    const finalName = name.trim() || 'Preset sin nombre'

    const result = await savePreset(id, finalName, config)
    onPresetsChange(result.presets, result.mode)

    setName(finalName)
    setSnapshot(snapshotOf(finalName, config))
    setSaving(false)

    // Al guardar uno nuevo pasamos a su URL, así un refresh lo sigue abriendo.
    if (!presetId) navigate(`/edit/${encodeURIComponent(id)}`)
  }

  const leave = () => {
    if (dirty && !confirm('Tenés cambios sin guardar. ¿Salir igual?')) return
    navigate('/')
  }

  // Escalamos la preview para que el lienzo entre siempre en pantalla.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setStageBox({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const previewScale = useMemo(() => {
    if (!stageBox.w || !stageBox.h) return 1
    return Math.min(1, stageBox.w / config.width, stageBox.h / config.height)
  }, [stageBox, config.width, config.height])

  const messages = useChatFeed(config, running)
  const overlayUrl = useMemo(() => buildOverlayUrl(config), [config])

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = overlayUrl
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const hasCustomFont = Boolean(config.customFontName && (config.customFontData || config.customFontUrl))
  const active = GROUPS.find((g) => g.id === group)!

  return (
    <div className="editor">
      <header className="topbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={leave}>
          <ArrowLeft size={14} weight="bold" />
          Presets
        </button>

        <input
          className="doc-name"
          value={name}
          spellCheck={false}
          placeholder="Nombre del preset"
          aria-label="Nombre del preset"
          onChange={(e) => setName(e.target.value)}
        />

        <span className={`save-state ${dirty ? 'is-dirty' : ''}`}>
          {saving ? 'Guardando…' : dirty ? 'Sin guardar' : 'Guardado'}
        </span>

        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void save()}
          disabled={saving || (!dirty && presetId !== null)}
        >
          <FloppyDisk size={15} weight="bold" />
          Guardar preset
        </button>
      </header>

      <div className="app">
      <nav className="rail" aria-label="Secciones del editor">

        <ul className="rail-list">
          {GROUPS.map(({ id, label, Glyph }) => (
            <li key={id}>
              <button
                type="button"
                className={`rail-btn ${group === id ? 'active' : ''}`}
                aria-current={group === id}
                onClick={() => setGroup(id)}
              >
                <Glyph size={21} weight={group === id ? 'fill' : 'regular'} />
                <span className="rail-tip">{label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="rail-foot">
          <button
            type="button"
            className="rail-btn"
            onClick={() => {
              if (confirm('¿Volver a los valores por defecto? Se pierde la configuración actual.')) {
                setConfig({
                  ...DEFAULT_CONFIG,
                  customFontName: config.customFontName,
                  customFontData: config.customFontData,
                })
              }
            }}
          >
            <ArrowCounterClockwise size={20} />
            <span className="rail-tip">Restablecer</span>
          </button>
        </div>
      </nav>

      <aside className="panel">
        <header className="panel-head">
          <h2>{active.label}</h2>
          <p>{active.hint}</p>
        </header>

        <div className="panel-scroll" key={group}>
          {group === 'mensajes' && (
            <>
              <Section>
                <SegmentedControl
                  label="De dónde salen"
                  value={config.source}
                  onChange={(v) => patch({ source: v })}
                  options={[
                    { value: 'random', label: 'Aleatorios' },
                    { value: 'script', label: 'Los míos' },
                  ]}
                />
                <Slider
                  label="Uno cada"
                  min={200}
                  max={8000}
                  step={100}
                  suffix=" ms"
                  value={config.messageInterval}
                  onChange={(v) => patch({ messageInterval: v })}
                />
                <Slider
                  label="Variación del ritmo"
                  min={0}
                  max={100}
                  suffix=" %"
                  value={config.intervalJitter}
                  onChange={(v) => patch({ intervalJitter: v })}
                />
                <Slider
                  label="En pantalla"
                  min={1}
                  max={40}
                  value={config.maxMessages}
                  onChange={(v) => patch({ maxMessages: v })}
                />
                <Slider
                  label="Borrar tras"
                  min={0}
                  max={120}
                  suffix={config.fadeOutAfter ? ' s' : ' nunca'}
                  value={config.fadeOutAfter}
                  onChange={(v) => patch({ fadeOutAfter: v })}
                />
              </Section>

              {config.source === 'script' && (
                <Section title="Tu guion" hint={`${config.script.length} mensajes`}>
                  <Toggle
                    label="Repetir en bucle"
                    value={config.loopScript}
                    onChange={(v) => patch({ loopScript: v })}
                  />
                  <ScriptEditor lines={config.script} onChange={(script) => patch({ script })} />
                </Section>
              )}
            </>
          )}

          {group === 'texto' && (
            <>
              <Section>
                <FontPicker
                  value={config.fontFamily}
                  customFontName={config.customFontName}
                  hasCustomFont={hasCustomFont}
                  onChange={(fontFamily) => patch({ fontFamily })}
                />
                <Slider
                  label="Tamaño"
                  min={10}
                  max={80}
                  suffix=" px"
                  value={config.fontSize}
                  onChange={(v) => patch({ fontSize: v })}
                />
                <Slider
                  label="Grosor"
                  min={100}
                  max={900}
                  step={100}
                  value={config.fontWeight}
                  onChange={(v) => patch({ fontWeight: v })}
                />
                <Slider
                  label="Interlineado"
                  min={0.9}
                  max={2.2}
                  step={0.05}
                  value={config.lineHeight}
                  onChange={(v) => patch({ lineHeight: v })}
                />
                <Slider
                  label="Entre letras"
                  min={-2}
                  max={10}
                  step={0.5}
                  suffix=" px"
                  value={config.letterSpacing}
                  onChange={(v) => patch({ letterSpacing: v })}
                />
                <ColorInput
                  label="Color del texto"
                  value={config.textColor}
                  onChange={(v) => patch({ textColor: v })}
                />
              </Section>

              <Section title="Nombre de usuario">
                <Select
                  label="Cómo se colorea"
                  value={config.usernameColorMode}
                  onChange={(v) => patch({ usernameColorMode: v })}
                  options={[
                    { value: 'twitch', label: 'Como Twitch, uno por usuario' },
                    { value: 'fixed', label: 'Un color fijo' },
                    { value: 'inherit', label: 'Igual que el texto' },
                  ]}
                />
                {config.usernameColorMode === 'fixed' && (
                  <ColorInput
                    label="Color fijo"
                    value={config.usernameColor}
                    onChange={(v) => patch({ usernameColor: v })}
                  />
                )}
                <Slider
                  label="Grosor"
                  min={100}
                  max={900}
                  step={100}
                  value={config.usernameWeight}
                  onChange={(v) => patch({ usernameWeight: v })}
                />
                <Toggle
                  label="En mayúsculas"
                  value={config.uppercaseName}
                  onChange={(v) => patch({ uppercaseName: v })}
                />
                <Toggle
                  label="En su propia línea"
                  value={config.nameOnOwnLine}
                  onChange={(v) => patch({ nameOnOwnLine: v })}
                />
                <Toggle
                  label="Dos puntos al final"
                  value={config.showColon}
                  onChange={(v) => patch({ showColon: v })}
                />
              </Section>

              <Section title="Contorno y sombra">
                <Slider
                  label="Contorno"
                  min={0}
                  max={6}
                  step={0.5}
                  suffix=" px"
                  value={config.outlineWidth}
                  onChange={(v) => patch({ outlineWidth: v })}
                />
                {config.outlineWidth > 0 && (
                  <ColorInput
                    label="Color del contorno"
                    value={config.outlineColor}
                    onChange={(v) => patch({ outlineColor: v })}
                  />
                )}
                <Slider
                  label="Desenfoque"
                  min={0}
                  max={24}
                  suffix=" px"
                  value={config.shadowBlur}
                  onChange={(v) => patch({ shadowBlur: v })}
                />
                <ColorInput
                  label="Color de la sombra"
                  value={config.shadowColor}
                  onChange={(v) => patch({ shadowColor: v })}
                />
              </Section>
            </>
          )}

          {group === 'fuente' && (
            <Section>
              <CustomFontUploader config={config} patch={patch} />
            </Section>
          )}

          {group === 'burbuja' && (
            <>
              <Section>
                <SegmentedControl
                  label="Estilo"
                  value={config.layout}
                  onChange={(v) => patch({ layout: v })}
                  options={[
                    { value: 'bubble', label: 'Con fondo' },
                    { value: 'flat', label: 'Sin fondo' },
                  ]}
                />
                <ColorInput
                  label="Color de fondo"
                  value={config.bgColor}
                  onChange={(v) => patch({ bgColor: v })}
                />
                <Slider
                  label="Opacidad"
                  min={0}
                  max={100}
                  suffix=" %"
                  value={config.bgOpacity}
                  onChange={(v) => patch({ bgOpacity: v })}
                />
                <Slider
                  label="Redondeo"
                  min={0}
                  max={40}
                  suffix=" px"
                  value={config.radius}
                  onChange={(v) => patch({ radius: v })}
                />
                <Slider
                  label="Padding lateral"
                  min={0}
                  max={40}
                  suffix=" px"
                  value={config.padX}
                  onChange={(v) => patch({ padX: v })}
                />
                <Slider
                  label="Padding arriba y abajo"
                  min={0}
                  max={40}
                  suffix=" px"
                  value={config.padY}
                  onChange={(v) => patch({ padY: v })}
                />
                <Slider
                  label="Entre mensajes"
                  min={0}
                  max={40}
                  suffix=" px"
                  value={config.gap}
                  onChange={(v) => patch({ gap: v })}
                />
                <Slider
                  label="Ancho máximo"
                  min={30}
                  max={100}
                  suffix=" %"
                  value={config.maxWidth}
                  onChange={(v) => patch({ maxWidth: v })}
                />
                <Toggle
                  label="Se ajusta al texto"
                  value={config.fitContent}
                  onChange={(v) => patch({ fitContent: v })}
                />
                <Slider
                  label="Borde"
                  min={0}
                  max={8}
                  suffix=" px"
                  value={config.borderWidth}
                  onChange={(v) => patch({ borderWidth: v })}
                />
                {config.borderWidth > 0 && (
                  <ColorInput
                    label="Color del borde"
                    value={config.borderColor}
                    onChange={(v) => patch({ borderColor: v })}
                  />
                )}
                <Slider
                  label="Sombra"
                  min={0}
                  max={40}
                  suffix=" px"
                  value={config.boxShadow}
                  onChange={(v) => patch({ boxShadow: v })}
                />
              </Section>

              <Section title="Avatar e insignias">
                <Toggle
                  label="Mostrar avatar"
                  value={config.showAvatars}
                  onChange={(v) => patch({ showAvatars: v })}
                />
                {config.showAvatars && (
                  <Slider
                    label="Tamaño del avatar"
                    min={12}
                    max={64}
                    suffix=" px"
                    value={config.avatarSize}
                    onChange={(v) => patch({ avatarSize: v })}
                  />
                )}
                <Toggle
                  label="Mostrar insignias"
                  value={config.showBadges}
                  onChange={(v) => patch({ showBadges: v })}
                />
                {config.showBadges && (
                  <Slider
                    label="Tamaño de insignias"
                    min={10}
                    max={40}
                    suffix=" px"
                    value={config.badgeSize}
                    onChange={(v) => patch({ badgeSize: v })}
                  />
                )}
              </Section>
            </>
          )}

          {group === 'escena' && (
            <>
              <Section title="Rotación">
                <Slider
                  label="Girar"
                  min={-180}
                  max={180}
                  suffix="°"
                  value={config.rotateZ}
                  onChange={(v) => patch({ rotateZ: v })}
                />
                <Slider
                  label="Inclinar"
                  min={-80}
                  max={80}
                  suffix="°"
                  value={config.rotateX}
                  onChange={(v) => patch({ rotateX: v })}
                />
                <Slider
                  label="Voltear"
                  min={-80}
                  max={80}
                  suffix="°"
                  value={config.rotateY}
                  onChange={(v) => patch({ rotateY: v })}
                />
                <Slider
                  label="Perspectiva"
                  min={200}
                  max={3000}
                  step={50}
                  suffix=" px"
                  value={config.perspective}
                  onChange={(v) => patch({ perspective: v })}
                />
                <Slider
                  label="Escala"
                  min={0.3}
                  max={2}
                  step={0.05}
                  suffix="x"
                  value={config.scale}
                  onChange={(v) => patch({ scale: v })}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => patch({ rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 })}
                >
                  Enderezar todo
                </button>
              </Section>

              <Section title="Posición y entrada">
                <SegmentedControl
                  label="Dirección"
                  value={config.direction}
                  onChange={(v) => patch({ direction: v })}
                  options={[
                    { value: 'bottom', label: 'Hacia arriba' },
                    { value: 'top', label: 'Hacia abajo' },
                  ]}
                />
                <SegmentedControl
                  label="Alineación"
                  value={config.align}
                  onChange={(v) => patch({ align: v })}
                  options={[
                    { value: 'left', label: 'Izq.' },
                    { value: 'center', label: 'Centro' },
                    { value: 'right', label: 'Der.' },
                  ]}
                />
                <Select
                  label="Animación de entrada"
                  value={config.animation}
                  onChange={(v) => patch({ animation: v as AnimationType })}
                  options={[
                    { value: 'slide-left', label: 'Desde la izquierda' },
                    { value: 'slide-right', label: 'Desde la derecha' },
                    { value: 'slide-up', label: 'Desde abajo' },
                    { value: 'fade', label: 'Aparecer' },
                    { value: 'pop', label: 'Rebote' },
                    { value: 'none', label: 'Sin animación' },
                  ]}
                />
                <Slider
                  label="Duración"
                  min={0}
                  max={1500}
                  step={50}
                  suffix=" ms"
                  value={config.animationDuration}
                  onChange={(v) => patch({ animationDuration: v })}
                />
              </Section>
            </>
          )}

          {group === 'lienzo' && (
            <Section hint="Usá los mismos valores en OBS">
              <NumberField
                label="Ancho"
                min={100}
                max={3840}
                suffix="px"
                value={config.width}
                onChange={(v) => patch({ width: v })}
              />
              <NumberField
                label="Alto"
                min={100}
                max={2160}
                suffix="px"
                value={config.height}
                onChange={(v) => patch({ height: v })}
              />
              <div className="preset-grid">
                {[
                  { label: 'Vertical', w: 480, h: 720 },
                  { label: 'Angosto', w: 380, h: 900 },
                  { label: 'Banda', w: 1280, h: 220 },
                  { label: 'Cuadrado', w: 600, h: 600 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`preset ${config.width === p.w && config.height === p.h ? 'active' : ''}`}
                    onClick={() => patch({ width: p.w, height: p.h })}
                  >
                    <b>{p.label}</b>
                    <span className="readout">
                      {p.w} × {p.h}
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>
      </aside>

      <main className="canvas">
        <div className="canvas-bar">
          <div className="canvas-meta">
            <span className="readout strong">
              {config.width} × {config.height}
            </span>
            <span className="readout faint">{Math.round(previewScale * 100)} %</span>
          </div>

          <SegmentedControl
            value={config.previewBg}
            onChange={(v) => patch({ previewBg: v })}
            options={[
              { value: 'checker', label: 'Damero' },
              { value: 'dark', label: 'Oscuro' },
              { value: 'light', label: 'Claro' },
              { value: 'green', label: 'Croma' },
            ]}
          />

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setRunning((r) => !r)}
          >
            {running ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
            {running ? 'Pausar' : 'Reanudar'}
          </button>
        </div>

        <div className={`stage stage-${config.previewBg}`} ref={stageRef}>
          <div
            className="stage-frame"
            style={{
              width: config.width,
              height: config.height,
              transform: `scale(${previewScale})`,
            }}
          >
            <ChatOverlay config={config} messages={messages} />
          </div>
        </div>

        <footer className="export">
          <div className="export-main">
            <div className="url-field">
              <input readOnly value={overlayUrl} onFocus={(e) => e.target.select()} />
              <span className="readout faint">{overlayUrl.length.toLocaleString('es-AR')}</span>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void copyUrl()}>
              {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
            <a className="btn btn-ghost" href={overlayUrl} target="_blank" rel="noreferrer">
              <ArrowSquareOut size={16} />
              Abrir
            </a>
          </div>

          <ol className="export-steps">
            <li>
              <b>Copiá</b> el link de acá arriba.
            </li>
            <li>
              En OBS, <b>Fuentes → + → Navegador</b>.
            </li>
            <li>
              Pegalo en URL y poné{' '}
              <span className="readout">
                {config.width} × {config.height}
              </span>
              .
            </li>
            <li>
              Tildá <b>Apagar la fuente cuando no esté visible</b>.
            </li>
          </ol>

          {config.fontFamily === CUSTOM_FONT_FAMILY && config.customFontData && (
            <p className="export-note">
              Tu fuente viaja embebida en el link, por eso es tan largo. Copialo entero y OBS la va a
              mostrar igual que acá.
            </p>
          )}
        </footer>
      </main>
      </div>
    </div>
  )
}
