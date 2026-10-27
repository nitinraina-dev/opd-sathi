// "Send to family": a link to follow a token on any phone (no name in it),
// and, when the hospital has a Telegram bot, a link that sends its alerts.

import { useEffect, useState } from 'react'
import { API, CREDENTIALS, isServer, whenReady } from './store.js'

let bot // undefined: not asked yet
let asking = null

async function loadBot() {
  await whenReady()
  if (!isServer()) return null
  try {
    const j = await (await fetch(`${API}/api/telegram`, { credentials: CREDENTIALS })).json()
    return j.bot || null
  } catch {
    return null
  }
}

// The hospital's Telegram bot username, or null.
export function useTelegramBot() {
  const [v, setV] = useState(bot ?? null)
  useEffect(() => {
    if (bot !== undefined) return
    asking ||= loadBot().then((b) => (bot = b))
    let alive = true
    asking.then((b) => alive && setV(b))
    return () => {
      alive = false
    }
  }, [])
  return v
}

export const turnUrl = (token) => `${window.location.origin}/turn/${token}`
export const telegramUrl = (bot, token) => `https://t.me/${bot}?start=${token}`
export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`
