// Optional automation through n8n. In server (MERN) mode the Express server
// talks to n8n, and this file only reads and saves its settings through the
// API. In local mode (no server) the browser talks to the n8n webhooks itself:
//   eventsUrl  POST  registered, turn_near, token_called, no_show, urgent_flag, …
//              (n8n can send real SMS, Telegram alerts, keep a log)
//   feedUrl    GET   live weather, air and traffic for the forecast
// Both are set on the staff Forecast screen. With no URL, nothing is sent and
// the event is only written to the local log.

import { isServer, whenReady, API, CREDENTIALS } from './store.js'

const KEY = 'opd-saathi-integrations'
const LOG = 'opd-saathi-n8n-log'

export const defaultIntegrations = {
  feedUrl: '',
  eventsUrl: '',
  lat: 26.85,
  lon: 80.95,
  place: 'Lucknow',
  placeHi: 'लखनऊ',
}

export function getIntegrations() {
  try {
    return { ...defaultIntegrations, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...defaultIntegrations }
  }
}

export function saveIntegrations(patch) {
  const next = { ...getIntegrations(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('opd-integrations'))
  return next
}

export function getLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG) || '[]')
  } catch {
    return []
  }
}

function addLog(entry) {
  const log = [{ at: Date.now(), ...entry }, ...getLog()].slice(0, 30)
  try {
    localStorage.setItem(LOG, JSON.stringify(log))
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('opd-n8n-log'))
}

export async function postEvent(type, data) {
  const { eventsUrl } = getIntegrations()
  const payload = {
    type,
    at: new Date().toISOString(),
    hospital: 'City District Hospital (sample)',
    data,
  }
  if (!eventsUrl) {
    addLog({ type, status: 'off' })
    return 'off'
  }
  try {
    const res = await fetch(eventsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    addLog({ type, status: res.ok ? 'sent' : 'error', code: res.status })
    return res.ok ? 'sent' : 'error'
  } catch {
    // The n8n server may not answer the CORS check. A plain-text "no-cors"
    // request still gets through; we just cannot read the reply.
    try {
      await fetch(eventsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      })
      addLog({ type, status: 'sent' })
      return 'sent'
    } catch {
      addLog({ type, status: 'error' })
      return 'error'
    }
  }
}

// ---- Used by the staff Forecast screen in both modes --------------------------

async function api(path, opts = {}) {
  const res = await fetch(`${API}/api${path}`, { credentials: CREDENTIALS, ...opts })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function loadConfig() {
  await whenReady()
  return isServer() ? api('/config') : getIntegrations()
}

export async function saveConfig(cfg) {
  await whenReady()
  if (!isServer()) return saveIntegrations(cfg)
  const out = await api('/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
  window.dispatchEvent(new Event('opd-integrations'))
  return out
}

export async function loadLog() {
  await whenReady()
  return isServer() ? api('/n8n/log') : getLog()
}

export async function sendTest() {
  await whenReady()
  if (!isServer()) return postEvent('test', { message: 'Test from OPD Saathi' })
  const j = await api('/n8n/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  window.dispatchEvent(new Event('opd-n8n-log'))
  return j.status
}
