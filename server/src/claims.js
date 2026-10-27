// PM-JAY (Ayushman Bharat) claims desk.
// OPD Saathi does not connect to PM-JAY. Staff do each step in the PM-JAY
// portal (TMS) and record it here, so the desk, the doctors and the patient
// can see where every claim is. In the demo, staff also play PM-JAY's part.
// We never ask for or keep a PM-JAY card, Aadhaar or ABHA number.
//
//   GET  /api/claims                  all claims (staff)
//   POST /api/claims                  admit under PM-JAY: start a claim
//   POST /api/claims/:id/step         one step (see lib/claims.js)
//   POST /api/claims/sample           add made-up claims (admin)
//   DELETE /api/claims/sample         remove them (admin)

import { Router } from 'express'
import { newClaim, claimStep, patientView, sampleClaims, claimId, ClaimError, STAGES } from '../../client/src/lib/claims.js'
import { packageById, WARDS } from '../../client/src/data/pmjay.js'
import { departments } from '../../client/src/data/departments.js'
import { can } from '../../client/src/lib/permissions.js'

const STEPS = ['update', 'cancel', 'reply', 'discharge', 'submit', 'preauthApprove', 'preauthQuery', 'preauthReject', 'claimApprove', 'claimQuery', 'claimReject', 'paid']
const CASE_NO = /^[A-Za-z0-9/_-]{0,40}$/

