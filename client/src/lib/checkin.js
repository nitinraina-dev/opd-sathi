// Joining the line at the hospital. The phone sends the code shown on the
// waiting-room screen (it changes every 2 minutes). In the offline demo there
// is no server to check the code, so the phone joins the line directly.

import { useEffect, useState } from 'react'
import { API, CREDENTIALS, isServer, whenReady } from './store.js'
import { secretFor } from './mine.js'
import { checkIn } from './actions.js'
import { api } from './auth.js'

const KEY = 'opd-saathi-checkin-code'
const FRESH = 5 * 60 * 1000

export const cleanCode = (v) => String(v || '').replace(/\D/g, '').slice(0, 6)

export async function checkInWithCode(state, p, code) {
  if (!isServer()) {
    const token = await checkIn(p.id)
    if (!token) throw Object.assign(new Error('notNow'), { code: 'notNow' })
    return token
  }
  const res = await fetch(`${API}/api/checkin`, {
    method: 'POST',
    credentials: CREDENTIALS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid: p.id, secret: secretFor(state, p), code: cleanCode(code) }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(j.error || `HTTP ${res.status}`), { code: j.code || 'failed' })
  return j.token
}

export const checkInUrl = (code) => `${window.location.origin}/checkin?c=${code}`

// The code to show on the waiting-room screen and at the counter. Only a
// logged-in staff screen gets it from the server ({ none: true } otherwise).
// The offline demo shows a made-up code (it does not check codes).
export function useCheckInCode() {
  const [v, setV] = useState(null)
  useEffect(() => {
    let alive = true
    let timer
    const later = (ms) => (timer = setTimeout(load, ms))
    async function load() {
      await whenReady()
      if (!alive) return
      if (!isServer()) {
        setV({ code: String((Math.floor(Date.now() / 120000) * 7919) % 1e6).padStart(6, '0') })
        return later(30000)
      }
      try {
        // Not logged in (a screen nobody signed in to): no code, and no failed request.
        const { user } = await api('/auth/me')
        if (!alive) return
        if (!user) {
          setV({ none: true })
          return later(60000)
        }
        const j = await api('/checkin/code')
        if (!alive) return
        setV({ code: j.code })
        later(Math.min(j.nextIn + 500, 120000))
      } catch {
        if (alive) later(15000)
      }
    }
    load()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])
  return v
}

// A code scanned before registering: registering then joins the line at once.
export function rememberCode(code) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ code: cleanCode(code), at: Date.now() }))
  } catch {
    // ignore
  }
}
export function recentCode() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    return v && Date.now() - v.at < FRESH ? v.code : ''
  } catch {
    return ''
  }
}
export function forgetCode() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
