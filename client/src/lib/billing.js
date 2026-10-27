// Bills: the OPD fee and any tests, what is paid, free or still to pay.
// Pure functions, used by the engine (server and browser) and the screens.

import { FREE_AUTO, UPI_PAYEE } from '../data/fees.js'

// Free care that needs no card: older people, young children, pregnancy care.
export function autoFreeReason({ age, dept }) {
  if (dept && FREE_AUTO.depts.includes(dept)) return 'pregnancy'
  if (age != null && age >= FREE_AUTO.seniorAge) return 'senior'
  if (age != null && age < FREE_AUTO.childUnder) return 'child'
  return null
}

// What staff check before free care counts: a card, an age, or pregnancy care.
export const freeCheckKind = (reason) => (reason === 'senior' || reason === 'child' ? 'age' : reason === 'pregnancy' ? 'pregnancy' : 'card')

// state: 'none' | 'due' | 'cardCheck' | 'paid' | 'free'
export function billSummary(p) {
  const items = p?.bill || []
  const sum = (status) => items.filter((i) => i.status === status).reduce((a, i) => a + i.amount, 0)
  const due = sum('due')
  const paid = sum('paid')
  const waived = sum('waived')
  let state = 'none'
  if (due > 0) state = p.waiver?.status === 'requested' ? 'cardCheck' : 'due'
  else if (paid > 0) state = 'paid'
  else if (waived > 0) state = 'free'
  return {
    due,
    paid,
    waived,
    refunded: sum('refunded'),
    state,
    items,
    freeReason: items.find((i) => i.status === 'waived')?.reason || null,
  }
}

// What the patient's phone knows without their own record: the public
// queue only says how much is due, not what for.
export function billFor(p, own) {
  if (own?.bill || p?.bill) return billSummary(own?.bill ? own : p)
  return { due: p?.billDue || 0, state: p?.billState || 'none', items: null, freeReason: null }
}

// Receipts: paid (or refunded) items grouped by receipt number.
export function receiptsOf(p) {
  const by = new Map()
  for (const i of p?.bill || []) {
    if (!i.receipt) continue
    const r = by.get(i.receipt) || { receipt: i.receipt, items: [], total: 0, method: i.method, at: i.paidAt, ref: i.ref }
    r.items.push(i)
    if (i.status === 'paid') r.total += i.amount
    by.set(i.receipt, r)
  }
  return [...by.values()].sort((a, b) => a.at - b.at)
}

// A UPI payment link (opens PhonePe, Google Pay, Paytm, BHIM… on a phone).
export function upiLink(amount, token) {
  const q = new URLSearchParams({
    pa: UPI_PAYEE.vpa,
    pn: UPI_PAYEE.name,
    am: Number(amount).toFixed(2),
    cu: 'INR',
    tn: `OPD ${token}`,
  })
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`
}

export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
