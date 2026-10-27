// PM-JAY claims: the steps a claim goes through. Shared by the server (which
// keeps the claims) and the staff screens (which show the next steps).
//
//   preauthSent ─approve─> preauthApproved ─discharge─> discharged ─submit─> claimSent
//     │ ↑reply                                                                │ ↑reply
//     ├─query─> preauthQuery                                     claimQuery <─query─┤
//     └─reject─> preauthRejected                              claimRejected <─reject─┤
//                                      paid <─paid─ claimApproved <─approve──────────┘
//
// Any open claim can also be cancelled (started by mistake, patient left).
// Care never waits for any of this: these are the hospital's papers.

import { packageById, DOCS } from '../data/pmjay.js'

export const STAGES = [
  'preauthSent',
  'preauthQuery',
  'preauthApproved',
  'preauthRejected',
  'discharged',
  'claimSent',
  'claimQuery',
  'claimApproved',
  'claimRejected',
  'paid',
  'cancelled',
]
export const CLOSED = ['preauthRejected', 'claimRejected', 'paid', 'cancelled']

const NEXT = {
  preauthSent: ['preauthApprove', 'preauthQuery', 'preauthReject'],
  preauthQuery: ['reply'],
  preauthApproved: ['discharge'],
  discharged: ['submit'],
  claimSent: ['claimApprove', 'claimQuery', 'claimReject'],
  claimQuery: ['reply'],
  claimApproved: ['paid'],
}
// Steps that record what PM-JAY decided (the rest are the hospital's own).
export const DECISIONS = ['preauthApprove', 'preauthQuery', 'preauthReject', 'claimApprove', 'claimQuery', 'claimReject', 'paid']

export const isOpen = (c) => !CLOSED.includes(c.stage)
export const nextSteps = (c) => (isOpen(c) ? [...NEXT[c.stage], 'cancel'] : [])

// Who has to act: the hospital ("us"), the ward (patient still admitted),
// PM-JAY, or nobody.
export function whoseTurn(c) {
  if (!isOpen(c)) return 'closed'
  if (['preauthQuery', 'claimQuery', 'discharged'].includes(c.stage)) return 'us'
  if (c.stage === 'preauthApproved') return 'ward'
  return 'pmjay'
}

export class ClaimError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}
const fail = (code) => {
  throw new ClaimError(code)
}

// input: { pid?, token?, name, nameHi?, age, gender, dept, pkg, ward, emergency, tms?, sample? }
export function newClaim(input, { id, by, now }) {
  const pkg = packageById[input.pkg] || fail('package')
  return {
    id,
    pid: input.pid || null,
    token: input.token || null,
    name: input.name,
    nameHi: input.nameHi || '',
    age: input.age,
    gender: input.gender,
    dept: input.dept,
    pkg: pkg.id,
    rate: pkg.rate,
    ward: input.ward || pkg.ward,
    emergency: !!input.emergency,
    tms: input.tms || '',
    stage: 'preauthSent',
    docs: Object.fromEntries(DOCS.map((d) => [d, false])),
    approved: null,
    claimed: null,
    settled: null,
    paid: null,
    payRef: '',
    createdAt: now,
    dischargedAt: null,
    stageAt: now,
    updatedAt: now,
    history: [{ at: now, step: 'create', stage: 'preauthSent', by }],
    sample: !!input.sample,
  }
}

const amountOk = (a, max) => Number.isInteger(a) && a > 0 && a <= max

// Returns the claim after one step, or throws a ClaimError with a code
// (closed, notNow, note, amount, docs, step).
export function claimStep(c, step, args = {}, { by, now }) {
  if (!isOpen(c)) fail('closed')
  const n = structuredClone(c)
  n.updatedAt = now
  const note = String(args.note || '').trim()

  // Ticking papers and the portal's case number: any time while open.
  if (step === 'update') {
    for (const d of DOCS) if (typeof args.docs?.[d] === 'boolean') n.docs[d] = args.docs[d]
    if (typeof args.tms === 'string') n.tms = args.tms
    return n
  }
  if (!nextSteps(c).includes(step)) fail('notNow')
  const go = (stage, amount) => {
    n.stage = stage
    n.stageAt = now
    n.history.push({ at: now, step, stage, by, ...(note ? { note } : {}), ...(amount != null ? { amount } : {}) })
  }
  switch (step) {
    case 'preauthApprove': {
      const amount = args.amount ?? c.rate
      if (!amountOk(amount, c.rate)) fail('amount')
      n.approved = amount
      go('preauthApproved', amount)
      break
    }
    case 'preauthQuery':
    case 'claimQuery':
      if (!note) fail('note')
      go(step)
      break
    case 'preauthReject':
    case 'claimReject':
      if (!note) fail('note')
      go(step === 'preauthReject' ? 'preauthRejected' : 'claimRejected')
      break
    case 'reply':
      if (!note) fail('note')
      go(c.stage === 'preauthQuery' ? 'preauthSent' : 'claimSent')
      break
    case 'discharge':
      n.dischargedAt = now
      go('discharged')
      break
    case 'submit':
      if (DOCS.some((d) => !n.docs[d])) fail('docs')
      n.claimed = n.approved
      go('claimSent', n.claimed)
      break
    case 'claimApprove': {
      const amount = args.amount ?? c.claimed
      if (!amountOk(amount, c.claimed)) fail('amount')
      // A cut needs a reason, so the desk can check it.
      if (amount < c.claimed && !note) fail('note')
      n.settled = amount
      go('claimApproved', amount)
      break
    }
    case 'paid': {
      const amount = args.amount ?? c.settled
      if (!amountOk(amount, c.settled)) fail('amount')
      n.paid = amount
      n.payRef = String(args.ref || '')
      go('paid', amount)
      break
    }
    case 'cancel':
      if (!note) fail('note')
      go('cancelled')
      break
    default:
      fail('step')
  }
  return n
}

