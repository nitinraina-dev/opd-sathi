// Telegram for patients and families (free): the same answers as SMS, and
// alerts for a token they follow ("your turn is close", "your token is
// called"). The server asks Telegram for new messages itself (long polling),
// so it works from a laptop with no public address and needs no n8n.
//   TELEGRAM_BOT_TOKEN in server/.env (make a bot with @BotFather).
//   GET /api/telegram   { bot }: the bot's username, for "Alerts on Telegram" links
// A chat follows a token by sending it, or through a t.me/<bot>?start=MED-012
// link from "Send to family". Only private chats are answered. Replies never
// name anyone: only tokens, rooms and places.

import { Router } from 'express'
import { parseSms, smsText } from '../../client/src/lib/ask.js'
import { findByToken, followMoves } from '../../client/src/lib/queue.js'
import { messageText } from '../../client/src/lib/text.js'
import { translate } from '../../client/src/i18n/translate.js'
import { simNow } from '../../client/src/lib/clock.js'
import { limiter } from './limit.js'

// What a follower is told: the turn, never the bill.
const ALERTS = new Set(['near', 'called', 'end', 'noshow', 'checkedIn', 'moved', 'reportsReady', 'backIn', 'done'])
const MAX_FOLLOWS = 5
const STOP = /^\/?(stop|band|बंद|रोको)\b/i

export function createTelegram({ store, hospital }) {
  const key = process.env.TELEGRAM_BOT_TOKEN || ''
  // Tests point this at a stand-in for Telegram.
  const base = (process.env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, '')
  const router = Router()
  let bot = null
  router.get('/telegram', (req, res) => res.json({ bot }))
  if (!key) return { router, stop() {} }

  let running = true
  const perChat = limiter(30, 10 * 60 * 1000)

  async function call(method, body = {}, ms = 15000) {
    const res = await fetch(`${base}/bot${key}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    })
    const j = await res.json().catch(() => ({}))
    if (!j.ok) throw Object.assign(new Error(j.description || `HTTP ${res.status}`), { code: j.error_code || res.status })
    return j.result
  }

  async function send(chat, text) {
    try {
      await call('sendMessage', { chat_id: chat, text })
    } catch (err) {
      // 403: the person blocked the bot or deleted the chat.
      if (err.code === 403) await store.removeFollows(String(chat))
      else throw err
    }
  }

  // The patient record and the ones it was moved from (moving makes a new id).
  const chain = (state, pid) => {
    const ids = []
    for (let p = state.patients[pid]; p && ids.length < 10; p = p.movedFrom ? state.patients[p.movedFrom] : null) ids.push(p.id)
    return ids
  }

  async function follow(chat, p, lang) {
    const mine = await store.followsOf(chat)
    if (mine.some((f) => chain(hospital.raw(), p.id).includes(f.pid))) return false
    for (const f of mine.slice(MAX_FOLLOWS - 1)) await store.removeFollow(f._id)
    await store.addFollow({ _id: `${chat}|${p.id}`, chat, pid: p.id, token: p.token, lang, at: Date.now() })
    return true
  }

  // One message in, one reply out.
  async function answer(chat, text, chatLang) {
    const say = (lang, k, v) => `${translate(lang, 'app.name')}: ${translate(lang, k, v)}`
    const start = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/i)
    if ((start && !start[1]) || /^\/help\b/i.test(text)) return say(chatLang, 'tg.welcome')
    if (STOP.test(text)) {
      await store.removeFollows(chat)
      return say(chatLang, 'tg.stopped')
    }
    const state = hospital.raw()
    const now = simNow(state.clock)
    const msg = parseSms(start ? start[1] : text)
    const lang = msg.lang === 'hi' || chatLang === 'hi' ? 'hi' : 'en'
    switch (msg.cmd) {
      case 'status': {
        const reply = smsText(state, msg, { now, lang })
        const p = followMoves(state, findByToken(state, msg.token))
        if (!p || p.kind === 'emergency') return reply
        return (await follow(chat, p, lang)) ? `${reply}\n\n${translate(lang, 'tg.following', { token: p.token })}` : reply
      }
      // Joining the line needs the patient's own phone or the counter.
      case 'in':
        return say(lang, 'tg.inRefused')
      case 'rate': {
        // Only for a token this chat follows.
        const mine = await store.followsOf(chat)
        const followed = (p) => p && chain(state, p.id).some((id) => mine.some((f) => f.pid === id))
        const p = msg.token
          ? followMoves(state, findByToken(state, msg.token))
          : mine.map((f) => followMoves(state, state.patients[f.pid])).find((x) => x?.status === 'done' && !x.feedback)
        if (!followed(p) || p.status !== 'done') return say(lang, 'tg.rateNone')
        const rated = !!p.feedback || !!hospital.act('giveFeedback', { pid: p.id, score: msg.score, via: 'telegram' }).result
        return smsText(state, msg, { lang, rated })
      }
      case 'help':
        return say(lang, 'tg.welcome')
      default:
        return smsText(state, msg, { now, lang })
    }
  }

  async function onMessage(m) {
    const chat = m.chat?.id
    if (chat == null || m.chat.type !== 'private' || typeof m.text !== 'string') return
    // After a restart Telegram hands back what came in meanwhile: old messages get no reply.
    if (m.date && Date.now() / 1000 - m.date > 300) return
    if (perChat.over(String(chat))) return
    const lang = /^hi\b/i.test(m.from?.language_code || '') ? 'hi' : 'en'
    await send(chat, await answer(String(chat), m.text.trim().slice(0, 300), lang))
  }

  // Alerts for followed tokens. A demo reset reuses ids, so it ends every follow.
  hospital.onChange((name, state, fresh) => {
    if (name === 'resetAll') return void store.clearFollows().catch(() => {})
    for (const m of fresh) {
      if (!ALERTS.has(m.kind)) continue
      store
        .followsFor(chain(state, m.pid))
        .then((fs) => Promise.all(fs.map((f) => send(f.chat, messageText(m, (k, v) => translate(f.lang, k, v))))))
        .catch((err) => console.warn('Telegram alert:', err.message))
    }
  })

  async function whoAmI() {
    bot = (await call('getMe')).username || null
    if (bot) console.log(`Telegram: @${bot} answers patients and sends their alerts.`)
  }

  async function poll() {
    let offset = 0
    let pause = 0
    let warned = ''
    while (running) {
      try {
        if (!bot) await whoAmI()
        const updates = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, 60_000)
        pause = 0
        warned = ''
        for (const u of updates) {
          offset = u.update_id + 1
          if (u.message) await onMessage(u.message).catch((err) => console.warn('Telegram:', err.message))
        }
      } catch (err) {
        if (!running) return
        if (err.code === 401 || err.code === 404) return console.warn('Telegram: TELEGRAM_BOT_TOKEN was not accepted. Check it in server/.env.')
        const why =
          err.code === 409 ? 'another program is reading this bot\'s messages (a webhook or a second server). Give OPD Saathi its own bot.' : err.message
        // Once per outage (no internet, laptop asleep), not every retry.
        if (!warned) console.warn(`Telegram: ${why} (trying again until it works)`)
        warned = why
        pause = Math.min(60_000, (pause || 2500) * 2)
        await new Promise((r) => setTimeout(r, pause))
      }
    }
  }
  poll()

  return {
    router,
    stop() {
      running = false
    },
  }
}
