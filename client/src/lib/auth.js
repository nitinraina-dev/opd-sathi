// Staff login on the client. In offline mode there is no server, so there is
// no login either (the staff screens say so).

import { useEffect, useSyncExternalStore } from 'react'
import { API, CREDENTIALS, whenReady, isServer, reconnect } from './store.js'

let user // undefined: not known yet; null: not logged in
const subs = new Set()
const setUser = (u) => {
  user = u
  for (const fn of subs) fn()
}

export async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`${API}/api${path}`, {
    method,
    credentials: CREDENTIALS,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(j.error || `HTTP ${res.status}`)
    err.status = res.status
    if (j.code) err.code = j.code
    throw err
  }
  return j
}

export async function loadUser() {
  await whenReady()
  if (!isServer()) return setUser(null)
  try {
    setUser((await api('/auth/me')).user)
  } catch {
    setUser(null)
  }
}

export async function login(username, password) {
  const j = await api('/auth/login', { username, password })
  setUser(j.user)
  await reconnect()
  return j.user
}

export async function logout() {
  await api('/auth/logout', {}).catch(() => {})
  setUser(null)
  await reconnect()
}

export const changePassword = (current, next) => api('/auth/password', { current, next })

export const accounts = {
  list: () => api('/staff'),
  create: (u) => api('/staff', u),
  update: (username, patch) => api(`/staff/${encodeURIComponent(username)}`, patch, 'PUT'),
  remove: (username) => api(`/staff/${encodeURIComponent(username)}`, {}, 'DELETE'),
}

export function useStaffUser() {
  const u = useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => user,
  )
  useEffect(() => {
    if (u === undefined) loadUser()
  }, [u])
  return u
}

// Make a password that is easy to read out and type.
export function makePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const pick = () => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length]
  return Array.from({ length: 3 }, () => Array.from({ length: 4 }, pick).join('')).join('-')
}
