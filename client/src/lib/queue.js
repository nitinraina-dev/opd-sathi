// Read-only helpers over the shared state: who is waiting, who is ahead,
// doctor status and the waiting-time estimate.

import { departments, deptById } from '../data/departments.js'
import { atTodayHM } from './clock.js'

export const pad3 = (n) => String(n).padStart(3, '0')

// "med42", "MED 042", "med-42" -> "MED-042" (and "MED-1000" past 999)
export function normalizeToken(input) {
  const s = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  const m = s.match(/^([A-Z]{3})0*(\d{1,4})$/)
  if (!m) return null
  return `${m[1]}-${pad3(Number(m[2]))}`
}

export function findByToken(state, token) {
  const t = normalizeToken(token)
  if (!t) return null
  return Object.values(state.patients).find((p) => p.token === t) || null
}

// A patient moved to another department gets a new record; follow the chain.
export function followMoves(state, p) {
  let cur = p
  let guard = 0
  while (cur && cur.movedTo && state.patients[cur.movedTo] && guard++ < 10) cur = state.patients[cur.movedTo]
  return cur
}

export function waitingList(state, deptId) {
  return Object.values(state.patients)
    .filter((p) => p.dept === deptId && p.status === 'waiting')
    .sort((a, b) => a.order - b.order || a.num - b.num)
}

export function aheadOf(state, p) {
  if (!p || p.status !== 'waiting') return 0
  return waitingList(state, p.dept).findIndex((x) => x.id === p.id)
}

// Tests the doctor asked for: 'pending' (at the tests), 'ready' (reports
// ready at the lab), 'back' (back in the line with them). Staff and the
// patient's own phone have the full record; the public queue only the stage.
export const reportsState = (p) => p?.reports?.status ?? p?.reportsState ?? null

// A patient who gave feedback (the public queue only says that they did).
export const hasRated = (p) => !!(p?.feedback || p?.rated)

// How this token can join the line at the hospital now, or null:
// 'booking' (booked on a phone), 'missed' (a missed turn, at the end) or
// 'reports' (back with test reports, near the front).
export function joinKind(p) {
  if (!p) return null
  if (p.status === 'booked') return 'booking'
  if (p.status === 'noshow') return 'missed'
  if (p.status === 'done' && ['pending', 'ready'].includes(reportsState(p))) return 'reports'
  return null
}

// Paper slips for people who registered on a phone and are in the line:
// 'due' (to print), 'printed' (at the counter, to take to the room),
// 'atRoom' (with the doctor) or 'given' (the patient has it).
export const slipState = (p) => (p?.slip && ['waiting', 'called'].includes(p.status) ? p.slip.status : null)

// Slips to print, soonest first: anyone already called (the doctor is
// waiting for it), then by place in the line.
export function slipsToPrint(state, deptId = null) {
  const place = (p) => (p.status === 'called' ? -1 : aheadOf(state, p))
  return Object.values(state.patients)
    .filter((p) => slipState(p) === 'due' && (!deptId || p.dept === deptId))
    .map((p) => ({ p, place: place(p) }))
    .sort((a, b) => a.place - b.place || a.p.num - b.p.num)
}

export function servingIn(state, room) {
  const id = state.rooms[room]?.servingId
  const p = id && state.patients[id]
  return p && p.status === 'called' ? p : null
}

// Average of the last 10 consultations, padded with the sample average.
export function avgConsult(state, deptId) {
  const base = deptById[deptId].avgConsultMins
  const h = (state.history[deptId] || []).slice(-10)
  const vals = [...Array(10 - h.length).fill(base), ...h]
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// Doctor status as patients should see it right now. A break that has ended
// counts as available.
export function roomState(state, room, now) {
  const r = state.rooms[room] || {}
  let status = r.status || 'available'
  let breakLeft = 0
  if (status === 'break') {
    const until = r.until ? atTodayHM(now, r.until) : 0
    if (!r.until || now >= until) status = 'available'
    else breakLeft = Math.ceil((until - now) / 60000)
  }
  return {
    status,
    until: r.until || '',
    lateBy: status === 'late' ? r.lateBy || 0 : 0,
    breakLeft,
    servingId: r.servingId || null,
  }
}

// How fast a department moves: average consultation, how many doctors are
// seeing patients, and any delay (break or running late).
export function deptTiming(state, deptId, now) {
  const d = deptById[deptId]
  const avg = avgConsult(state, deptId)
  const states = d.rooms.map((r) => roomState(state, r.room, now))
  const open = states.filter((s) => s.status !== 'break')
  const delay = open.length
    ? Math.min(...open.map((s) => s.lateBy))
    : Math.min(...states.map((s) => s.breakLeft))
  // Minutes until each open room is free: a consultation in progress takes
  // about the average time, less the time it has already run.
  const busyLeft = open.map((s) => {
    const p = s.servingId && state.patients[s.servingId]
    return p && p.status === 'called' ? Math.max(0, avg - (now - p.calledAt) / 60000) : 0
  })
  return { avg, capacity: Math.max(1, open.length), delay, states, busyLeft: busyLeft.length ? busyLeft : [0] }
}

export const round5 = (m) => Math.round(m / 5) * 5

// Estimated wait: rooms free up as their consultations end, then every
// average consultation; the person with `ahead` people before them gets the
// next free room after those. Plus any delay, rounded to 5 minutes.
export function estimateWait(state, deptId, ahead, now) {
  const { avg, delay, busyLeft } = deptTiming(state, deptId, now)
  const free = [...busyLeft]
  let at = 0
  for (let k = 0; k <= ahead; k++) {
    const i = free.indexOf(Math.min(...free))
    at = free[i]
    free[i] += avg
  }
  return round5(at + delay)
}

// Crowding: people waiting compared with seats.
export function crowdLevel(waiting, seats) {
  const r = seats ? waiting / seats : 0
  if (r < 0.7) return 'ok'
  if (r <= 1) return 'busy'
  return 'over'
}

export function totalWaiting(state) {
  return Object.values(state.patients).filter((p) => p.status === 'waiting').length
}

export function deptSummary(state, now) {
  return departments.map((d) => {
    const list = waitingList(state, d.id)
    const timing = deptTiming(state, d.id, now)
    return {
      dept: d,
      waiting: list,
      timing,
      avgWait: list.length ? round5(((list.length - 1) / 2) * (timing.avg / timing.capacity) + timing.delay) : 0,
      newWait: estimateWait(state, d.id, list.length, now),
      serving: d.rooms.map((r) => servingIn(state, r.room)),
      crowd: crowdLevel(list.length, d.seats),
    }
  })
}

export function maskMobile(m) {
  const s = String(m || '')
  return s.length >= 4 ? `${s.slice(0, 2)}xxxxxx${s.slice(-2)}` : ''
}
