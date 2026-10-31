// The hospital engine: every change to queues, tokens, flags and doctor status.
// Pure JavaScript with no browser or server code, so the same rules run:
//   - on the Express server (MERN mode, shared by every device), and
//   - in the browser (offline mode, shared between tabs with localStorage).
// Each action mutates the state `s`, may return a value, and lists events
// (for n8n: SMS, staff alerts) in `ev`.

import { simNow, makeClock, realNow, dateKey } from './clock.js'
import { initialState } from './state.js'
import { deptById, roomToDept, departments } from '../data/departments.js'
import { samplePatients } from '../data/patients.js'
import { placeById } from '../data/hospital.js'
import { waitingList, pad3, roomState, maskMobile, aheadOf, estimateWait, joinKind, reportsState } from './queue.js'
import { OPD_FEE, FREE_CARDS, testById } from '../data/fees.js'
import { SCORES, REASONS } from '../data/feedback.js'
import { autoFreeReason, billSummary } from './billing.js'

function publicInfo(p, extra = {}) {
  const d = deptById[p.dept]
  return {
    token: p.token,
    firstName: p.name,
    dept: p.dept,
    rooms: d ? d.rooms.map((r) => r.room) : [],
    floor: d ? placeById[d.rooms[0].placeId].floor : 0, // Emergency is on the ground floor
    lang: p.lang,
    mobile: p.mobile || undefined,
    ...extra,
  }
}

function addMessage(s, p, kind, now, extra = {}) {
  // Emergency visits have no phone screen to message.
  if (p.kind === 'emergency') return
  s.messages.unshift({
    id: s.seq++,
    pid: p.id,
    kind,
    token: p.token,
    dept: p.dept,
    room: extra.room ?? null,
    newToken: extra.newToken ?? null,
    amount: extra.amount ?? null,
    receipt: extra.receipt ?? null,
    to: p.mobile ? maskMobile(p.mobile) : '',
    at: now,
  })
  s.messages.length = Math.min(s.messages.length, 150)
}

// Someone back with test reports goes in after this many people.
export const RETURN_AFTER = 2

// The wait we tell a patient as they join the line, kept so it can be
// compared with the real wait when they are called.
function promiseWait(s, p, now) {
  p.est = { mins: estimateWait(s, p.dept, aheadOf(s, p), now), at: now }
}

// Anyone with 3 or fewer people ahead gets one "your turn is close" message.
function checkNear(s, ev, now) {
  for (const d of departments) {
    waitingList(s, d.id).forEach((p, ahead) => {
      if (ahead <= 3 && !p.nearAlert) {
        p.nearAlert = true
        addMessage(s, p, 'near', now)
        ev.push({ type: 'turn_near', data: publicInfo(p, { ahead }) })
      }
    })
  }
}

// The paper slip is now with the doctor: tell the patient not to queue for it.
function slipArrived(s, p, ev, now) {
  addMessage(s, p, 'slipAtRoom', now)
  ev.push({ type: 'slip_at_room', data: publicInfo(p) })
}