// What the patient's own phone may know (kept on their queue record; the
// public queue never has it).
export function patientView(c) {
  if (c.stage === 'cancelled') return null
  const view = ['preauthSent', 'preauthQuery'].includes(c.stage)
    ? 'asking'
    : c.stage === 'preauthApproved'
      ? 'approved'
      : c.stage === 'preauthRejected'
        ? 'notApproved'
        : 'done'
  return { id: c.id, stage: c.stage, view, pkg: c.pkg }
}

export function claimTotals(claims) {
  const t = { open: 0, us: 0, ward: 0, pmjay: 0, waiting: 0, approved: 0, received: 0 }
  for (const c of claims) {
    const w = whoseTurn(c)
    if (w !== 'closed') {
      t.open++
      t[w]++
    }
    if (['claimSent', 'claimQuery'].includes(c.stage)) t.waiting += c.claimed
    if (c.stage === 'claimApproved') t.approved += c.settled
    if (c.stage === 'paid') t.received += c.paid
  }
  return t
}

export const daysSince = (at, now) => Math.max(0, Math.floor((now - at) / 86400000))

// Made-up claims at every stage, spread over the last three weeks, so the
// claims desk has something to show in a demo.
export function sampleClaims(now, firstNum, by) {
  const D = 86400000
  const people = [
    ['Kamla', 'कमला', 62, 'f', 'MED', 'pneumonia', 18, ['preauthApprove', 'discharge', 'docs', 'submit', 'claimApprove', 'paid']],
    ['Aarav', 'आरव', 4, 'm', 'CHD', 'diarrhoea', 15, ['preauthApprove', 'discharge', 'docs', 'submit', 'claimApprove']],
    ['Mohan', 'मोहन', 68, 'm', 'BON', 'fracture', 12, ['preauthApprove', 'discharge', 'docs', 'submit', 'claimQuery']],
    ['Sunita', 'सुनीता', 27, 'f', 'WMN', 'delivery', 9, ['preauthApprove', 'discharge', 'docs', 'submit']],
    ['Gopal', 'गोपाल', 71, 'm', 'EYE', 'cataract', 6, ['preauthApprove', 'discharge']],
    ['Lakshmi', 'लक्ष्मी', 58, 'f', 'MED', 'fever', 3, ['preauthApprove']],
    ['Ishaan', 'ईशान', 7, 'm', 'CHD', 'childPneumonia', 1, ['preauthQuery']],
    ['Rekha', 'रेखा', 31, 'f', 'WMN', 'caesarean', 0, []],
  ]
  const notes = { claimQuery: 'Please add the X-ray report.', preauthQuery: 'Please send the chest X-ray.', claimApprove: '' }
  return people.map(([name, nameHi, age, gender, dept, pkg, daysAgo, steps], i) => {
    let at = now - daysAgo * D
    let c = newClaim({ name, nameHi, age, gender, dept, pkg, emergency: i === 1, sample: true, tms: `DEMO-${1000 + i}` }, { id: claimId(firstNum + i), by, now: at })
    for (const s of steps) {
      at = Math.min(at + D, now)
      if (s === 'docs') c = claimStep(c, 'update', { docs: Object.fromEntries(DOCS.map((d) => [d, true])) }, { by, now: at })
      else c = claimStep(c, s, { note: notes[s], ref: s === 'paid' ? `DEMO-UTR-${4000 + i}` : '' }, { by, now: at })
    }
    return c
  })
}

export const claimId = (n) => `CL-${String(n).padStart(4, '0')}`
