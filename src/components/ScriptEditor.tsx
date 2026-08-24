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
      {lines.map((line, i) => (
        <div className="script-line" key={line.id}>
          <div className="script-line-top">
            <input
              className="script-user"
              value={line.user}
              placeholder="usuario"
              onChange={(e) => update(line.id, { user: e.target.value })}
            />
            <input
              type="color"
              value={line.color ?? '#9146FF'}
              title="Color del nombre"
              onChange={(e) => update(line.id, { color: e.target.value })}
            />
            <div className="script-actions">
              <button type="button" onClick={() => move(i, -1)} title="Subir" disabled={i === 0}>
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                title="Bajar"
                disabled={i === lines.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                className="danger"
                title="Borrar"
                onClick={() => onChange(lines.filter((l) => l.id !== line.id))}
              >
                ✕
              </button>
            </div>
          </div>

          <textarea
            className="script-text"
            rows={2}
            value={line.text}
            placeholder="Mensaje…"
            onChange={(e) => update(line.id, { text: e.target.value })}
          />

          <div className="script-badges">
            {BADGE_IDS.map((b) => (
              <button
                key={b}
                type="button"
                className={`badge-chip ${line.badges?.includes(b) ? 'on' : ''}`}
                style={line.badges?.includes(b) ? { background: BADGE_STYLES[b].bg } : undefined}
                onClick={() => toggleBadge(line, b)}
              >
                {BADGE_STYLES[b].short} {BADGE_STYLES[b].label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="script-footer">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onChange([...lines, { id: newId(), user: '', text: '', badges: [] }])}
        >
          + Agregar mensaje
        </button>
        <button type="button" className="btn-ghost" onClick={() => onChange([])}>
          Vaciar
        </button>
      </div>
    </div>
  )
}