function newPatient(s, data, now) {
  const d = deptById[data.dept]
  const num = (s.counters[d.id] || 0) + 1
  s.counters[d.id] = num
  const id = `p${s.seq++}`
  const p = {
    id,
    token: `${d.code}-${pad3(num)}`,
    num,
    dept: d.id,
    name: String(data.name || '').trim(),
    nameHi: data.nameHi || '',
    age: data.age === '' || data.age == null ? null : Number(data.age),
    gender: data.gender || '',
    mobile: data.mobile || '',
    assisted: !!data.assisted,
    lang: data.lang || 'en',
    via: data.via || 'app',
    ...(data.device ? { device: data.device } : {}),
    status: 'waiting',
    order: data.order ?? now,
    createdAt: now,
    calledAt: null,
    doneAt: null,
    room: null,
    nearAlert: false,
    secret: data.secret || '',
  }
  // The doctor writes on a paper slip. The counter hands one over at once;
  // someone who registered on a phone gets theirs printed for them (see
  // printSlips), so they never queue at the counter for it. Moving to
  // another doctor makes a new token, so a new slip.
  if (p.via === 'app') p.slip = { status: 'due' }
  if (data.bill) {
    // Moved to another department: the bill moves too.
    p.bill = data.bill
    p.waiver = data.waiver || null
    p.payChoice = data.payChoice || 'counter'
  } else {
    // Payment never holds up the token. Free care by age or pregnancy is
    // given at once at the counter (staff can see the person); typed into a
    // phone, it is a claim that staff confirm at check-in or at the door,
    // like a free-care card.
    const free = autoFreeReason(p)
    const confirmed = free && p.via !== 'app'
    p.bill = [billItem(s, 'opd', 'opd', OPD_FEE, now, confirmed ? 'waived' : 'due', confirmed ? free : null)]
    p.payChoice = ['upi', 'counter', 'card'].includes(data.payChoice) ? data.payChoice : 'counter'
    p.waiver =
      free && !confirmed
        ? { card: free, status: 'requested', at: now }
        : !free && p.payChoice === 'card' && FREE_CARDS.includes(data.card)
          ? { card: data.card, status: 'requested', at: now }
          : null
  }
  s.patients[id] = p
  return p
}

function billItem(s, kind, code, amount, now, status = 'due', reason = null) {
  return { id: `b${s.seq++}`, kind, code, amount, status, reason, at: now }
}

// Mark what is due (or just the given items) as paid, under one receipt number.
// mode: 'demo' | 'test' | 'live' for online payments; cash has none.
function payItems(s, p, method, ref, now, items = null, mode = null) {
  const due = (p.bill || []).filter((i) => i.status === 'due' && (!items || items.includes(i.id)))
  if (!due.length) return { amount: 0, receipt: null }
  const n = (s.counters.receipt || 0) + 1
  s.counters.receipt = n
  const receipt = `R-${String(n).padStart(4, '0')}`
  for (const i of due) Object.assign(i, { status: 'paid', method, ref: ref || '', paidAt: now, receipt, ...(mode ? { mode } : {}) })
  return { amount: due.reduce((a, i) => a + i.amount, 0), receipt }
}

function approveWaiver(p, now) {
  p.waiver = { ...p.waiver, status: 'approved', decidedAt: now }
  for (const i of p.bill) if (i.status === 'due') Object.assign(i, { status: 'waived', reason: p.waiver.card })
}

function finishRoom(s, room, now) {
  const r = s.rooms[room]
  const p = r?.servingId && s.patients[r.servingId]
  if (p && p.status === 'called') {
    p.status = 'done'
    p.doneAt = now
    const mins = Math.min(30, Math.max(2, (now - p.calledAt) / 60000))
    s.history[p.dept] = [...(s.history[p.dept] || []), Math.round(mins * 10) / 10].slice(-10)
    // Thanks, and "how was your visit?" (not while tests are still to come).
    if (reportsState(p) !== 'pending' && !p.feedback) addMessage(s, p, 'done', now)
  }
  if (r) r.servingId = null
}

function callNextIn(s, room, now, ev) {
  finishRoom(s, room, now)
  const deptId = roomToDept[room]
  const next = waitingList(s, deptId)[0]
  const r = (s.rooms[room] ||= {})
  if (!next) {
    r.servingId = null
    return null
  }
  const avg = deptById[deptId].avgConsultMins
  next.status = 'called'
  next.room = room
  next.calledAt = now
  next.plannedMins = Math.round(avg * (0.6 + Math.random() * 0.8) * 10) / 10
  r.servingId = next.id
  s.calls.unshift({ id: s.seq++, token: next.token, room, dept: deptId, at: now })
  s.calls.length = Math.min(s.calls.length, 30)
  addMessage(s, next, 'called', now, { room })
  ev.push({ type: 'token_called', data: publicInfo(next, { room }) })
  return next
}

