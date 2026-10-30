import { useMemo, useSyncExternalStore } from 'react'

/** 极简 hash 路由：`#/` 列表，`#/p/:id` 讲解页 */
export type Route = { name: 'home' } | { name: 'problem'; id: string }

export function parseHash(hash: string): Route {
  const m = /^#\/p\/([^/?]+)/.exec(hash)
  if (m) {
    try {
      return { name: 'problem', id: decodeURIComponent(m[1]!) }
    } catch {
      return { name: 'problem', id: m[1]! }
    }
  }
  return { name: 'home' }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '')
  return useMemo(() => parseHash(hash), [hash])
}

export function problemHref(id: string): string {
  return `#/p/${encodeURIComponent(id)}`
}

export const HOME_HREF = '#/'
