// REST + live stream API.
//   GET  /api/health            server and storage status
//   GET  /api/state             the whole hospital state
//   GET  /api/stream            live changes (Server-Sent Events)
//   POST /api/actions/:name     change something (register, call next, …)
//   GET  /api/conditions        weather, air and traffic (cached)
//   GET  /api/forecast          crowd forecast summary (used by n8n)
//   GET/PUT /api/config         n8n links and hospital location (admin)
//   GET  /api/n8n/log, POST /api/n8n/test (admin)
//   GET  /api/push/key, POST /api/push/subscribe|unsubscribe   phone alerts
//   POST /api/feedback          "how was your visit?" from the patient's own phone
//   GET  /api/stats/learned, POST /api/stats/sample, DELETE /api/stats
//   /api/auth/* and /api/staff/* are in auth.js
// Staff actions need a login with the right role (see lib/permissions.js).

import crypto from 'node:crypto'
import { Router } from 'express'
import { departments, allRooms } from '../../client/src/data/departments.js'
import { places } from '../../client/src/data/hospital.js'
import { buildForecast } from './forecast.js'
import { ACTION_ROLES, AUDIT_GROUPS, can, ownRecord } from '../../client/src/lib/permissions.js'
import { testById, FREE_CARDS } from '../../client/src/data/fees.js'
import { SCORES, REASONS } from '../../client/src/data/feedback.js'
import { actionDetail } from './audit.js'
import { parseCookies } from './auth.js'
import { limiter } from './limit.js'
import { simNow, dateKey } from '../../client/src/lib/clock.js'

const deptIds = new Set(departments.map((d) => d.id))
const roomNums = new Set(allRooms.map((r) => r.room))
const placeIds = new Set(places.map((p) => p.id))

class BadRequest extends Error {}
const bad = (msg) => {
  throw new BadRequest(msg)
}
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : '')
const room = (a) => (roomNums.has(Number(a.room)) ? Number(a.room) : bad('room'))
const id = (v) => (typeof v === 'string' && /^[a-z]\d{1,9}$/.test(v) ? v : bad('id'))
const dept = (v) => (deptIds.has(v) ? v : bad('dept'))
const ids = (v) => (Array.isArray(v) && v.length >= 1 && v.length <= 60 ? [...new Set(v.map(id))] : bad('pids'))

