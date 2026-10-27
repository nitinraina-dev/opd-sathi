// Local alerts for the forecast (server mode only). Everyone gets the alerts
// in force; staff also get news suggestions and when the news was read.

import { useEffect, useState } from 'react'
import { whenReady, isServer } from './store.js'
import { api } from './auth.js'

const EMPTY = { active: [], suggestions: [], news: null }

export function useSignals() {
  const [v, setV] = useState(EMPTY)
  useEffect(() => {
    let alive = true
    const load = async () => {
      await whenReady()
      if (!isServer()) return
      try {
        const j = await api('/signals')
        if (alive) setV({ ...EMPTY, ...j })
      } catch {
        // keep the last value
      }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    window.addEventListener('opd-signals', load)
    // The early warning comes from the history, so reload when it changes.
    window.addEventListener('opd-learned', load)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('opd-signals', load)
      window.removeEventListener('opd-learned', load)
    }
  }, [])
  return v
}

const changed = (r) => {
  window.dispatchEvent(new Event('opd-signals'))
  return r
}
export const addSignal = (body) => api('/signals', body).then(changed)
export const acceptSuggestion = (id) => api(`/signals/${id}/accept`, {}).then(changed)
export const dismissSuggestion = (id) => api(`/signals/${id}/dismiss`, {}).then(changed)
export const endSignal = (id) => api(`/signals/${id}`, {}, 'DELETE').then(changed)
export const checkNews = () => api('/signals/news', {}).then(changed)
