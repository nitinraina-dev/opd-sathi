// The patient's own details, kept on their phone. The live queue that
// everyone can see has no names or bill details, so the phone remembers its
// own patient's first name, and a key to fetch its own bill from the server.

import { useEffect, useState } from 'react'
import { API, CREDENTIALS, isServer } from './store.js'
import { followMoves } from './queue.js'

const KEY = 'opd-saathi-mine'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

export function rememberMine(p) {
  if (!p?.id || !p.name) return
  const all = load()
  all[p.id] = { name: p.name, nameHi: p.nameHi || '', secret: p.secret || '' }
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

// Name for a patient record: from the record (staff see it), or from this
// phone's memory (following moves to another department).
export function nameFor(state, p, lang) {
  if (!p) return ''
  if (p.name) return lang === 'hi' && p.nameHi ? p.nameHi : p.name
  const all = load()
  for (let x = p, i = 0; x && i < 10; x = x.movedFrom ? state.patients[x.movedFrom] : null, i++) {
    const m = all[x.id]
    if (m) return lang === 'hi' && m.nameHi ? m.nameHi : m.name
  }
  return ''
}

// This phone's own patients today (their latest record, after any moves).
export function myPatients(state) {
  const seen = new Set()
  return Object.keys(load())
    .map((id) => state.patients[id] && followMoves(state, state.patients[id]))
    .filter((p) => p && !seen.has(p.id) && seen.add(p.id))
}

// The key for this patient (following moves to another department).
export function secretFor(state, p) {
  const all = load()
  for (let x = p, i = 0; x && i < 10; x = x.movedFrom ? state.patients[x.movedFrom] : null, i++) {
    if (all[x.id]?.secret) return all[x.id].secret
  }
  return ''
}

// Keys the server did not recognise (the day was reset for a demo, or the
// record is gone): not asked for again on every change.
const notMine = new Set()

// This patient's full record (bill items, receipts) for their own phone.
// Staff screens and offline mode already have it in the state.
export function useMyRecord(state, p) {
  const [rec, setRec] = useState(null)
  const secret = p ? secretFor(state, p) : ''
  const full = !!p?.bill
  const sig = p ? `${p.id}|${p.billDue}|${p.billState}|${p.status}|${state.rev}` : ''
  useEffect(() => {
    if (!p || full || !isServer() || !secret || notMine.has(`${p.id}|${secret}`)) return
    let alive = true
    fetch(`${API}/api/my/${p.id}?secret=${secret}`, { credentials: CREDENTIALS })
      .then((r) => {
        if (r.status === 404) notMine.add(`${p.id}|${secret}`)
        return r.ok ? r.json() : null
      })
      .then((j) => alive && j && setRec(j.patient))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null
  if (full) return p
  return rec && rec.id === p.id ? rec : null
}
