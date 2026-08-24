import { ArrowDown, ArrowUp, Plus, Trash } from '@phosphor-icons/react'
import { BADGE_IDS, BADGE_STYLES } from './Badge'
import type { BadgeId, ScriptLine } from '../types'

interface Props {
  lines: ScriptLine[]
  onChange: (lines: ScriptLine[]) => void
}

let seq = 0
const newId = () => `l${Date.now().toString(36)}-${seq++}`

export default function ScriptEditor({ lines, onChange }: Props) {
  const update = (id: string, patch: Partial<ScriptLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const toggleBadge = (line: ScriptLine, badge: BadgeId) => {
    const current = line.badges ?? []
    update(line.id, {
      badges: current.includes(badge) ? current.filter((b) => b !== badge) : [...current, badge],
    })
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= lines.length) return
    const next = [...lines]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="script">
      {lines.length === 0 && (
        <p className="script-empty">
          Todavía no hay mensajes propios. Agregá el primero y va a empezar a aparecer en la
          preview.
        </p>
      )}

      {lines.map((line, i) => (
        <div className="script-line" key={line.id}>
          <div className="script-line-top">
            <input
              className="script-user"
              value={line.user}
              placeholder="usuario"
              onChange={(e) => update(line.id, { user: e.target.value })}
            />
            <span className="swatch" style={{ background: line.color ?? '#9146FF' }}>
              <input
                type="color"
                value={line.color ?? '#9146FF'}
                title="Color del nombre"
                onChange={(e) => update(line.id, { color: e.target.value })}
              />
            </span>
            <div className="script-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => move(i, -1)}
                title="Subir"
                disabled={i === 0}
              >
                <ArrowUp size={13} weight="bold" />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => move(i, 1)}
                title="Bajar"
                disabled={i === lines.length - 1}
              >
                <ArrowDown size={13} weight="bold" />
              </button>
              <button
                type="button"
                className="icon-btn danger"
                title="Borrar"
                onClick={() => onChange(lines.filter((l) => l.id !== line.id))}
              >
                <Trash size={13} />
              </button>
            </div>
          </div>

          <textarea
            rows={2}
            value={line.text}
            placeholder="Mensaje…"
            onChange={(e) => update(line.id, { text: e.target.value })}
          />

          <div className="script-badges">
            {BADGE_IDS.map((b) => {
              const { Glyph, label, bg } = BADGE_STYLES[b]
              const on = line.badges?.includes(b)
              return (
                <button
                  key={b}
                  type="button"
                  className={`badge-chip ${on ? 'on' : ''}`}
                  style={on ? { background: bg } : undefined}
                  onClick={() => toggleBadge(line, b)}
                >
                  <Glyph size={11} weight="fill" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="script-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange([...lines, { id: newId(), user: '', text: '', badges: [] }])}
        >
          <Plus size={14} weight="bold" />
          Agregar mensaje
        </button>
        {lines.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>
            Vaciar
          </button>
        )}
      </div>
    </div>
  )
}