// Only these actions can be called, and only with clean values.
const ACTIONS = {
  registerPatient(a) {
    const name = str(a.name, 40).trim() || bad('name')
    const age = Number(a.age)
    if (!Number.isInteger(age) || age < 0 || age > 120) bad('age')
    if (!['f', 'm', 'x'].includes(a.gender)) bad('gender')
    const mobile = a.mobile ? String(a.mobile) : ''
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) bad('mobile')
    return {
      name,
      age,
      gender: a.gender,
      dept: dept(a.dept),
      mobile,
      assisted: !!a.assisted,
      lang: a.lang === 'hi' ? 'hi' : 'en',
      via: a.via === 'counter' ? 'counter' : 'app', // only staff can say "counter" (checked below)
      payChoice: ['upi', 'counter', 'card'].includes(a.payChoice) ? a.payChoice : 'counter',
      card: FREE_CARDS.includes(a.card) ? a.card : '',
      paidCash: !!a.paidCash, // staff only (checked below)
      cardOk: !!a.cardOk, // staff only (checked below)
    }
  },
  payBill: (a) => ({ pid: id(a.pid), method: 'cash' }), // online payments go through /api/pay
  decideWaiver: (a) => ({ pid: id(a.pid), approve: !!a.approve }),
  addCharges: (a) => {
    const tests = [...new Set(Array.isArray(a.tests) ? a.tests.filter((t) => testById[t]) : [])]
    return tests.length ? { pid: id(a.pid), tests } : bad('tests')
  },
  refundItem: (a) => ({ pid: id(a.pid), itemId: id(a.itemId) }),
  callNext: (a) => ({ room: room(a) }),
  markNoShow: (a) => ({ room: room(a) }),
  sendToEnd: (a) => ({ pid: id(a.pid) }),
  movePatient: (a) => ({ pid: id(a.pid), dept: dept(a.dept) }),
  setRoomStatus(a) {
    const p = a.patch || {}
    if (p.status === 'available') return { room: room(a), patch: { status: 'available' } }
    if (p.status === 'break') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.until || '')) bad('until')
      return { room: room(a), patch: { status: 'break', until: p.until } }
    }
    if (p.status === 'late') {
      const lateBy = Number(p.lateBy)
      if (!Number.isInteger(lateBy) || lateBy < 0 || lateBy > 240) bad('lateBy')
      return { room: room(a), patch: { status: 'late', lateBy } }
    }
    return bad('status')
  },
  raiseFlag: (a) => ({
    pid: typeof a.pid === 'string' && /^p\d{1,9}$/.test(a.pid) ? a.pid : null,
    token: str(a.token, 10),
    name: str(a.name, 40),
    where: placeIds.has(a.where) ? a.where : '',
    lang: a.lang === 'hi' ? 'hi' : 'en',
    by: a.by === 'helper' ? 'helper' : 'patient',
  }),
  markFlagSeen: (a) => ({ id: id(a.id) }),
  addSamplePatients: (a) => ({ n: Math.min(50, Math.max(1, Number.parseInt(a.n, 10) || 20)) }),
  setSpeed: (a) => ({ speed: [1, 10].includes(Number(a.speed)) ? Number(a.speed) : bad('speed') }),
  setAutoRun: (a) => ({ on: !!a.on }),
  setArrival: (a) => ({ on: !!a.on }),
  setShareLoad: (a) => ({ on: !!a.on }),
  setEmergencyFee: (a) => {
    const amount = Number(a.amount)
    if (!Number.isInteger(amount) || amount < 0 || amount > 5000) bad('amount')
    if (a.when != null && !['after', 'before'].includes(a.when)) bad('when')
    return { amount, ...(a.when ? { when: a.when } : {}) }
  },
  printSlips: (a) => ({ pids: ids(a.pids) }),
  slipsToRoom: (a) => ({ pids: ids(a.pids) }),
  setSlipMode: (a) => (['counter', 'room', 'window'].includes(a.mode) ? { mode: a.mode } : bad('mode')),
  // Name, age and gender may be unknown in an emergency.
  recordEmergency: (a) => {
    const age = a.age === '' || a.age == null ? null : Number(a.age)
    if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) bad('age')
    return {
      name: str(a.name, 40).trim(),
      age,
      gender: ['f', 'm', 'x'].includes(a.gender) ? a.gender : '',
      lang: a.lang === 'hi' ? 'hi' : 'en',
      card: FREE_CARDS.includes(a.card) ? a.card : '',
      cardOk: !!a.cardOk,
      paidCash: !!a.paidCash,
    }
  },
  checkIn: (a) => ({ pid: id(a.pid) }), // staff, at the counter
  reportsReady: (a) => ({ pid: id(a.pid) }),
  resetAll: () => ({}),
}

const okUrl = (u) => u === '' || /^https?:\/\/\S+$/.test(u)

// Phones that register get a random id in a cookie, so one phone can hold one
// open token per department. Clearing the cookie gets round it, so this only
// stops casual grabbing; the real protection is that a booking joins the
// line only at the hospital (check-in).
const DEVICE = 'opd_dev'
function deviceId(req, res) {
  const have = parseCookies(req.headers.cookie)[DEVICE]
  if (have && /^[a-f0-9]{32}$/.test(have)) return have
  const made = crypto.randomBytes(16).toString('hex')
  const secure = req.secure || req.get('x-forwarded-proto') === 'https'
  res.append('Set-Cookie', `${DEVICE}=${made}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure ? '; Secure' : ''}`)
  return made
}

