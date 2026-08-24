import { useEffect, useState } from 'react'

export type Route =
  | { view: 'library' }
  | { view: 'editor'; presetId: string | null }

/**
 * Router mínimo sobre el hash. No hace falta más: son dos pantallas y el hash
 * evita tener que configurar rewrites en el hosting.
 */
function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  if (path === 'new') return { view: 'editor', presetId: null }
  if (path.startsWith('edit/')) return { view: 'editor', presetId: decodeURIComponent(path.slice(5)) }
  return { view: 'library' }
}

export function navigate(to: string): void {
  window.location.hash = to
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
