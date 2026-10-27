// MongoDB collections (Mongoose models). The ids are the app's own ids
// ("p12", "f7", message numbers) so the browser and the database agree.

import mongoose from 'mongoose'

const { Schema, model } = mongoose
const opts = { versionKey: false, minimize: false }

const PatientSchema = new Schema(
  {
    _id: String,
    token: { type: String, index: true },
    num: Number,
    dept: { type: String, index: true },
    name: String,
    nameHi: String,
    age: Number,
    gender: String,
    mobile: String,
    assisted: Boolean,
    lang: String,
    via: String,
    status: { type: String, index: true }, // waiting | called | done | noshow | moved
    order: Number,
    createdAt: Number,
    calledAt: Number,
    doneAt: Number,
    room: Number,
    nearAlert: Boolean,
    plannedMins: Number,
    movedTo: String,
    movedFrom: String,
    bill: Schema.Types.Mixed, // [{ id, kind, code, amount, status, reason, method, mode, receipt, paidAt }]
    waiver: Schema.Types.Mixed, // { card, status } for free-care cards (never the card number)
    payChoice: String,
    secret: String, // only the patient's own phone has it (to pay and see their bill)
    claim: Schema.Types.Mixed, // { id, stage, view, pkg } of a PM-JAY claim (see lib/claims.js)
    kind: String, // 'emergency' for an Emergency (Casualty) visit; OPD otherwise
    rejoined: Boolean, // missed their turn, then checked in again
    bookedAt: Number, // booked on a phone; joins the line at check-in
    arrivedAt: Number,
    device: String, // the phone that booked (only to limit bookings; never shown)
    reports: Schema.Types.Mixed, // { status, tests, room, at, readyAt, backAt }: tests the doctor asked for
    est: Schema.Types.Mixed, // { mins, at }: the wait we told them as they joined the line
    feedback: Schema.Types.Mixed, // { score, reasons, at, via }: "how was your visit?"
  },
  opts,
)

const FlagSchema = new Schema(
  {
    _id: String,
    at: { type: Number, index: true },
    simAt: Number,
    pid: String,
    token: String,
    name: String,
    where: String,
    lang: String,
    by: String,
    seen: Boolean,
    seenAt: Number,
  },
  opts,
)

const MessageSchema = new Schema(
  {
    _id: Number,
    pid: { type: String, index: true },
    kind: String,
    token: String,
    dept: String,
    room: Number,
    newToken: String,
    amount: Number, // paid, refunded or due (payment messages)
    receipt: String,
    to: String,
    at: Number,
  },
  opts,
)

const CallSchema = new Schema({ _id: Number, token: String, room: Number, dept: String, at: Number }, opts)

// One document holding the hospital-wide settings and counters.
const HospitalSchema = new Schema(
  {
    _id: String,
    rev: Number,
    v: Number,
    clock: Schema.Types.Mixed,
    autoRun: Boolean,
    arrival: Boolean,
    emergencyFee: Number,
    shareLoad: Boolean,
    counters: Schema.Types.Mixed,
    rooms: Schema.Types.Mixed,
    history: Schema.Types.Mixed,
    seq: Number,
    sampleIdx: Number,
  },
  opts,
)

// place / placeHi: the town for local news (English and Hindi names).
const ConfigSchema = new Schema({ _id: String, eventsUrl: String, feedUrl: String, lat: Number, lon: Number, place: String, placeHi: String }, opts)

const EventLogSchema = new Schema({ at: { type: Number, index: true }, type: String, status: String, code: Number }, opts)

const CacheSchema = new Schema({ _id: String, data: Schema.Types.Mixed, at: Number }, opts)

// Staff accounts: username is the id; hash is the scrypt password hash;
// v goes up when the password changes, which ends old sessions.
const StaffSchema = new Schema({ _id: String, name: String, role: String, hash: String, v: Number }, opts)

// Secrets the server makes for itself (session key, web-push keys).
const SecretSchema = new Schema({ _id: String, value: Schema.Types.Mixed }, opts)

// A phone that asked for alerts about one patient (web push).
const PushSubSchema = new Schema(
  { _id: String, pid: { type: String, index: true }, token: String, lang: String, sub: Schema.Types.Mixed, at: Number },
  opts,
)

// A Telegram chat that follows one patient's token (alerts for the turn).
const ChatFollowSchema = new Schema(
  { _id: String, chat: { type: String, index: true }, pid: { type: String, index: true }, token: String, lang: String, at: Number },
  opts,
)

// Registrations per day, kept after "reset" so the forecast can learn.
const DailyStatSchema = new Schema(
  { _id: String, total: Number, byHour: Schema.Types.Mixed, byDept: Schema.Types.Mixed, wx: Schema.Types.Mixed, sig: [String], sample: Boolean },
  opts,
)

// Who did what, and when (staff actions, logins, account changes).
const AuditSchema = new Schema(
  { at: { type: Number, index: true }, actor: { type: String, index: true }, role: String, action: { type: String, index: true }, detail: Schema.Types.Mixed },
  opts,
)

// PM-JAY claims (lib/claims.js). Kept after a demo reset: a claim takes weeks.
// Never a PM-JAY card, Aadhaar or ABHA number.
const ClaimSchema = new Schema(
  { _id: String, stage: { type: String, index: true }, updatedAt: { type: Number, index: true }, sample: Boolean },
  { ...opts, strict: false },
)

// Local alerts for the forecast, and news suggestions (lib/signals.js).
const SignalSchema = new Schema({ _id: String, status: { type: String, index: true }, to: String }, { ...opts, strict: false })

export const Patient = model('Patient', PatientSchema)
export const Flag = model('Flag', FlagSchema)
export const Message = model('Message', MessageSchema)
export const Call = model('Call', CallSchema)
export const Hospital = model('Hospital', HospitalSchema)
export const Config = model('Config', ConfigSchema)
export const EventLog = model('EventLog', EventLogSchema)
export const Cache = model('Cache', CacheSchema)
export const Staff = model('Staff', StaffSchema)
export const Secret = model('Secret', SecretSchema)
export const PushSub = model('PushSub', PushSubSchema)
export const ChatFollow = model('ChatFollow', ChatFollowSchema)
export const DailyStat = model('DailyStat', DailyStatSchema)
export const Audit = model('Audit', AuditSchema)
export const Claim = model('Claim', ClaimSchema)
export const Signal = model('Signal', SignalSchema)
