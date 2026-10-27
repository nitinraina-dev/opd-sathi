// Shared hospital state: queues, tokens, flags and doctor status.
//
// Two modes, chosen at start-up:
//  - server (MERN): the Express API is the source of truth (MongoDB behind
//    it). Changes stream to every device over Server-Sent Events, so a phone,
//    the staff laptop and the TV all stay in step.
//  - local: no server reachable. State lives in localStorage and is shared
//    between tabs of this browser with BroadcastChannel.

import { useEffect, useReducer, useSyncExternalStore } from 'react'
import { initialState } from './state.js'
import { simNow, setClockOffset } from './clock.js'
import { applyPatch } from './engine.js'

const KEY = 'opd-saathi-state-v1'
export const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
// Send the staff login cookie even when the API is on another domain.
export const CREDENTIALS = API ? 'include' : 'same-origin'
const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === '1'

const listeners = new Set()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('opd-saathi') : null

let mode = 'connecting' // 'connecting' | 'server' | 'local'
let storage = '' // 'mongodb' | 'file' when on a server

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return s && s.v === 1 ? s : null
  } catch {
    return null
  }
}

function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage full or blocked: the tab still works on its own.
  }
}

let state = read() || initialState()

function emit() {
  for (const fn of listeners) fn()
}

function reloadLocal() {
  if (mode === 'server') return
  const s = read()
  if (s && s.rev !== state.rev) {
    state = s
    emit()
  }
}

if (channel) channel.onmessage = reloadLocal
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) reloadLocal()
  })
}

// ---- Server mode ---------------------------------------------------------------

function setFull(s, serverNow) {
  if (serverNow) setClockOffset(serverNow - Date.now())
  state = s
  emit()
}

async function fetchFull() {
  const res = await fetch(`${API}/api/state`, { signal: AbortSignal.timeout(3000), credentials: CREDENTIALS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function receive(patch) {
  if (patch.rev <= state.rev && !patch.full) return // already have it
  if (!patch.full && patch.rev !== state.rev + 1) {
    // Missed a change: fetch everything again.
    fetchFull()
      .then((j) => setFull(j.state, j.serverNow))
      .catch(() => {})
    return
  }
  state = applyPatch(state, patch)
  emit()
}

let stream = null

function openStream() {
  const es = new EventSource(`${API}/api/stream`, { withCredentials: !!API })
  stream = es
  es.addEventListener('state', (e) => {
    const j = JSON.parse(e.data)
    setFull(j.state, j.serverNow)
  })
  es.addEventListener('patch', (e) => receive(JSON.parse(e.data)))
  // EventSource reconnects on its own; the server sends the full state again.
}

const ready = (async () => {
  if (LOCAL_ONLY) {
    mode = 'local'
    return
  }
  try {
    const j = await fetchFull()
    mode = 'server'
    storage = j.storage
    setFull(j.state, j.serverNow)
    openStream()
  } catch {
    mode = 'local'
    if (!read()) write(state)
    emit()
  }
})()

export const whenReady = () => ready

// After logging in or out: reload the state and stream with the new access
// (staff see names; everyone else sees only tokens).
export async function reconnect() {
  if (mode !== 'server') return
  stream?.close()
  try {
    const j = await fetchFull()
    setFull(j.state, j.serverNow)
  } catch {
    // The stream below will bring the state when the server answers.
  }
  openStream()
}
export const isServer = () => mode === 'server'
export const getMode = () => ({ mode, storage })

export async function serverAction(name, args) {
  const res = await fetch(`${API}/api/actions/${name}`, {
    method: 'POST',
    credentials: CREDENTIALS,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(j.error || `HTTP ${res.status}`)
    err.status = res.status
    if (j.code) err.code = j.code
    if (j.token) err.token = j.token
    throw err
  }
  // Apply our own change at once instead of waiting for the stream.
  if (j.patch) receive(j.patch)
  return j.result
}

// ---- Local mode ---------------------------------------------------------------------

export function getState() {
  return state
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Change the state locally. The mutator gets a fresh copy of the latest
// stored state (another tab may have changed it) and may return a value.
export function update(mutator) {
  const base = read() || state
  const draft = structuredClone(base)
  const result = mutator(draft)
  draft.rev = (base.rev || 0) + 1
  state = draft
  write(draft)
  channel?.postMessage({ rev: draft.rev })
  emit()
  return result
}

// ---- Hooks ------------------------------------------------------------------------------

export function useHospital() {
  return useSyncExternalStore(subscribe, getState)
}

export function useMode() {
  useSyncExternalStore(subscribe, getState)
  return getMode()
}

// Re-render every `ms` and return the hospital time.
export function useSimNow(ms = 1000) {
  const s = useHospital()
  const [, tick] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const id = setInterval(tick, ms)
    return () => clearInterval(id)
  }, [ms])
  return simNow(s.clock)
}
