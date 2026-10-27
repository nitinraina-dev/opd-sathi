// Payments.
// Three modes, chosen by an admin on the staff Payments screen:
//   demo  a dummy UPI flow: nothing is charged ("I have paid" is simulated)
//   test  Razorpay test keys: real checkout, test money only
//   live  Razorpay live keys: real money
// Key secrets are encrypted in the database and never sent to a browser.
// A payment is confirmed by the patient's phone (checkout signature) or by
// Razorpay's webhook, whichever comes first; paying twice is not possible.

import crypto from 'node:crypto'
import { Router } from 'express'
import { billSummary, upiLink } from '../../client/src/lib/billing.js'
import { UPI_PAYEE } from '../../client/src/data/fees.js'

const MODES = ['demo', 'test', 'live']
const RZP = 'https://api.razorpay.com/v1'

const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex')
const sameText = (a, b) => {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}
const mask = (v) => (v ? `${'•'.repeat(6)}${String(v).slice(-4)}` : '')

export async function createPayments({ store, hospital, audit, box, auth }) {
  const intents = new Map() // payId -> { pid, amount, mode, orderId, at }

  async function load() {
    return { mode: 'demo', test: {}, live: {}, upi: { ...UPI_PAYEE }, ...((await store.getSecret('payments')) || {}) }
  }

  // What an admin sees: key ids, and whether secrets are saved (never the secrets).
  const describe = (s) => ({
    mode: s.mode,
    upi: s.upi,
    test: { keyId: s.test.keyId || '', secret: mask(box.open(s.test.keySecret)), webhook: mask(box.open(s.test.webhookSecret)) },
    live: { keyId: s.live.keyId || '', secret: mask(box.open(s.live.keySecret)), webhook: mask(box.open(s.live.webhookSecret)) },
  })

  const keysFor = (s, mode) => ({
    keyId: s[mode]?.keyId || '',
    keySecret: box.open(s[mode]?.keySecret),
    webhookSecret: box.open(s[mode]?.webhookSecret),
  })

  async function razorpay(keys, path, body) {
    const res = await fetch(`${RZP}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(j.error?.description || `Razorpay ${res.status}`)
      err.status = res.status
      throw err
    }
    return j
  }

  // The patient's own record, checked with the key only their phone has.
  function own(pid, secret) {
    const p = hospital.raw().patients[pid]
    return p && sameText(p.secret, secret) ? p : null
  }

  // items: the bill items the payment was for (so a test added meanwhile stays due).
  function settle(pid, items, method, mode, ref) {
    const p = hospital.raw().patients[pid]
    if (!p || billSummary(p).due <= 0) return null
    const { result } = hospital.act('payBill', { pid, method, mode, ref, items })
    if (result) audit.log(null, 'payBill', { token: p.token, amount: result.amount, method, mode, receipt: result.receipt })
    return result
  }

  const router = Router()

  // For the patient's phone: which way to pay, and the public key id.
  router.get('/pay/config', async (req, res) => {
    const s = await load()
    const keyId = s.mode === 'demo' ? '' : s[s.mode]?.keyId || ''
    res.json({ mode: s.mode === 'demo' || keyId ? s.mode : 'demo', keyId, upi: s.upi })
  })

  router.post('/pay/start', async (req, res) => {
    const { pid, secret } = req.body || {}
    const p = own(String(pid || ''), String(secret || ''))
    if (!p) return res.status(403).json({ error: 'Not your bill' })
    const bill = billSummary(p)
    const amount = bill.due
    if (amount <= 0) return res.status(400).json({ error: 'Nothing to pay' })
    const items = bill.items.filter((i) => i.status === 'due').map((i) => i.id)
    const s = await load()
    const payId = crypto.randomBytes(12).toString('hex')
    const keys = keysFor(s, s.mode)
    if (s.mode === 'demo' || !keys.keyId || !keys.keySecret) {
      intents.set(payId, { pid: p.id, amount, items, mode: 'demo', at: Date.now() })
      return res.json({ mode: 'demo', payId, amount, token: p.token, upi: upiLink(amount, p.token), payee: s.upi })
    }
    try {
      const order = await razorpay(keys, '/orders', {
        amount: amount * 100,
        currency: 'INR',
        receipt: `${p.token}-${payId.slice(0, 8)}`,
        notes: { pid: p.id, token: p.token, payId },
      })
      intents.set(payId, { pid: p.id, amount, items, mode: s.mode, orderId: order.id, at: Date.now() })
      res.json({ mode: s.mode, payId, amount, token: p.token, orderId: order.id, keyId: keys.keyId })
    } catch (err) {
      console.warn('Razorpay order failed:', err.message)
      res.status(502).json({ error: 'The payment service did not answer. Please pay at the counter.' })
    }
  })

  router.post('/pay/confirm', async (req, res) => {
    const b = req.body || {}
    const p = own(String(b.pid || ''), String(b.secret || ''))
    const intent = intents.get(String(b.payId || ''))
    if (!p || !intent || intent.pid !== p.id) return res.status(403).json({ error: 'Payment not found' })
    if (intent.mode === 'demo') {
      const r = settle(p.id, intent.items, 'upi', 'demo', `DEMO-${String(b.payId).slice(0, 8).toUpperCase()}`)
      intents.delete(b.payId)
      return res.json(r || { already: true })
    }
    const s = await load()
    const keys = keysFor(s, intent.mode)
    const ok =
      b.razorpay_order_id === intent.orderId &&
      sameText(hmac(keys.keySecret, `${b.razorpay_order_id}|${b.razorpay_payment_id}`), b.razorpay_signature)
    if (!ok) return res.status(400).json({ error: 'The payment could not be checked' })
    const r = settle(p.id, intent.items, 'online', intent.mode, String(b.razorpay_payment_id))
    intents.delete(b.payId)
    res.json(r || { already: true })
  })

  // Admin: payment settings.
  const admin = auth.requireRole('paymentSettings')

  router.get('/pay/settings', admin, async (req, res) => {
    res.json(describe(await load()))
  })

  router.put('/pay/settings', admin, async (req, res) => {
    const b = req.body || {}
    const s = await load()
    const changed = []
    if (b.mode !== undefined) {
      if (!MODES.includes(b.mode)) return res.status(400).json({ error: 'Unknown mode' })
      if (b.mode !== 'demo') {
        const k = { keyId: b[b.mode]?.keyId ?? s[b.mode].keyId, secret: b[b.mode]?.keySecret || box.open(s[b.mode].keySecret) }
        if (!k.keyId || !k.secret) return res.status(400).json({ error: `Save the ${b.mode} keys first` })
      }
      if (s.mode !== b.mode) changed.push(`mode:${b.mode}`)
      s.mode = b.mode
    }
    for (const m of ['test', 'live']) {
      const k = b[m]
      if (!k) continue
      if (k.keyId !== undefined) {
        const id = String(k.keyId).trim()
        if (id && !new RegExp(`^rzp_${m}_[A-Za-z0-9]{6,40}$`).test(id)) {
          return res.status(400).json({ error: `A ${m} key id starts with rzp_${m}_` })
        }
        if (id !== (s[m].keyId || '')) changed.push(`${m}.keyId`)
        s[m].keyId = id
      }
      if (k.keySecret) {
        s[m].keySecret = box.seal(String(k.keySecret).trim())
        changed.push(`${m}.keySecret`)
      }
      if (k.webhookSecret) {
        s[m].webhookSecret = box.seal(String(k.webhookSecret).trim())
        changed.push(`${m}.webhookSecret`)
      }
      if (k.clear) {
        s[m] = {}
        changed.push(`${m}.cleared`)
        if (s.mode === m) s.mode = 'demo'
      }
    }
    if (b.upi) {
      const vpa = String(b.upi.vpa || '').trim()
      if (vpa && !/^[\w.-]{2,}@[\w.-]{2,}$/.test(vpa)) return res.status(400).json({ error: 'A UPI ID looks like name@bank' })
      s.upi = { vpa: vpa || UPI_PAYEE.vpa, name: String(b.upi.name || UPI_PAYEE.name).slice(0, 60) }
      changed.push('upi')
    }
    await store.setSecret('payments', s)
    audit.log(req.staff, 'paymentSettings', { changed })
    res.json(describe(s))
  })

  // Admin: check the keys with Razorpay (no money moves).
  router.post('/pay/check', admin, async (req, res) => {
    const mode = req.body?.mode === 'live' ? 'live' : 'test'
    const keys = keysFor(await load(), mode)
    if (!keys.keyId || !keys.keySecret) return res.json({ ok: false, error: `No ${mode} keys saved` })
    try {
      await razorpay(keys, '/orders?count=1')
      res.json({ ok: true })
    } catch (err) {
      res.json({ ok: false, error: err.status === 401 ? 'Razorpay says these keys are wrong' : err.message })
    }
  })

  // Razorpay calls this when a payment is captured (set the URL and the
  // webhook secret in the Razorpay dashboard). Mounted with the raw body.
  async function webhook(req, res) {
    const s = await load()
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : ''
    const sig = req.get('x-razorpay-signature')
    const mode = ['live', 'test'].find((m) => {
      const secret = keysFor(s, m).webhookSecret
      return secret && sameText(hmac(secret, raw), sig)
    })
    if (!mode) return res.status(400).json({ error: 'Bad signature' })
    let event = {}
    try {
      event = JSON.parse(raw)
    } catch {
      return res.status(400).json({ error: 'Bad body' })
    }
    const pay = event.payload?.payment?.entity
    if ((event.event === 'payment.captured' || event.event === 'order.paid') && pay) {
      // Find the patient through our own record of the order, or the order's notes.
      const intent = [...intents.entries()].find(([, i]) => i.orderId && i.orderId === pay.order_id)
      const notes = event.payload?.order?.entity?.notes || pay.notes || {}
      const pid = intent?.[1].pid || notes.pid
      const p = pid && hospital.raw().patients[pid]
      // Without our record (server restarted), only settle if the whole amount due was paid.
      if (p && (intent || pay.amount >= billSummary(p).due * 100)) {
        settle(pid, intent?.[1].items || null, 'online', mode, pay.id)
        if (intent) intents.delete(intent[0])
      }
    }
    res.json({ ok: true })
  }

  return { router, webhook }
}