class Bad extends Error {
  constructor(code, msg) {
    super(msg)
    this.code = code
  }
}
const bad = (code, msg) => {
  throw new Bad(code, msg)
}
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function createClaims({ store, hospital, audit, auth }) {
  const router = Router()
  // Claim writes run one after another, so two desks cannot overwrite each other.
  let chain = Promise.resolve()
  const serial = (fn) => {
    const run = chain.then(fn)
    chain = run.catch(() => {})
    return run
  }

  // Copy the claim's stage onto the patient's queue record (for their phone),
  // if that patient is still in today's queue.
  function mirror(c) {
    const p = c.pid && hospital.raw().patients[c.pid]
    if (p && p.createdAt === c.patientAt) hospital.act('setClaim', { pid: c.pid, claim: patientView(c) })
  }

  const send = (res, fn) =>
    serial(fn)
      .then((out) => res.json(out))
      .catch((err) => {
        if (err instanceof Bad || err instanceof ClaimError) return res.status(400).json({ error: err.message || err.code, code: err.code })
        console.error(err)
        res.status(500).json({ error: 'Server error' })
      })

  async function nextNum() {
    const nums = (await store.listClaims()).map((c) => Number(c.id.slice(3)) || 0)
    return Math.max(0, ...nums) + 1
  }

  router.get('/claims', auth.requireRole('claims'), async (req, res) => {
    res.json({ claims: await store.listClaims() })
  })

  router.post('/claims', auth.requireRole('claimEdit'), (req, res) =>
    send(res, async () => {
      const b = req.body || {}
      const pkg = packageById[b.pkg] || bad('package', 'Pick a package')
      const ward = b.ward ? (WARDS.includes(b.ward) ? b.ward : bad('ward', 'Unknown ward')) : pkg.ward
      const tms = text(b.tms, 40)
      if (!CASE_NO.test(tms)) bad('tms', 'A case number has only letters, numbers, / and -')
      let who
      let p = null
      if (b.pid) {
        p = hospital.raw().patients[String(b.pid)] || bad('patient', 'Patient not found')
        if (!['waiting', 'called', 'done', 'emergency'].includes(p.status)) bad('notHere', 'Check the patient in first')
        // Free patients (seniors, small children) were never asked for a card at the counter.
        const checked = p.waiver?.card === 'pmjay' && p.waiver.status === 'approved'
        if (!checked && b.cardSeen !== true) bad('cardSeen', 'Look at the PM-JAY card first')
        if (p.claim && !['preauthRejected', 'claimRejected', 'paid', 'cancelled'].includes(p.claim.stage)) bad('already', 'This patient already has an open claim')
        who = { pid: p.id, token: p.token, name: p.name, nameHi: p.nameHi, age: p.age, gender: p.gender, dept: p.dept || pkg.dept }
      } else {
        // Someone not in today's OPD queue, e.g. admitted from Emergency.
        if (b.cardSeen !== true) bad('cardSeen', 'Look at the PM-JAY card first')
        const name = text(b.name, 40) || bad('name', 'Name needed')
        const age = Number(b.age)
        if (!Number.isInteger(age) || age < 0 || age > 120) bad('age', 'Age 0 to 120')
        if (!['f', 'm', 'x'].includes(b.gender)) bad('gender', 'Gender needed')
        if (!departments.some((d) => d.id === b.dept)) bad('dept', 'Unknown department')
        who = { name, age, gender: b.gender, dept: b.dept }
      }
      const c = newClaim({ ...who, pkg: pkg.id, ward, emergency: b.emergency === true || p?.kind === 'emergency', tms }, { id: claimId(await nextNum()), by: req.staff.username, now: Date.now() })
      if (p) c.patientAt = p.createdAt
      await store.saveClaim(c)
      mirror(c)
      audit.log(req.staff, 'claimCreated', { claim: c.id, token: c.token, pkg: c.pkg, emergency: c.emergency })
      return { claim: c }
    }),
  )

  // Made-up claims at every stage (replacing earlier samples).
  async function addSamples(staff) {
    await store.deleteSampleClaims()
    const made = sampleClaims(Date.now(), await nextNum(), staff.username)
    for (const c of made) await store.saveClaim(c)
    audit.log(staff, 'claimSamples', { n: made.length })
    return made.length
  }

  router.post('/claims/sample', auth.requireRole('claimSamples'), (req, res) =>
    send(res, async () => ({ n: await addSamples(req.staff) })),
  )

  router.delete('/claims/sample', auth.requireRole('claimSamples'), (req, res) =>
    send(res, async () => {
      await store.deleteSampleClaims()
      audit.log(req.staff, 'claimSamples', { n: 0 })
      return { ok: true }
    }),
  )

  router.post('/claims/:id/step', auth.requireRole('claims'), (req, res) =>
    send(res, async () => {
      const b = req.body || {}
      const step = STEPS.includes(b.step) ? b.step : bad('step', 'Unknown step')
      if (!can(req.staff, step === 'paid' ? 'claimPaid' : 'claimEdit')) {
        res.status(403)
        return { error: 'Not allowed for your role' }
      }
      const c = (await store.getClaim(String(req.params.id))) || bad('notFound', 'Claim not found')
      const args = { note: text(b.note, 300), ref: text(b.ref, 40) }
      if (b.amount !== undefined && b.amount !== null && b.amount !== '') args.amount = Number(b.amount)
      if (b.docs && typeof b.docs === 'object') args.docs = b.docs
      if (b.tms !== undefined) {
        args.tms = text(b.tms, 40)
        if (!CASE_NO.test(args.tms)) bad('tms', 'A case number has only letters, numbers, / and -')
      }
      if (!CASE_NO.test(args.ref)) bad('ref', 'A reference has only letters, numbers, / and -')
      const next = claimStep(c, step, args, { by: req.staff.username, now: Date.now() })
      if (!STAGES.includes(next.stage)) bad('step', 'Bad stage')
      await store.saveClaim(next)
      if (next.stage !== c.stage) mirror(next)
      if (step !== 'update' || next.tms !== c.tms) {
        const last = next.history.at(-1)
        audit.log(req.staff, 'claimStep', { claim: next.id, token: next.token, step, stage: next.stage, amount: step === 'update' ? null : (last.amount ?? null) })
      }
      return { claim: next }
    }),
  )

  return { router, addSamples }
}
