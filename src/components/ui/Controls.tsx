import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Bloque de controles con encabezado propio. Ya no colapsa: la navegación
 * lateral hace el agrupado grueso, así que acá alcanza con separar por aire
 * y una hairline en vez de meter un acordeón adentro de otro.
 */
export function Section({
  title,
  hint,
  children,
}: {
  title?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="block">
      {title && (
        <header className="block-head">
          <h3>{title}</h3>
          {hint && <span className="block-hint">{hint}</span>}
        </header>
      )}
      <div className="block-body">{children}</div>
    </section>
  )
}

export function Row({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`row ${wide ? 'row-wide' : ''}`}>
      <span className="row-label">{label}</span>
      <span className="row-control">{children}</span>
    </label>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="row row-slider">
      <span className="row-label">
        {label}
        <output className="readout">
          {value}
          {suffix}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-control swatch-control">
        <span className="swatch" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        </span>
        <input
          type="text"
          className="hex"
          spellCheck={false}
          value={value.toUpperCase()}
          onChange={(e) => {
            const v = e.target.value.trim()
            if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) onChange(v.startsWith('#') ? v : '#' + v)
          }}
        />
      </span>
    </div>
  )
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <Row label={label} wide>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  )
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="row row-toggle">
      <span className="row-label">{label}</span>
      <span className={`switch ${value ? 'on' : ''}`}>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <i />
      </span>
    </label>
  )
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="row row-wide">
      {label && <span className="row-label">{label}</span>}
      <div className="segmented" role="group">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            className={value === o.value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Campo numérico editable a mano.
 *
 * Mientras se escribe se guarda el texto tal cual (`draft`) en vez de empujar
 * un número por cada tecla: si no, borrar el campo lo dejaba en el mínimo al
 * instante y no había forma de cambiar 480 por 1280 sin pelearse con el input.
 * El valor real se confirma al salir del campo o con Enter.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    const n = Number(draft.trim())
    // Vacío o basura: vuelve al último valor válido, no al mínimo.
    if (draft.trim() !== '' && Number.isFinite(n)) {
      onChange(Math.min(max, Math.max(min, Math.round(n))))
    }
    setDraft(null)
  }

  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <span className="row-control stepper">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setDraft(null)
            }
          }}
        />
        {suffix && <span className="stepper-suffix">{suffix}</span>}
      </span>
    </label>
  )
}
