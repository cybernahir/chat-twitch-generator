import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChatOverlay from '../components/ChatOverlay'
import CustomFontUploader from '../components/CustomFontUploader'
import FontPicker from '../components/FontPicker'
import ScriptEditor from '../components/ScriptEditor'
import {
  ColorInput,
  Row,
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
import { useChatFeed } from '../lib/useChatFeed'
import type { AnimationType, ChatConfig } from '../types'

const STORAGE_KEY = 'chat-twitch-generator:config'

/**
 * El gate del borde deja una cookie legible (`cg_auth`) además de la de sesión,
 * que es HttpOnly. Sólo sirve para saber si mostrar el botón de salir: en `vite
 * dev`, donde no corre el gate, no existe y el botón no aparece.
 */
function hasSession(): boolean {
  return document.cookie.split('; ').some((c) => c.startsWith('cg_auth='))
}

function loadSaved(): ChatConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<ChatConfig>), v: 1 }
  } catch {
    return DEFAULT_CONFIG
  }
}

export default function EditorPage() {
  const [config, setConfig] = useState<ChatConfig>(loadSaved)
  const [copied, setCopied] = useState(false)
  const [running, setRunning] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 })

  const patch = useCallback((p: Partial<ChatConfig>) => setConfig((c) => ({ ...c, ...p })), [])

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      /* la fuente embebida puede pasarse del cupo de localStorage; no es crítico */
    }
  }, [config])

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          <div>
            <h1>Chat Twitch Generator</h1>
            <p>Chat simulado listo para OBS</p>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setRunning((r) => !r)}
            title="Pausar o reanudar la simulación"
          >
            {running ? '⏸ Pausar' : '▶ Reanudar'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (confirm('¿Volver a los valores por defecto? Se pierde la configuración actual.')) {
                setConfig({ ...DEFAULT_CONFIG, customFontName: config.customFontName, customFontData: config.customFontData })
              }
            }}
          >
            Restablecer
          </button>
          <a className="btn-secondary" href={overlayUrl} target="_blank" rel="noreferrer">
            Abrir overlay ↗
          </a>
          <button type="button" className="btn-primary" onClick={() => void copyUrl()}>
            {copied ? '✓ Link copiado' : 'Copiar link para OBS'}
          </button>
          {hasSession() && (
            <a className="btn-ghost" href="/?logout=1" title="Cerrar sesión">
              Salir
            </a>
          )}
        </div>
      </header>

      <main className="layout">
        <aside className="panel">
          <Section title="Contenido del chat">
            <SegmentedControl
              label="Mensajes"
              value={config.source}
              onChange={(v) => patch({ source: v })}
              options={[
                { value: 'random', label: 'Aleatorios' },
                { value: 'script', label: 'Míos' },
              ]}
            />
            <Slider
              label="Cada"
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
              label="Mensajes en pantalla"
              min={1}
              max={40}
              value={config.maxMessages}
              onChange={(v) => patch({ maxMessages: v })}
            />
            <Slider
              label="Borrar mensaje tras"
              min={0}
              max={120}
              suffix={config.fadeOutAfter ? ' s' : ' (nunca)'}
              value={config.fadeOutAfter}
              onChange={(v) => patch({ fadeOutAfter: v })}
            />

            {config.source === 'script' && (
              <>
                <Toggle
                  label="Repetir en bucle"
                  value={config.loopScript}
                  onChange={(v) => patch({ loopScript: v })}
                />
                <ScriptEditor lines={config.script} onChange={(script) => patch({ script })} />
              </>
            )}
          </Section>

          <Section title="Tipografía">
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
              label="Grosor del texto"
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
              label="Espaciado entre letras"
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
            <Select
              label="Color del nombre"
              value={config.usernameColorMode}
              onChange={(v) => patch({ usernameColorMode: v })}
              options={[
                { value: 'twitch', label: 'Como Twitch (uno por usuario)' },
                { value: 'fixed', label: 'Uno fijo' },
                { value: 'inherit', label: 'Igual que el texto' },
              ]}
            />
            {config.usernameColorMode === 'fixed' && (
              <ColorInput
                label="Color fijo del nombre"
                value={config.usernameColor}
                onChange={(v) => patch({ usernameColor: v })}
              />
            )}
            <Slider
              label="Grosor del nombre"
              min={100}
              max={900}
              step={100}
              value={config.usernameWeight}
              onChange={(v) => patch({ usernameWeight: v })}
            />
            <Toggle
              label="Nombre en mayúsculas"
              value={config.uppercaseName}
              onChange={(v) => patch({ uppercaseName: v })}
            />
            <Toggle
              label="Nombre en su propia línea"
              value={config.nameOnOwnLine}
              onChange={(v) => patch({ nameOnOwnLine: v })}
            />
            <Toggle
              label='Dos puntos tras el nombre'
              value={config.showColon}
              onChange={(v) => patch({ showColon: v })}
            />
          </Section>

          <Section title="Tu fuente (.ttf)" hint="para tu streamer">
            <CustomFontUploader config={config} patch={patch} />
          </Section>

          <Section title="Caja del mensaje">
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
              label="Opacidad del fondo"
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
              label="Padding horizontal"
              min={0}
              max={40}
              suffix=" px"
              value={config.padX}
              onChange={(v) => patch({ padX: v })}
            />
            <Slider
              label="Padding vertical"
              min={0}
              max={40}
              suffix=" px"
              value={config.padY}
              onChange={(v) => patch({ padY: v })}
            />
            <Slider
              label="Separación entre mensajes"
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
              label="La caja se ajusta al texto"
              value={config.fitContent}
              onChange={(v) => patch({ fitContent: v })}
            />
            <Slider
              label="Grosor del borde"
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
              label="Sombra de la caja"
              min={0}
              max={40}
              suffix=" px"
              value={config.boxShadow}
              onChange={(v) => patch({ boxShadow: v })}
            />
          </Section>

          <Section title="Contorno y sombra del texto" defaultOpen={false}>
            <Slider
              label="Contorno"
              min={0}
              max={6}
              step={0.5}
              suffix=" px"
              value={config.outlineWidth}
              onChange={(v) => patch({ outlineWidth: v })}
            />
            <ColorInput
              label="Color del contorno"
              value={config.outlineColor}
              onChange={(v) => patch({ outlineColor: v })}
            />
            <Slider
              label="Desenfoque de la sombra"
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

          <Section title="Avatares e insignias" defaultOpen={false}>
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
                label="Tamaño de las insignias"
                min={10}
                max={40}
                suffix=" px"
                value={config.badgeSize}
                onChange={(v) => patch({ badgeSize: v })}
              />
            )}
          </Section>

          <Section title="Rotación y perspectiva">
            <Slider
              label="Rotar (Z)"
              min={-180}
              max={180}
              suffix="°"
              value={config.rotateZ}
              onChange={(v) => patch({ rotateZ: v })}
            />
            <Slider
              label="Inclinar (X)"
              min={-80}
              max={80}
              suffix="°"
              value={config.rotateX}
              onChange={(v) => patch({ rotateX: v })}
            />
            <Slider
              label="Girar (Y)"
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
              className="btn-ghost full"
              onClick={() => patch({ rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1 })}
            >
              Enderezar todo
            </button>
          </Section>

          <Section title="Posición y animación">
            <SegmentedControl
              label="Dirección"
              value={config.direction}
              onChange={(v) => patch({ direction: v })}
              options={[
                { value: 'bottom', label: 'De abajo hacia arriba' },
                { value: 'top', label: 'De arriba hacia abajo' },
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
                { value: 'slide-left', label: 'Entrar desde la izquierda' },
                { value: 'slide-right', label: 'Entrar desde la derecha' },
                { value: 'slide-up', label: 'Entrar desde abajo' },
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

          <Section title="Tamaño del lienzo" hint="lo mismo que pongas en OBS">
            <Row label="Ancho">
              <input
                type="number"
                min={100}
                max={3840}
                value={config.width}
                onChange={(e) => patch({ width: Number(e.target.value) || 100 })}
              />
            </Row>
            <Row label="Alto">
              <input
                type="number"
                min={100}
                max={2160}
                value={config.height}
                onChange={(e) => patch({ height: Number(e.target.value) || 100 })}
              />
            </Row>
            <SegmentedControl
              label="Fondo de la preview"
              value={config.previewBg}
              onChange={(v) => patch({ previewBg: v })}
              options={[
                { value: 'checker', label: 'Damero' },
                { value: 'dark', label: 'Oscuro' },
                { value: 'light', label: 'Claro' },
                { value: 'green', label: 'Croma' },
              ]}
            />
          </Section>
        </aside>

        <section className="preview">
          <div className={`stage stage-${config.previewBg}`} ref={stageRef}>
            <ChatOverlay config={config} messages={messages} previewScale={previewScale} />
          </div>

          <div className="obs-help">
            <h3>Cómo ponerlo en OBS</h3>
            <ol>
              <li>
                Copiá el link con el botón <b>Copiar link para OBS</b>.
              </li>
              <li>
                En OBS: <b>Fuentes → + → Navegador</b>.
              </li>
              <li>
                Pegá el link en <b>URL</b> y poné{' '}
                <b>
                  {config.width} × {config.height}
                </b>{' '}
                en ancho y alto.
              </li>
              <li>
                Dejá tildado <b>Apagar la fuente cuando no esté visible</b> para que el chat arranque
                de cero cada vez.
              </li>
            </ol>
            <div className="url-box">
              <input readOnly value={overlayUrl} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn-primary" onClick={() => void copyUrl()}>
                {copied ? '✓' : 'Copiar'}
              </button>
            </div>
            <small className="hint">
              {config.fontFamily === CUSTOM_FONT_FAMILY && config.customFontData
                ? 'Tu fuente viaja embebida en el link, por eso es tan largo: copialo entero y OBS la va a mostrar igual que acá.'
                : `Largo del link: ${overlayUrl.length.toLocaleString('es-AR')} caracteres.`}
            </small>
          </div>
        </section>
      </main>
    </div>
  )
}
