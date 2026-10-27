// Alerts on the patient's phone.
//  - A service worker shows notifications (Android Chrome only allows them
//    through one) and keeps the app's files for a weak connection.
//  - With the server running, the phone also subscribes to web push, so
//    "your turn is close" arrives even when the screen is closed.

import { API, CREDENTIALS, isServer, whenReady } from './store.js'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

export const notificationsSupported = () => typeof Notification !== 'undefined'
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext

export async function showAlert(title, options = {}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  const opts = { icon: '/icon.svg', badge: '/icon.svg', ...options }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, opts)
      return true
    }
  } catch {
    // fall through
  }
  try {
    new Notification(title, opts)
    return true
  } catch {
    return false
  }
}

const KEY = 'opd-saathi-push'
function pushedIds() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
export const pushIsOn = (pid) => pushedIds().includes(pid)

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))])

// Returns 'push' (alerts even when closed), 'local' (alerts while open),
// 'denied' or 'unsupported'.
export async function enableAlerts(p, lang) {
  if (!notificationsSupported()) return 'unsupported'
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (perm !== 'granted') return 'denied'
  await whenReady()
  if (!isServer() || !pushSupported()) return 'local'
  try {
    const reg = await withTimeout(navigator.serviceWorker.ready, 5000)
    const { publicKey } = await (await fetch(`${API}/api/push/key`, { credentials: CREDENTIALS })).json()
    let sub = await reg.pushManager.getSubscription()
    const options = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }
    // The first subscription on a phone can take a while; do not wait forever.
    try {
      if (!sub) sub = await withTimeout(reg.pushManager.subscribe(options), 45000)
    } catch (err) {
      if (err.message === 'timeout') throw err
      // Subscribed with an old server key: start again.
      await sub?.unsubscribe()
      sub = await withTimeout(reg.pushManager.subscribe(options), 45000)
    }
    const res = await fetch(`${API}/api/push/subscribe`, {
      method: 'POST',
      credentials: CREDENTIALS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: p.id, token: p.token, lang, subscription: sub.toJSON() }),
    })
    if (!res.ok) throw new Error('subscribe')
    try {
      localStorage.setItem(KEY, JSON.stringify([...new Set([...pushedIds(), p.id])]))
    } catch {
      // ignore
    }
    return 'push'
  } catch (err) {
    console.warn('Alerts work only while the screen is open:', err.message)
    return 'local'
  }
}
