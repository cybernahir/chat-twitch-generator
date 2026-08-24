import type { ReactNode } from 'react'

export function Section({
  title,
  hint,
  children,
  defaultOpen = true,
}: {
  title: string
  hint?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {hint && <em>{hint}</em>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
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
  return (
    <div className="row row-slider">
      <span className="row-label">
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
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
      <span className="row-control color-control">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input
          type="text"
          className="hex"
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
    <Row label={label}>
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
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="row row-wide">
      <span className="row-label">{label}</span>
      <div className="segmented">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
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
