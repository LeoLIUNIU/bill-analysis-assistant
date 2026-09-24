import { useEffect, useState } from 'react'

export type Route = 'import' | 'review' | 'report' | 'card' | 'privacy'

const VALID: Route[] = ['import', 'review', 'report', 'card', 'privacy']

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '') as Route
  return VALID.includes(h) ? h : 'import'
}

export function navigate(route: Route): void {
  window.location.hash = `#/${route}`
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
