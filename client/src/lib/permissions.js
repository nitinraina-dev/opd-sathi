// Who may do what. Shared by the Express server (which enforces it) and the
// staff screens (which hide buttons a person cannot use).
//
// Roles: admin (everything), doctor and nurse (run the rooms), reception
// (register, move, send to end, take payments). Patients need no login: they
// may register themselves, raise an urgent flag, and pay their own bill
// (through /api/pay, which checks the patient's own key).

import { billSummary } from './billing.js'

export const ROLES = ['admin', 'doctor', 'nurse', 'reception']

const ROOM = ['admin', 'doctor', 'nurse']
const DESK = ['admin', 'doctor', 'nurse', 'reception']

export const ACTION_ROLES = {
  registerPatient: 'public',
  raiseFlag: 'public',
  callNext: ROOM,
  markNoShow: ROOM,
  setRoomStatus: ROOM,
  sendToEnd: DESK,
  movePatient: DESK,
  markFlagSeen: DESK,
  checkIn: DESK, // patients check in themselves through /api/checkin (with the code)
  reportsReady: DESK, // the lab or the desk: test reports are ready to collect
  recordEmergency: DESK, // after care has started; never before
  setEmergencyFee: ['admin'],
  setShareLoad: ['admin'],
  payBill: DESK, // cash at the counter
  decideWaiver: DESK,
  addCharges: ROOM,
  refundItem: ['admin'],
  addSamplePatients: ['admin'],
  setSpeed: ['admin'],
  setAutoRun: ['admin'],
  setArrival: ['admin'],
  resetAll: ['admin'],
}

// Other staff features.
export const FEATURE_ROLES = {
  counter: DESK,
  forecast: DESK,
  payments: DESK,
  paymentSettings: ['admin'],
  // PM-JAY claims: everyone on the desk can see them; doctors and reception
  // (the Arogya Mitra desk) move them on; money received is for reception.
  claims: DESK,
  claimEdit: ['admin', 'doctor', 'reception'],
  claimPaid: ['admin', 'reception'],
  claimSamples: ['admin'],
  // Local alerts for the forecast (outbreaks, festivals, bandhs, news).
  signals: DESK,
  automation: ['admin'],
  accounts: ['admin'],
  audit: ['admin'],
  demo: ['admin'],
}

// Groups for the activity log filter.
export const AUDIT_GROUPS = {
  queue: ['registerPatient', 'checkIn', 'reportsReady', 'callNext', 'markNoShow', 'sendToEnd', 'movePatient'],
  doctor: ['setRoomStatus'],
  alerts: ['raiseFlag', 'markFlagSeen'],
  accounts: ['login', 'loginFailed', 'logout', 'passwordChanged', 'accountCreated', 'accountUpdated', 'accountDeleted'],
  payments: ['payBill', 'decideWaiver', 'addCharges', 'refundItem', 'paymentSettings', 'recordEmergency', 'setEmergencyFee'],
  claims: ['claimCreated', 'claimStep', 'claimSamples'],
  forecast: ['signalAdded', 'signalRemoved', 'signalDismissed'],
  admin: ['addSamplePatients', 'setSpeed', 'setAutoRun', 'setArrival', 'setShareLoad', 'demoSetup', 'resetAll', 'configChanged', 'historyLoaded', 'historyCleared'],
}

export function can(user, what) {
  const roles = ACTION_ROLES[what] ?? FEATURE_ROLES[what]
  if (roles === 'public') return true
  return !!user && Array.isArray(roles) && roles.includes(user.role)
}

// What anyone (not logged in) may see about a patient: enough for the queue,
// the board and "people ahead", but no name, age, gender or phone number.
export const PUBLIC_PATIENT_FIELDS = [
  'id',
  'token',
  'num',
  'dept',
  'status',
  'order',
  'createdAt',
  'calledAt',
  'doneAt',
  'room',
  'nearAlert',
  'plannedMins',
  'movedTo',
  'movedFrom',
  'lang',
  'est', // the wait we told them when they joined, to compare with the real one
]

const pickFields = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))
// The public queue says how much is due, not what for (tests are medical),
// and only whether tests are pending and feedback was given, not what.
const publicPatient = (p) => {
  if (!p) return p
  const b = billSummary(p)
  return {
    ...pickFields(p, PUBLIC_PATIENT_FIELDS),
    billDue: b.due,
    billState: b.state,
    ...(p.reports ? { reportsState: p.reports.status } : {}),
    ...(p.feedback ? { rated: true } : {}),
  }
}
// Staff see everything except the patient's own key (only their phone has it)
// and the id of the phone that booked (used only to limit bookings).
const staffPatient = (p) => {
  if (!p || (p.secret === undefined && p.device === undefined)) return p
  const { secret, device, ...rest } = p
  return rest
}
const publicFlag = (f) => pickFields(f, ['id', 'at', 'seen', 'seenAt'])

export function redactState(s) {
  return {
    ...s,
    patients: Object.fromEntries(Object.entries(s.patients).map(([id, p]) => [id, publicPatient(p)])),
    flags: s.flags.map(publicFlag),
  }
}

export function staffState(s) {
  return { ...s, patients: Object.fromEntries(Object.entries(s.patients).map(([id, p]) => [id, staffPatient(p)])) }
}

export function staffPatch(p) {
  if (p.full) return { ...p, full: staffState(p.full) }
  if (!p.patients) return p
  return { ...p, patients: Object.fromEntries(Object.entries(p.patients).map(([id, x]) => [id, staffPatient(x)])) }
}

export const ownRecord = staffPatient

export function redactPatch(p) {
  if (p.full) return { ...p, full: redactState(p.full) }
  const out = { ...p }
  if (p.patients) out.patients = Object.fromEntries(Object.entries(p.patients).map(([id, x]) => [id, publicPatient(x)]))
  if (p.flags) out.flags = p.flags.map(publicFlag)
  return out
}
