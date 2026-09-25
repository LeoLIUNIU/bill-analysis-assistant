import { useEffect, useState } from 'react'

export type Route = 'guide' | 'analysis' | 'card' | 'privacy'

const VALID: Route[] = ['guide', 'analysis', 'card', 'privacy']

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  // 兼容旧路由：松鼠助手时期的页面名
  const legacy: Record<string, Route> = {
    import: 'guide', review: 'analysis', report: 'analysis',
  }
  const key = (h.split('?')[0] || 'guide') as Route
  if (legacy[h]) return legacy[h]
  return VALID.includes(key) ? key : 'guide'
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
