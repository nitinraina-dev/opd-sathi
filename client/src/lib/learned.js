// What the forecast has learned from this hospital's own registrations
// (server mode only).

import { useEffect, useState } from 'react'
import { whenReady, isServer } from './store.js'
import { api } from './auth.js'

export function useLearned() {
  const [learned, setLearned] = useState(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      await whenReady()
      if (!isServer()) return
      try {
        const j = await api('/stats/learned')
        if (alive) setLearned(j.learned)
      } catch {
        // keep the last value
      }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    window.addEventListener('opd-learned', load)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('opd-learned', load)
    }
  }, [])
  return learned
}

export const loadSampleHistory = () => api('/stats/sample', {})
export const clearHistory = () => api('/stats', {}, 'DELETE')