export function apiRouter({ hospital, store, notifier, getConditions, auth, push, stats, audit, checkin, signals }) {
  const r = Router()
  // Registrations from phones, per internet address (many phones can share one).
  const regLimit = limiter(Number(process.env.REGISTER_LIMIT) || 20, 10 * 60 * 1000)
  const admin = auth.requireRole('automation')

  r.get('/health', (req, res) => {
    res.json({ ok: true, storage: store.kind, rev: hospital.getState().rev, screens: hospital.clientCount() })
  })

  r.get('/state', (req, res) => {
    res.json({ state: hospital.getState(!!req.staff), serverNow: Date.now(), storage: store.kind, staff: req.staff })
  })

  r.get('/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    res.write('retry: 3000\n\n')
    hospital.addClient(res, !!req.staff)
    const ping = setInterval(() => res.write(': ping\n\n'), 20000)
    req.on('close', () => {
      clearInterval(ping)
      hospital.removeClient(res)
    })
  })

  r.post('/actions/:name', (req, res) => {
    const name = req.params.name
    const clean = ACTIONS[name]
    if (!clean) return res.status(404).json({ error: 'Unknown action' })
    if (ACTION_ROLES[name] !== 'public') {
      if (!req.staff) return res.status(401).json({ error: 'Please log in' })
      if (!can(req.staff, name)) return res.status(403).json({ error: 'Not allowed for your role' })
    }
    let args
    try {
      args = clean(req.body || {})
    } catch (err) {
      if (err instanceof BadRequest) return res.status(400).json({ error: `Invalid ${err.message}` })
      throw err
    }
    if (name === 'registerPatient') {
      if (!req.staff) {
        Object.assign(args, { via: 'app', paidCash: false, cardOk: false })
        if (regLimit.over(req.ip)) {
          return res.status(429).json({ error: 'Too many registrations from this connection. Please register at the counter.', code: 'tooMany' })
        }
        const device = deviceId(req, res)
        const s = hospital.raw()
        const today = dateKey(simNow(s.clock))
        const open = Object.values(s.patients).find(
          (p) =>
            p.device === device &&
            p.dept === args.dept &&
            (['waiting', 'called'].includes(p.status) || (p.status === 'booked' && dateKey(p.bookedAt) === today)),
        )
        if (open) {
          return res.status(409).json({ error: 'This phone already has a token for this doctor.', code: 'deviceLimit', token: open.token })
        }
        args.device = device
        // Scanned the hospital's code while registering: already here.
        if (checkin?.valid(req.body?.checkInCode)) args.here = true
      }
      // A key only this patient's phone gets, to pay and to see their own bill.
      args.secret = crypto.randomBytes(16).toString('hex')
    }
    const { result, patch, publicPatch } = hospital.act(name, args)
    audit.log(req.staff, name, actionDetail(name, args, result, hospital.getState(true)))
    // The person who registered gets their own full record back; nobody else's.
    res.json({ result, patch: req.staff ? patch : publicPatch })
  })

  // The patient's own record, checked with the key only their phone has.
  const own = (pid, secret) => {
    const p = hospital.raw().patients[String(pid || '')]
    const s = Buffer.from(String(secret || ''))
    return p && p.secret && s.length === Buffer.byteLength(p.secret) && crypto.timingSafeEqual(s, Buffer.from(p.secret)) ? p : null
  }

  // A patient's own record (name, bill items), for their own phone only.
  r.get('/my/:pid', (req, res) => {
    const p = own(req.params.pid, req.query.secret)
    if (!p) return res.status(404).json({ error: 'Not found' })
    res.json({ patient: ownRecord(p) })
  })

  // "How was your visit?" from the patient's own phone, once.
  r.post('/feedback', (req, res) => {
    const b = req.body || {}
    const p = own(b.pid, b.secret)
    if (!p) return res.status(404).json({ error: 'Not found' })
    const score = SCORES.includes(b.score) ? b.score : bad('score')
    const reasons = Array.isArray(b.reasons) ? b.reasons.filter((x) => REASONS.includes(x)) : []
    const { result } = hospital.act('giveFeedback', { pid: p.id, score, reasons, via: 'app' })
    if (!result) return res.status(409).json({ error: 'Feedback is taken once, after the visit', code: 'notNow' })
    res.json({ ok: true })
  })

  r.get('/conditions', async (req, res) => {
    // Only staff may skip the cache: each fetch runs the n8n feed (and its traffic key).
    res.json(await getConditions({ force: req.query.force === '1' && !!req.staff }))
  })

  r.get('/forecast', async (req, res) => {
    const cond = await getConditions()
    res.json(buildForecast(hospital.getState(false), cond, req.query.lang === 'hi' ? 'hi' : 'en', await stats.learned(), await signals.forForecast()))
  })

  r.get('/config', admin, async (req, res) => {
    res.json(await store.getConfig())
  })

  r.put('/config', admin, async (req, res) => {
    const b = req.body || {}
    const cfg = {}
    if (b.eventsUrl !== undefined) cfg.eventsUrl = okUrl(String(b.eventsUrl).trim()) ? String(b.eventsUrl).trim() : bad('eventsUrl')
    if (b.feedUrl !== undefined) cfg.feedUrl = okUrl(String(b.feedUrl).trim()) ? String(b.feedUrl).trim() : bad('feedUrl')
    if (b.lat !== undefined) cfg.lat = Math.abs(Number(b.lat)) <= 90 ? Number(b.lat) : bad('lat')
    if (b.lon !== undefined) cfg.lon = Math.abs(Number(b.lon)) <= 180 ? Number(b.lon) : bad('lon')
    // The town or district for local news (English and Hindi names).
    for (const k of ['place', 'placeHi']) {
      if (b[k] === undefined) continue
      const v = String(b[k]).trim()
      cfg[k] = v.length <= 60 && !/[<>"(){}]/.test(v) ? v : bad(k)
    }
    audit.log(req.staff, 'configChanged', { fields: Object.keys(cfg) })
    res.json(await store.setConfig(cfg))
  })

  r.get('/n8n/log', admin, async (req, res) => {
    res.json(await store.getLog())
  })

  r.post('/n8n/test', admin, async (req, res) => {
    res.json({ status: await notifier.post('test', { message: 'Test from OPD Saathi' }) })
  })

  // Phone alerts (web push).
  r.get('/push/key', (req, res) => {
    res.json({ publicKey: push.publicKey })
  })

  r.post('/push/subscribe', async (req, res) => {
    const b = req.body || {}
    try {
      await push.subscribe(hospital.getState(true), {
        pid: String(b.pid || ''),
        token: String(b.token || ''),
        lang: b.lang,
        subscription: b.subscription,
      })
    } catch (err) {
      return res.status(400).json({ error: `Invalid ${err.message}` })
    }
    res.json({ ok: true })
  })

  r.post('/push/unsubscribe', async (req, res) => {
    const b = req.body || {}
    await push.unsubscribe({ endpoint: String(b.endpoint || ''), pid: String(b.pid || '') })
    res.json({ ok: true })
  })

  // What the forecast has learned from this hospital's registrations.
  r.get('/stats/learned', async (req, res) => {
    res.json({ learned: await stats.learned() })
  })

  r.post('/stats/sample', auth.requireRole('demo'), async (req, res) => {
    const days = await stats.loadSample(hospital.getState(false))
    audit.log(req.staff, 'historyLoaded', { days })
    res.json({ days })
  })

  r.delete('/stats', auth.requireRole('demo'), async (req, res) => {
    await stats.clear()
    audit.log(req.staff, 'historyCleared')
    res.json({ ok: true })
  })

  // Activity log (admin).
  r.get('/audit', auth.requireRole('audit'), async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 200))
    const actor = typeof req.query.actor === 'string' && req.query.actor ? req.query.actor.slice(0, 40) : undefined
    const action = AUDIT_GROUPS[req.query.group]
    res.json({ entries: await audit.list({ limit, actor, action }), actors: await audit.actors() })
  })

  // Bad input anywhere above -> 400 with a short message.
  r.use((err, req, res, next) => {
    if (err instanceof BadRequest) return res.status(400).json({ error: `Invalid ${err.message}` })
    next(err)
  })

  return r
}
