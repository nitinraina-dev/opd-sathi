// Joining the line at the hospital (check-in).
// A phone books from anywhere, but its place in the line starts only when it
// checks in at the hospital: by scanning the code on the waiting-room screen
// (it changes every 2 minutes, so a photo sent to someone at home soon stops
// working), or at the registration counter.
//
//   GET  /api/checkin/code   the current code (staff screens: the board)
//   POST /api/checkin        { pid, secret, code }: the patient's own phone

import crypto from 'node:crypto'
import { Router } from 'express'
import { limiter } from './limit.js'

const WINDOW = 2 * 60 * 1000
const KEEP = 3 // a code works for up to 3 windows (about 6 minutes)

const sameText = (a, b) => {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

export function createCheckIn({ hospital, audit, auth }) {
  const key = crypto.randomBytes(32)
  // Six digits: easy to read off a screen and type on any phone.
  const codeFor = (w) => String(crypto.createHmac('sha256', key).update(String(w)).digest().readUInt32BE(0) % 1e6).padStart(6, '0')
  const current = () => codeFor(Math.floor(Date.now() / WINDOW))
  const valid = (code) => {
    const c = String(code || '').replace(/\D/g, '')
    if (c.length !== 6) return false
    const w = Math.floor(Date.now() / WINDOW)
    for (let i = 0; i < KEEP; i++) if (sameText(c, codeFor(w - i))) return true
    return false
  }
  const tries = limiter(30, 10 * 60 * 1000)
  const router = Router()

  router.get('/checkin/code', auth.requireRole('checkIn'), (req, res) => {
    res.json({ code: current(), nextIn: WINDOW - (Date.now() % WINDOW) })
  })

  router.post('/checkin', (req, res) => {
    if (tries.over(req.ip)) return res.status(429).json({ error: 'Too many tries. Ask at the registration counter.', code: 'tooMany' })
    const b = req.body || {}
    const p = typeof b.pid === 'string' ? hospital.raw().patients[b.pid] : null
    if (!p || !p.secret || !sameText(p.secret, b.secret)) return res.status(404).json({ error: 'Not found', code: 'notFound' })
    if (!valid(b.code)) return res.status(400).json({ error: 'That code is old or wrong. Scan the code on the screen again.', code: 'badCode' })
    if (['waiting', 'called'].includes(p.status)) return res.json({ token: p.token, already: true })
    const { result } = hospital.act('checkIn', { pid: p.id })
    if (!result) return res.status(400).json({ error: 'This token cannot join the line now. Ask at the registration counter.', code: 'notNow' })
    audit.log(null, 'checkIn', { token: result, via: 'code' })
    res.json({ token: result })
  })

  return { router, valid }
}
