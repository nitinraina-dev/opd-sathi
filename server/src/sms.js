// SMS for any phone, through n8n or any SMS gateway: the gateway posts each
// text it receives here, and sends our reply back to the sender.
//   a token ("MED 12")            -> your place in the line
//   WHERE / KAHAN + a place       -> where it is
//   IN + screen code + token      -> join the line (from the phone number on
//                                    the slip, with the code on the waiting-room screen),
//                                    also when back with test reports
//   1, 2 or 3 (+ token)           -> how the visit was (from the number on the slip)
//   urgent words                  -> go to Emergency now
//   anything else                 -> how to use it
//
//   POST /api/sms/inbound  { from, text }   header x-opd-sms-key: <SMS_KEY>  ->  { reply }
// Staff screens (the demo stage) may call it without the key, and say which
// token their phone is following ({ token }) for a 1/2/3 reply.

import crypto from 'node:crypto'
import { Router } from 'express'
import { parseSms, smsText } from '../../client/src/lib/ask.js'
import { findByToken, followMoves, joinKind } from '../../client/src/lib/queue.js'
import { translate } from '../../client/src/i18n/translate.js'
import { simNow } from '../../client/src/lib/clock.js'
import { limiter } from './limit.js'

const sameText = (a, b) => {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}
const last10 = (n) => String(n || '').replace(/\D/g, '').slice(-10)

export function createSms({ hospital, checkin, audit }) {
  const perSender = limiter(20, 10 * 60 * 1000)
  const router = Router()

  router.post('/sms/inbound', (req, res) => {
    const key = process.env.SMS_KEY
    if (!req.staff && !(key && sameText(req.get('x-opd-sms-key'), key))) return res.status(401).json({ error: 'SMS is not set up (SMS_KEY)' })
    const from = String(req.body?.from || '').slice(0, 20)
    const text = String(req.body?.text || '').slice(0, 300)
    if (perSender.over(from || req.ip)) return res.status(429).json({ error: 'Too many messages' })

    const msg = parseSms(text)
    const state = hospital.raw()
    const fromSlip = (p) => req.staff || (p?.mobile && last10(from) === last10(p.mobile))
    if (msg.cmd === 'rate') {
      // The visit: by the token given, by the stage phone's token, or the
      // latest finished visit from this phone number.
      const named = msg.token || (req.staff && typeof req.body?.token === 'string' ? req.body.token : null)
      const p = named
        ? followMoves(state, findByToken(state, named))
        : Object.values(state.patients)
            .filter((x) => x.status === 'done' && !x.feedback && x.mobile && last10(x.mobile) === last10(from))
            .sort((a, b) => b.doneAt - a.doneAt)[0]
      const rated = !!(p && fromSlip(p) && hospital.act('giveFeedback', { pid: p.id, score: msg.score, via: 'sms' }).result)
      return res.json({ reply: smsText(hospital.raw(), msg, { lang: p?.lang || msg.lang, rated }) })
    }
    if (msg.cmd === 'in') {
      const p = findByToken(state, msg.token)
      // Only from the number on the slip (staff test phones may skip that), and
      // only with the code shown on the waiting-room screen right now.
      if (!p || !fromSlip(p) || !checkin.valid(msg.code)) return res.json({ reply: `${translate(msg.lang, 'app.name')}: ${translate(msg.lang, 'sms.inRefused')}` })
      if (joinKind(p)) {
        hospital.act('checkIn', { pid: p.id })
        audit.log(null, 'checkIn', { token: p.token, via: 'sms' })
      }
    }
    res.json({ reply: smsText(hospital.raw(), msg, { now: simNow(state.clock) }) })
  })

  return { router }
}
