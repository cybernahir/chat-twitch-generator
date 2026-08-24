import { useEffect, useMemo } from 'react'
import { CUSTOM_FONT_FAMILY, ensureGoogleFont, fontStack } from '../fonts'
import { injectFontFace } from '../lib/fontStore'
import type { ChatConfig, ChatMessage } from '../types'
import { Badge } from './Badge'
import '../styles/overlay.css'

/** #RRGGBB + porcentaje -> rgba() */
export function rgba(hex: string, opacityPct: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full || '000000', 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${Math.min(100, Math.max(0, opacityPct)) / 100})`
}

function initials(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??'
}

interface Props {
  config: ChatConfig
  messages: ChatMessage[]
}

export default function ChatOverlay({ config, messages }: Props) {
  const c = config

  // Carga de fuentes: Google Fonts o la @font-face del .ttf del streamer.
  useEffect(() => {
    if (c.fontFamily === CUSTOM_FONT_FAMILY) {
      const src = c.customFontData || c.customFontUrl
      if (src) injectFontFace(c.customFontName || 'Custom Font', src)
    } else {
      ensureGoogleFont(c.fontFamily)
    }
  }, [c.fontFamily, c.customFontData, c.customFontUrl, c.customFontName])

  const textShadow = useMemo(() => {
    const parts: string[] = []
    if (c.outlineWidth > 0) {
      const w = c.outlineWidth
      const col = c.outlineColor
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4
        parts.push(`${(Math.cos(angle) * w).toFixed(2)}px ${(Math.sin(angle) * w).toFixed(2)}px 0 ${col}`)
      }
    }
    if (c.shadowBlur > 0) parts.push(`0 2px ${c.shadowBlur}px ${c.shadowColor}`)
    return parts.length ? parts.join(', ') : 'none'
  }, [c.outlineWidth, c.outlineColor, c.shadowBlur, c.shadowColor])

  // El chat "normal" de Twitch crece hacia abajo y se lee de arriba a abajo;
  // con dirección `top` el mensaje nuevo entra arriba de todo.
  const ordered = c.direction === 'top' ? [...messages].reverse() : messages

  const stageStyle: React.CSSProperties = {
    width: c.width,
    height: c.height,
    perspective: c.perspective ? `${c.perspective}px` : 'none',
  }

  const rotorStyle: React.CSSProperties = {
    transform: [
      `rotateX(${c.rotateX}deg)`,
      `rotateY(${c.rotateY}deg)`,
      `rotateZ(${c.rotateZ}deg)`,
      `scale(${c.scale})`,
    ].join(' '),
  }

  const listStyle: React.CSSProperties = {
    justifyContent: c.direction === 'bottom' ? 'flex-end' : 'flex-start',
    alignItems: c.align === 'center' ? 'center' : c.align === 'right' ? 'flex-end' : 'flex-start',
    gap: c.gap,
    fontFamily: fontStack(c.fontFamily, c.customFontName),
    fontSize: c.fontSize,
    lineHeight: c.lineHeight,
    letterSpacing: c.letterSpacing,
    color: c.textColor,
    textShadow,
    ['--anim-ms' as string]: `${c.animationDuration}ms`,
  }

  const rowStyle: React.CSSProperties = {
    maxWidth: `${c.maxWidth}%`,
    width: c.fitContent ? 'auto' : `${c.maxWidth}%`,
    padding: `${c.padY}px ${c.padX}px`,
    borderRadius: c.radius,
    background: c.layout === 'flat' ? 'transparent' : rgba(c.bgColor, c.bgOpacity),
    border: c.borderWidth > 0 ? `${c.borderWidth}px solid ${c.borderColor}` : 'none',
    boxShadow: c.boxShadow > 0 ? `0 ${Math.round(c.boxShadow / 2)}px ${c.boxShadow}px ${rgba(c.boxShadowColor, 55)}` : 'none',
    textAlign: c.align,
  }

  return (
    <div className="ov-stage" style={stageStyle}>
      <div className="ov-rotor" style={rotorStyle}>
        <div className={`ov-list ov-anim-${c.animation}`} style={listStyle}>
          {ordered.map((m) => (
            <div key={m.id} className="ov-row" style={rowStyle}>
              <div className={`ov-inner ${c.nameOnOwnLine ? 'is-stacked' : ''}`}>
                <span className="ov-head">
                  {c.showAvatars && (
                    <span
                      className="ov-avatar"
                      style={{
                        width: c.avatarSize,
                        height: c.avatarSize,
                        background: m.color,
                        fontSize: c.avatarSize * 0.42,
                      }}
                    >
                      {initials(m.user)}
                    </span>
                  )}
                  {c.showBadges &&
                    m.badges.map((b) => <Badge key={b} id={b} size={c.badgeSize} />)}
                  <span
                    className="ov-user"
                    style={{
                      color:
                        c.usernameColorMode === 'twitch'
                          ? m.color
                          : c.usernameColorMode === 'fixed'
                            ? c.usernameColor
                            : 'inherit',
                      fontWeight: c.usernameWeight,
                      textTransform: c.uppercaseName ? 'uppercase' : 'none',
                    }}
                  >
                    {m.user}
                    {c.showColon && !c.nameOnOwnLine ? ':' : ''}
                  </span>
                </span>
                <span className="ov-text" style={{ fontWeight: c.fontWeight }}>
                  {m.text}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
