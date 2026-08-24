import { CaretDown } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CUSTOM_FONT_FAMILY, FONTS, FONT_GROUPS, ensureGoogleFont } from '../fonts'

interface Props {
  value: string
  customFontName?: string
  hasCustomFont: boolean
  onChange: (family: string) => void
}

/**
 * Selector de fuentes con preview real: cada opción carga su familia de Google
 * Fonts sólo cuando entra en pantalla, así no pedimos 70 hojas de estilo de una.
 */
export default function FontPicker({ value, customFontName, hasCustomFont, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return FONTS.filter((f) => !q || f.family.toLowerCase().includes(q))
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Carga perezosa de las familias visibles en la lista.
  useEffect(() => {
    if (!open || !listRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const family = (entry.target as HTMLElement).dataset.family
          if (family) ensureGoogleFont(family)
        }
      },
      { root: listRef.current, rootMargin: '160px' },
    )
    listRef.current.querySelectorAll<HTMLElement>('[data-family]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [open, filtered])

  const currentLabel =
    value === CUSTOM_FONT_FAMILY ? `${customFontName || 'Fuente propia'} (.ttf)` : value

  return (
    <div className="row row-wide">
      <span className="row-label">Fuente</span>
      <div className="fontpicker" ref={boxRef}>
        <button type="button" className="fontpicker-trigger" onClick={() => setOpen((o) => !o)}>
          <span
            style={{
              fontFamily:
                value === CUSTOM_FONT_FAMILY
                  ? `"${customFontName || 'Custom Font'}", sans-serif`
                  : `"${value}", sans-serif`,
            }}
          >
            {currentLabel}
          </span>
          <CaretDown size={13} />
        </button>

        {open && (
          <div className="fontpicker-pop">
            <input
              autoFocus
              className="fontpicker-search"
              placeholder="Buscar fuente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="fontpicker-list" ref={listRef}>
              {hasCustomFont && !query && (
                <div className="fontpicker-group">
                  <h5>Tu fuente</h5>
                  <button
                    type="button"
                    className={value === CUSTOM_FONT_FAMILY ? 'active' : ''}
                    onClick={() => {
                      onChange(CUSTOM_FONT_FAMILY)
                      setOpen(false)
                    }}
                    style={{ fontFamily: `"${customFontName || 'Custom Font'}", sans-serif` }}
                  >
                    {customFontName || 'Custom Font'}
                  </button>
                </div>
              )}
              {FONT_GROUPS.map((group) => {
                const items = filtered.filter((f) => f.group === group)
                if (!items.length) return null
                return (
                  <div className="fontpicker-group" key={group}>
                    <h5>{group}</h5>
                    {items.map((f) => (
                      <button
                        key={f.family}
                        type="button"
                        data-family={f.family}
                        className={value === f.family ? 'active' : ''}
                        style={{ fontFamily: `"${f.family}", sans-serif` }}
                        onClick={() => {
                          ensureGoogleFont(f.family)
                          onChange(f.family)
                          setOpen(false)
                        }}
                      >
                        {f.family}
                      </button>
                    ))}
                  </div>
                )
              })}
              {!filtered.length && <p className="fontpicker-empty">Sin resultados</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