// Rooms where the demo doctor should act now (finish, or call the first patient).
export function dueRooms(s) {
  if (!s.autoRun) return []
  const now = simNow(s.clock)
  const due = []
  for (const d of departments) {
    for (const r of d.rooms) {
      const st = roomState(s, r.room, now)
      if (st.status === 'break') continue
      const p = st.servingId && s.patients[st.servingId]
      if (p && p.status === 'called') {
        if (now - p.calledAt >= (p.plannedMins || d.avgConsultMins) * 60000) due.push(r.room)
      } else if (waitingList(s, d.id).length) {
        due.push(r.room)
      }
    }
  }
  return due
}

export const ACTIONS = {
  registerPatient(s, a, ev, now) {
    const p = newPatient(s, a, now)
    // Registered on a phone away from the hospital: a booking. The place in
    // the line starts at check-in (`here`: the phone scanned the code at the
    // hospital while registering).
    if (s.arrival !== false && p.via === 'app' && !a.here) {
      p.status = 'booked'
      p.order = null
      p.bookedAt = now
    }
    if (p.status === 'waiting') promiseWait(s, p, now)
    ev.push({ type: 'registered', data: publicInfo(p, { via: p.via, booked: p.status === 'booked' }) })
    // At the counter, staff can take the cash or check the card straight away.
    if (a.cardOk && p.waiver) approveWaiver(p, now)
    if (a.paidCash) {
      const r = payItems(s, p, 'cash', '', now)
      if (r.amount) ev.push({ type: 'payment_received', data: publicInfo(p, { amount: r.amount, method: 'cash', receipt: r.receipt }) })
    }
    if (p.waiver?.status === 'requested') ev.push({ type: 'waiver_requested', data: publicInfo(p, { card: p.waiver.card }) })
    checkNear(s, ev, now)
    return { ...p }
  },

  callNext(s, { room }, ev, now) {
    const p = callNextIn(s, room, now, ev)
    checkNear(s, ev, now)
    return p ? p.token : null
  },

  markNoShow(s, { room }, ev, now) {
    const r = s.rooms[room]
    const p = r?.servingId && s.patients[r.servingId]
    if (!p) return null
    p.status = 'noshow'
    p.doneAt = now
    r.servingId = null
    addMessage(s, p, 'noshow', now, { room })
    ev.push({ type: 'no_show', data: publicInfo(p, { room }) })
    return p.token
  },

  // At the hospital: a booking joins the end of the line. Someone who missed
  // their turn (no-show) can check in again, also at the end. Bookings are
  // for the day they were made. Someone back with the test reports their
  // doctor asked for goes in near the front: they have waited once already.
  checkIn(s, { pid }, ev, now) {
    const p = s.patients[pid]
    const kind = joinKind(p)
    if (!kind) return null
    if (kind === 'booking' && dateKey(p.bookedAt) !== dateKey(now)) return null
    if (kind === 'reports' && dateKey(p.reports.at) !== dateKey(now)) return null
    if (kind === 'missed') p.rejoined = true // a missed turn, rescued
    const list = waitingList(s, p.dept)
    p.status = 'waiting'
    if (kind === 'reports') {
      // After the first RETURN_AFTER people, or at the end of a shorter line.
      // (People who registered in the same instant share a place: then just after them.)
      const [a, b] = [list[RETURN_AFTER - 1], list[RETURN_AFTER]]
      p.order = !b ? Math.max(now, ...list.map((x) => x.order)) + 1 : b.order > a.order ? (a.order + b.order) / 2 : a.order + 0.5
      p.reports = { ...p.reports, status: 'back', backAt: now }
    } else {
      p.order = Math.max(now, ...list.map((x) => x.order)) + 1
      // Waiting time counts from arrival.
      p.createdAt = now
      p.arrivedAt = now
    }
    Object.assign(p, { room: null, calledAt: null, doneAt: null, nearAlert: false })
    promiseWait(s, p, now)
    addMessage(s, p, kind === 'reports' ? 'backIn' : 'checkedIn', now)
    ev.push({ type: kind === 'reports' ? 'back_with_reports' : 'checked_in', data: publicInfo(p) })
    checkNear(s, ev, now)
    return p.token
  },

  // The lab (or the desk): the reports are ready to collect.
  reportsReady(s, { pid }, ev, now) {
    const p = s.patients[pid]
    if (!p || p.status !== 'done' || reportsState(p) !== 'pending') return null
    p.reports = { ...p.reports, status: 'ready', readyAt: now }
    addMessage(s, p, 'reportsReady', now)
    ev.push({ type: 'reports_ready', data: publicInfo(p) })
    return p.token
  },

  // "How was your visit?", once, after the doctor (phone, SMS or Telegram).
  giveFeedback(s, { pid, score, reasons = [], via = 'app' }, ev, now) {
    const p = s.patients[pid]
    if (!p || p.status !== 'done' || p.kind === 'emergency' || p.feedback || !SCORES.includes(score)) return null
    p.feedback = { score, reasons: score === 'good' ? [] : [...new Set(reasons)].filter((r) => REASONS.includes(r)), at: now, via }
    ev.push({ type: 'feedback', data: { token: p.token, dept: p.dept, score, reasons: p.feedback.reasons, via } })
    return true
  },

  sendToEnd(s, { pid }, ev, now) {
    const p = s.patients[pid]
    if (!p || !['waiting', 'called'].includes(p.status)) return null
    if (p.status === 'called' && s.rooms[p.room]) s.rooms[p.room].servingId = null
    const list = waitingList(s, p.dept)
    p.status = 'waiting'
    p.room = null
    p.order = Math.max(now, ...list.map((x) => x.order)) + 1
    p.nearAlert = false
    promiseWait(s, p, now)
    addMessage(s, p, 'end', now)
    ev.push({ type: 'sent_to_end', data: publicInfo(p) })
    checkNear(s, ev, now)
    return p.token
  },

  // Moving keeps the patient's original place in time, so a wrong department
  // never costs them their turn.
  movePatient(s, { pid, dept }, ev, now) {
    const old = s.patients[pid]
    if (!old || old.dept === dept || !['waiting', 'called'].includes(old.status)) return null
    if (old.status === 'called' && s.rooms[old.room]) s.rooms[old.room].servingId = null
    const p = newPatient(s, { ...old, dept, order: old.order }, now)
    p.createdAt = old.createdAt
    p.movedFrom = old.id
    if (old.reports) p.reports = old.reports
    promiseWait(s, p, now)
    old.status = 'moved'
    old.movedTo = p.id
    old.bill = []
    addMessage(s, p, 'moved', now, { newToken: p.token })
    ev.push({ type: 'moved', data: publicInfo(p, { oldToken: old.token }) })
    checkNear(s, ev, now)
    return p.token
  },

  setRoomStatus(s, { room, patch }, ev) {
    s.rooms[room] = { ...(s.rooms[room] || {}), ...patch }
    ev.push({ type: 'doctor_status', data: { room, dept: roomToDept[room], ...patch } })
    return true
  },

  raiseFlag(s, a, ev, now) {
    const flag = {
      id: `f${s.seq++}`,
      at: realNow(),
      simAt: now,
      pid: a.pid || null,
      token: a.token || '',
      name: a.name || '',
      where: a.where || '',
      lang: a.lang || 'en',
      by: a.by || 'patient',
      seen: false,
      seenAt: null,
    }
    s.flags.unshift(flag)
    s.flags.length = Math.min(s.flags.length, 50)
    ev.push({ type: 'urgent_flag', data: { token: flag.token, firstName: flag.name, where: flag.where, by: flag.by, lang: flag.lang } })
    return flag.id
  },

  markFlagSeen(s, { id }, ev) {
    const f = s.flags.find((x) => x.id === id)
    if (!f || f.seen) return false
    f.seen = true
    f.seenAt = realNow()
    ev.push({ type: 'flag_seen', data: { token: f.token, where: f.where } })
    return true
  },

  addSamplePatients(s, { n = 20 }, ev, now) {
    const made = []
    for (let i = 0; i < n; i++) {
      const sp = samplePatients[(s.sampleIdx + i) % samplePatients.length]
      // A mix of ways to pay, so the Payments screen has something to show.
      const way = ['upi', 'counter', 'card', 'counter'][i % 4]
      const p = newPatient(
        s,
        { ...sp, name: sp.name.en, nameHi: sp.name.hi, lang: i % 3 === 0 ? 'en' : 'hi', via: 'sample', order: now + i, payChoice: way, card: 'bpl' },
        now,
      )
      if (way === 'upi') payItems(s, p, 'upi', 'DEMO', now, null, 'demo')
      made.push(p)
    }
    for (const p of made) promiseWait(s, p, now)
    s.sampleIdx += n
    ev.push({ type: 'demo_patients_added', data: { count: n } })
    checkNear(s, ev, now)
    return n
  },

  // Demo: visits from earlier this morning, already seen: the wait each was
  // told and the real one, some feedback, and one patient still at the
  // tests. Not counted in the consultation times.
  addSampleVisits(s, { n = 10 }, ev, now) {
    const off = [-3, 2, 4, -1, 9, 1, -2, 3, 0, 6] // real wait minus the estimate (minutes)
    const scores = ['good', null, 'okay', 'good', 'bad', 'good', null, 'good', 'okay', 'good']
    for (let i = 0; i < n; i++) {
      const sp = samplePatients[(s.sampleIdx + i) % samplePatients.length]
      const at = now - ((n - i) * 6 + 20) * 60000
      const p = newPatient(s, { ...sp, name: sp.name.en, nameHi: sp.name.hi, lang: i % 3 === 0 ? 'en' : 'hi', via: 'sample', order: at }, at)
      const est = 10 + (i % 4) * 5
      const real = Math.max(0, est + off[i % off.length])
      Object.assign(p, { status: 'done', est: { mins: est, at }, calledAt: at + real * 60000, doneAt: at + (real + 7) * 60000, room: deptById[p.dept].rooms[0].room, nearAlert: true })
      payItems(s, p, 'cash', '', p.doneAt)
      if (i === 1) {
        const free = billSummary(p).freeReason
        p.bill.push(billItem(s, 'test', 'cbc', testById.cbc.fee, p.calledAt, free ? 'waived' : 'due', free || null))
        p.reports = { status: 'pending', tests: ['cbc'], room: p.room, at: p.calledAt }
      } else if (scores[i % scores.length]) {
        const score = scores[i % scores.length]
        p.feedback = { score, reasons: score === 'bad' ? ['wait', 'find'] : score === 'okay' ? ['wait'] : [], at: p.doneAt, via: 'sample' }
      }
    }
    s.sampleIdx += n
    return n
  },

  // Payment taken (cash at the counter, or UPI/online confirmed by the server).
  payBill(s, { pid, method, ref, items = null, mode = null }, ev, now) {
    const p = s.patients[pid]
    if (!p) return null
    const r = payItems(s, p, method, ref, now, items, mode)
    if (!r.amount) return null
    addMessage(s, p, 'paid', now, { amount: r.amount, receipt: r.receipt })
    ev.push({ type: 'payment_received', data: publicInfo(p, { amount: r.amount, method, receipt: r.receipt }) })
    return r
  },

  // Staff looked at a free-care card.
  decideWaiver(s, { pid, approve }, ev, now) {
    const p = s.patients[pid]
    if (!p?.waiver || p.waiver.status !== 'requested') return null
    if (approve) approveWaiver(p, now)
    else p.waiver = { ...p.waiver, status: 'rejected', decidedAt: now }
    const card = FREE_CARDS.includes(p.waiver.card)
    addMessage(s, p, approve ? (card ? 'waiverOk' : 'freeOk') : card ? 'waiverNo' : 'freeNo', now, { amount: billSummary(p).due })
    ev.push({ type: 'waiver_decided', data: publicInfo(p, { approve, card: p.waiver.card }) })
    return p.waiver.status
  },

  // The doctor asks for tests. Free patients stay free.
  addCharges(s, { pid, tests }, ev, now) {
    const p = s.patients[pid]
    if (!p) return null
    const free = p.waiver?.status === 'approved' ? p.waiver.card : billSummary(p).freeReason
    let added = 0
    for (const code of tests) {
      const t = testById[code]
      if (!t) continue
      p.bill.push(billItem(s, 'test', code, t.fee, now, free ? 'waived' : 'due', free || null))
      if (!free) added += t.fee
    }
    // Tests from the consultation: the visit stays open until the patient is
    // back with the reports (see checkIn).
    if (p.dept && ['called', 'done'].includes(p.status)) {
      const had = reportsState(p) === 'back' ? [] : p.reports?.tests || []
      p.reports = { status: 'pending', tests: [...new Set([...had, ...tests])], room: p.room, at: now }
    }
    addMessage(s, p, added ? 'charges' : 'testsFree', now, { amount: added })
    ev.push({ type: 'charges_added', data: publicInfo(p, { tests, amount: added }) })
    return added
  },

  refundItem(s, { pid, itemId }, ev, now) {
    const p = s.patients[pid]
    const item = p?.bill?.find((i) => i.id === itemId && i.status === 'paid')
    if (!item) return null
    Object.assign(item, { status: 'refunded', refundedAt: now })
    addMessage(s, p, 'refund', now, { amount: item.amount, receipt: item.receipt })
    ev.push({ type: 'refund', data: publicInfo(p, { amount: item.amount, receipt: item.receipt }) })
    return item.amount
  },

  // PM-JAY claim progress, copied here by the server's claims desk so the
  // patient's own phone can show it. Staff see it; the public queue never does.
  setClaim(s, { pid, claim }) {
    const p = s.patients[pid]
    if (!p) return null
    if (claim) p.claim = claim
    else delete p.claim
    return true
  },

  setSpeed(s, { speed }) {
    s.clock = makeClock(speed, simNow(s.clock))
    return speed
  },

  setAutoRun(s, { on }) {
    s.autoRun = !!on
    return s.autoRun
  },

  // Suggest nearby hospitals to patients when this OPD is overcrowded.
  setShareLoad(s, { on }) {
    s.shareLoad = !!on
    return s.shareLoad
  },

  // Some hospitals charge for an Emergency visit. 0 = free (the default).
  // `when`: 'after' care (billed afterwards) or 'before' (many government
  // hospitals make an Emergency slip, and take the fee, before the doctor).
  setEmergencyFee(s, { amount, when }) {
    s.emergencyFee = amount
    if (when) s.emergencyPay = when
    return amount
  },

  // Paper slips for people who registered on a phone, printed in a batch.
  // Printed at the counter they still have to reach the room ('printed');
  // printed at the room they are there already; at the slip window the
  // patient is standing there and takes it. Printing again (a lost slip) is fine.
  printSlips(s, { pids }, ev, now) {
    const mode = s.slipMode || 'counter'
    const status = { counter: 'printed', room: 'atRoom', window: 'given' }[mode]
    let n = 0
    for (const pid of pids) {
      const p = s.patients[pid]
      if (!p?.slip || !['waiting', 'called'].includes(p.status)) continue
      p.slip = { ...p.slip, status, printedAt: now, copies: (p.slip.copies || 0) + 1, ...(status === 'atRoom' ? { atRoomAt: now } : {}) }
      if (status === 'atRoom') slipArrived(s, p, ev, now)
      n++
    }
    return n
  },

  // Printed at the counter, now taken to the doctor's room.
  slipsToRoom(s, { pids }, ev, now) {
    let n = 0
    for (const pid of pids) {
      const p = s.patients[pid]
      if (p?.slip?.status !== 'printed') continue
      p.slip = { ...p.slip, status: 'atRoom', atRoomAt: now }
      if (['waiting', 'called'].includes(p.status)) slipArrived(s, p, ev, now)
      n++
    }
    return n
  },

  setSlipMode(s, { mode }) {
    s.slipMode = mode
    return mode
  },

  // An Emergency (Casualty) visit, recorded by staff, never in an OPD line.
  // Where the fee is taken after care, it is recorded once care has started
  // and billed afterwards; where it is taken before (the Emergency slip), it
  // is recorded at the Emergency counter. Free care (age, or a card staff
  // have seen) applies as at the counter.
  recordEmergency(s, a, ev, now) {
    const num = (s.counters.EMR || 0) + 1
    s.counters.EMR = num
    const id = `p${s.seq++}`
    const age = a.age === '' || a.age == null ? null : Number(a.age)
    const fee = s.emergencyFee || 0
    const free = fee ? autoFreeReason({ age }) || (a.cardOk && FREE_CARDS.includes(a.card) ? a.card : null) : null
    const p = {
      id,
      token: `EMR-${pad3(num)}`,
      num,
      kind: 'emergency',
      dept: null,
      name: String(a.name || '').trim(),
      age,
      gender: a.gender || '',
      lang: a.lang || 'en',
      via: 'emergency',
      status: 'emergency',
      createdAt: now,
      bill: fee ? [billItem(s, 'emergency', 'emergency', fee, now, free ? 'waived' : 'due', free)] : [],
      waiver: free && FREE_CARDS.includes(free) ? { card: free, status: 'approved', at: now, decidedAt: now } : null,
      payChoice: 'counter',
      secret: '',
    }
    s.patients[id] = p
    if (a.paidCash) payItems(s, p, 'cash', '', now)
    ev.push({ type: 'emergency_recorded', data: { token: p.token, fee, free: !!free } })
    return { ...p }
  },

  // On (the default): phones book, and join the line at the hospital.
  setArrival(s, { on }) {
    s.arrival = !!on
    return s.arrival
  },

  resetAll(s) {
    const rev = s.rev
    for (const k of Object.keys(s)) delete s[k]
    Object.assign(s, initialState(), { rev })
    return true
  },

  // Demo doctors: finish consultations that have run their time, call the next.
  tick(s, a, ev, now) {
    const due = dueRooms(s)
    for (const room of due) callNextIn(s, room, now, ev)
    if (due.length) checkNear(s, ev, now)
    return due.length
  },
}

