// OPD Saathi server (Express + MongoDB).
// Holds the shared hospital state, streams changes to every screen, runs the
// demo doctors, checks staff logins, sends phone alerts, talks to n8n and
// Telegram, and serves the built React app in production.

import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openStore } from './db.js'
import { createHospital } from './hospital.js'
import { createNotifier } from './n8n.js'
import { createConditions } from './conditions.js'
import { createAuth } from './auth.js'
import { createPush } from './push.js'
import { createStats } from './stats.js'
import { createAudit } from './audit.js'
import { createSecretBox } from './secretbox.js'
import { createPayments } from './payments.js'
import { createClaims } from './claims.js'
import { createCheckIn } from './checkin.js'
import { createSignals } from './signals.js'
import { createAsk } from './ask.js'
import { createSms } from './sms.js'
import { createDemo } from './demo.js'
import { createTelegram } from './telegram.js'
import { apiRouter } from './api.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 5050
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/opd-saathi'

const store = await openStore(MONGODB_URI)
const notifier = createNotifier(store)
const push = await createPush(store)
const audit = createAudit(store)
const getConditions = createConditions(store)
const stats = createStats(store, getConditions)
const auth = await createAuth(store, audit)
const hospital = await createHospital(store, { notifier, push, stats })
const box = await createSecretBox(store)
const payments = await createPayments({ store, hospital, audit, box, auth })
const claims = createClaims({ store, hospital, audit, auth })
const checkin = createCheckIn({ hospital, audit, auth })
const signals = createSignals({ store, hospital, stats, audit, auth })
stats.useSignals(signals.kindsOn)
const ask = createAsk({ hospital })
const sms = createSms({ hospital, checkin, audit })
const demo = createDemo({ hospital, stats, claims, signals, audit, auth })
const telegram = createTelegram({ store, hospital })

const app = express()
app.disable('x-powered-by')
// Behind a hosting proxy (Render, a tunnel, nginx) set TRUST_PROXY=1 so login
// cookies are marked Secure and the login rate limit sees real addresses.
const trust = process.env.TRUST_PROXY
app.set('trust proxy', trust ? (Number.isNaN(Number(trust)) ? trust : Number(trust)) : 'loopback')
// Razorpay's webhook needs the exact bytes it sent, to check the signature.
app.post('/api/pay/webhook', express.raw({ type: '*/*', limit: '200kb' }), (req, res, next) => payments.webhook(req, res).catch(next))
app.use(express.json({ limit: '50kb' }))

// Only needed when the React app is hosted somewhere else.
if (process.env.CLIENT_ORIGIN) {
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', process.env.CLIENT_ORIGIN)
    res.set('Access-Control-Allow-Credentials', 'true')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
}

// Changes must be sent as JSON. Other sites cannot send JSON with the staff
// cookie without asking first, which blocks cross-site request forgery.
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Send JSON' })
  }
  next()
})

app.use('/api', auth.middleware)
app.use('/api', auth.router)
app.use('/api', payments.router)
app.use('/api', claims.router)
app.use('/api', checkin.router)
app.use('/api', signals.router)
app.use('/api', ask.router)
app.use('/api', sms.router)
app.use('/api', demo.router)
app.use('/api', telegram.router)
app.use('/api', apiRouter({ hospital, store, notifier, getConditions, auth, push, stats, audit, checkin, signals }))

// Production: serve the built React app (npm run build) from the same server.
const dist = path.resolve(here, '../../client/dist')
if (fs.existsSync(dist)) {
  app.use(
    express.static(dist, {
      index: false,
      // Built files have a content hash in their name, so they never change.
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable')
      },
    }),
  )
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Server error' })
})

app.listen(PORT, () => {
  console.log(`OPD Saathi server on http://localhost:${PORT}  (storage: ${store.describe})`)
})