export function runAction(s, name, args = {}) {
  const fn = ACTIONS[name]
  if (!fn) throw new Error(`Unknown action ${name}`)
  const ev = []
  const result = fn(s, args, ev, simNow(s.clock))
  return { result, events: ev, full: name === 'resetAll' }
}

// ---- Sending only what changed (server -> browsers) -------------------------

export const HOSPITAL_KEYS = ['v', 'clock', 'autoRun', 'arrival', 'emergencyFee', 'emergencyPay', 'slipMode', 'shareLoad','counters', 'rooms', 'history', 'seq', 'sampleIdx']
const CAPS = { flags: 50, messages: 150, calls: 30 }

export function diffState(a, b) {
  const patch = { rev: b.rev }
  const h = {}
  for (const k of HOSPITAL_KEYS) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) h[k] = b[k]
  if (Object.keys(h).length) patch.hospital = h
  const pt = {}
  for (const id of new Set([...Object.keys(a.patients), ...Object.keys(b.patients)])) {
    if (JSON.stringify(a.patients[id]) !== JSON.stringify(b.patients[id])) pt[id] = b.patients[id] ?? null
  }
  if (Object.keys(pt).length) patch.patients = pt
  for (const key of Object.keys(CAPS)) {
    const old = new Map(a[key].map((x) => [x.id, JSON.stringify(x)]))
    const changed = b[key].filter((x) => old.get(x.id) !== JSON.stringify(x))
    if (changed.length) patch[key] = changed
  }
  return patch
}

function mergeById(list, items, cap, cmp) {
  const m = new Map(list.map((x) => [x.id, x]))
  for (const x of items) m.set(x.id, x)
  return [...m.values()].sort(cmp).slice(0, cap)
}

export function applyPatch(s, p) {
  if (p.full) return p.full
  const n = { ...s, ...(p.hospital || {}), rev: p.rev }
  if (p.patients) {
    n.patients = { ...s.patients }
    for (const [id, doc] of Object.entries(p.patients)) {
      if (doc) n.patients[id] = doc
      else delete n.patients[id]
    }
  }
  if (p.flags) n.flags = mergeById(s.flags, p.flags, CAPS.flags, (x, y) => y.at - x.at)
  if (p.messages) n.messages = mergeById(s.messages, p.messages, CAPS.messages, (x, y) => y.id - x.id)
  if (p.calls) n.calls = mergeById(s.calls, p.calls, CAPS.calls, (x, y) => y.id - x.id)
  return n
}
