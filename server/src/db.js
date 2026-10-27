// Where the server keeps the hospital state.
//  - MongoDB (Mongoose) when it can connect: the normal MERN setup.
//  - A JSON file in server/data/ if MongoDB is not running, so the demo still
//    starts with zero setup. (It says which one it uses at start-up.)

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { Patient, Flag, Message, Call, Hospital, Config, EventLog, Cache, Staff, Secret, PushSub, ChatFollow, DailyStat, Audit, Claim, Signal } from './models.js'
import { HOSPITAL_KEYS } from '../../client/src/lib/engine.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(here, '../data')

// place / placeHi: the town or district, for local news (in English and Hindi).
export const defaultConfig = { eventsUrl: '', feedUrl: '', lat: 26.85, lon: 80.95, place: 'Lucknow', placeHi: 'लखनऊ' }

const toApp = ({ _id, ...rest }) => ({ id: _id, ...rest })
const toDb = ({ id, ...rest }) => ({ _id: id, ...rest })
const hospitalDoc = (s) => ({ _id: 'main', rev: s.rev, ...Object.fromEntries(HOSPITAL_KEYS.map((k) => [k, s[k]])) })

async function mongoStore(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 })
  const upsertAll = (M, items) =>
    items.length ? M.bulkWrite(items.map((x) => ({ replaceOne: { filter: { _id: x.id }, replacement: toDb(x), upsert: true } }))) : null

  return {
    kind: 'mongodb',
    describe: `MongoDB (${mongoose.connection.name})`,

    async load() {
      const h = await Hospital.findById('main').lean()
      if (!h) return null
      const [patients, flags, messages, calls] = await Promise.all([
        Patient.find().lean(),
        Flag.find().sort({ at: -1 }).limit(50).lean(),
        Message.find().sort({ _id: -1 }).limit(150).lean(),
        Call.find().sort({ _id: -1 }).limit(30).lean(),
      ])
      const { _id, ...hosp } = h
      return {
        ...hosp,
        patients: Object.fromEntries(patients.map((p) => [p._id, toApp(p)])),
        flags: flags.map(toApp),
        messages: messages.map(toApp),
        calls: calls.map(toApp),
      }
    },

    // Write only what changed (the same patch the browsers receive).
    async save(patch, state) {
      if (patch.full) {
        await Promise.all([Patient.deleteMany({}), Flag.deleteMany({}), Message.deleteMany({}), Call.deleteMany({})])
        await Promise.all([
          Hospital.replaceOne({ _id: 'main' }, hospitalDoc(state), { upsert: true }),
          upsertAll(Patient, Object.values(state.patients)),
          upsertAll(Flag, state.flags),
          upsertAll(Message, state.messages),
          upsertAll(Call, state.calls),
        ])
        return
      }
      const ops = [Hospital.updateOne({ _id: 'main' }, { $set: { rev: state.rev, ...(patch.hospital || {}) } }, { upsert: true })]
      if (patch.patients) {
        ops.push(
          Patient.bulkWrite(
            Object.entries(patch.patients).map(([id, doc]) =>
              doc ? { replaceOne: { filter: { _id: id }, replacement: toDb(doc), upsert: true } } : { deleteOne: { filter: { _id: id } } },
            ),
          ),
        )
      }
      if (patch.flags) ops.push(upsertAll(Flag, patch.flags))
      if (patch.messages) ops.push(upsertAll(Message, patch.messages))
      if (patch.calls) ops.push(upsertAll(Call, patch.calls))
      await Promise.all(ops)
    },

    async getConfig() {
      const c = await Config.findById('main').lean()
      const { _id, ...rest } = c || {}
      return { ...defaultConfig, ...rest }
    },
    async setConfig(cfg) {
      await Config.updateOne({ _id: 'main' }, { $set: cfg }, { upsert: true })
      return this.getConfig()
    },
    async addLog(entry) {
      await EventLog.create(entry)
    },
    async getLog() {
      const rows = await EventLog.find().sort({ at: -1 }).limit(30).lean()
      return rows.map(({ _id, ...r }) => r)
    },
    async getCache(key) {
      return (await Cache.findById(key).lean())?.data || null
    },
    async setCache(key, data) {
      await Cache.updateOne({ _id: key }, { $set: { data, at: Date.now() } }, { upsert: true })
    },

    close: () => mongoose.disconnect(),
    getSecret: async (key) => (await Secret.findById(key).lean())?.value ?? null,
    setSecret: (key, value) => Secret.updateOne({ _id: key }, { $set: { value } }, { upsert: true }),

    listStaff: () => Staff.find().sort({ _id: 1 }).lean(),
    getStaff: (username) => Staff.findById(username).lean(),
    async saveStaff(u) {
      await Staff.replaceOne({ _id: u._id }, u, { upsert: true })
      return u
    },
    deleteStaff: (username) => Staff.deleteOne({ _id: username }),

    addPushSub: (s) => PushSub.replaceOne({ _id: s._id }, s, { upsert: true }),
    removePushSub: (id) => PushSub.deleteOne({ _id: id }),
    pushSubsFor: (pids) => PushSub.find({ pid: { $in: pids } }).lean(),

    addFollow: (f) => ChatFollow.replaceOne({ _id: f._id }, f, { upsert: true }),
    removeFollow: (id) => ChatFollow.deleteOne({ _id: id }),
    removeFollows: (chat) => ChatFollow.deleteMany({ chat }),
    clearFollows: () => ChatFollow.deleteMany({}),
    followsFor: (pids) => ChatFollow.find({ pid: { $in: pids } }).lean(),
    followsOf: (chat) => ChatFollow.find({ chat }).sort({ at: -1 }).lean(),

    async getStats(days = 56) {
      const rows = await DailyStat.find().sort({ _id: -1 }).limit(days).lean()
      return rows.map(({ _id, ...r }) => ({ date: _id, ...r }))
    },
    // sig: kinds of local alert active that day ('outbreak:dengue', …).
    incStat: (date, hour, dept, wx, sig = []) =>
      DailyStat.updateOne(
        { _id: date },
        {
          $inc: { total: 1, [`byHour.${hour}`]: 1, [`byDept.${dept}`]: 1 },
          $setOnInsert: { sample: false },
          $set: { sig, ...(wx ? { wx } : {}) },
        },
        { upsert: true },
      ),
    async putStats(rows) {
      if (rows.length)
        await DailyStat.bulkWrite(rows.map(({ date, ...r }) => ({ replaceOne: { filter: { _id: date }, replacement: { _id: date, ...r }, upsert: true } })))
    },
    clearStats: () => DailyStat.deleteMany({}),

    addAudit: (entry) => Audit.create(entry),
    async getAudit({ limit = 200, actor, action } = {}) {
      const q = {}
      if (actor) q.actor = actor
      if (action) q.action = { $in: action }
      const rows = await Audit.find(q).sort({ at: -1 }).limit(limit).lean()
      return rows.map(({ _id, ...r }) => ({ id: String(_id), ...r }))
    },
    auditActors: () => Audit.distinct('actor'),

    listClaims: async () => (await Claim.find().sort({ _id: -1 }).lean()).map(toApp),
    getClaim: async (id) => {
      const c = await Claim.findById(id).lean()
      return c ? toApp(c) : null
    },
    saveClaim: (c) => Claim.replaceOne({ _id: c.id }, toDb(c), { upsert: true }),
    deleteSampleClaims: () => Claim.deleteMany({ sample: true }),

    listSignals: async () => (await Signal.find().lean()).map(toApp),
    saveSignal: (x) => Signal.replaceOne({ _id: x.id }, toDb(x), { upsert: true }),
    deleteSignal: (id) => Signal.deleteOne({ _id: id }),
  }
}

async function fileStore() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const file = (n) => path.join(DATA_DIR, `${n}.json`)
  const readJSON = async (n, fallback) => {
    try {
      return JSON.parse(await fs.readFile(file(n), 'utf8'))
    } catch {
      return fallback
    }
  }
  const writeJSON = (n, v) => fs.writeFile(file(n), JSON.stringify(v))
  let log = await readJSON('log', [])
  return {
    kind: 'file',
    describe: `file (${path.relative(process.cwd(), DATA_DIR) || DATA_DIR})`,
    load: () => readJSON('state', null),
    save: (patch, state) => writeJSON('state', state),
    getConfig: async () => ({ ...defaultConfig, ...(await readJSON('config', {})) }),
    async setConfig(cfg) {
      const next = { ...(await this.getConfig()), ...cfg }
      await writeJSON('config', next)
      return next
    },
    async addLog(entry) {
      log = [entry, ...log].slice(0, 30)
      await writeJSON('log', log)
    },
    getLog: async () => log,
    getCache: async (key) => (await readJSON(`cache-${key}`, null)) || null,
    setCache: (key, data) => writeJSON(`cache-${key}`, data),

    close: async () => {},
    getSecret: async (key) => (await readJSON('secrets', {}))[key] ?? null,
    async setSecret(key, value) {
      await writeJSON('secrets', { ...(await readJSON('secrets', {})), [key]: value })
    },

    listStaff: async () => Object.values(await readJSON('staff', {})),
    getStaff: async (username) => (await readJSON('staff', {}))[username] || null,
    async saveStaff(u) {
      await writeJSON('staff', { ...(await readJSON('staff', {})), [u._id]: u })
      return u
    },
    async deleteStaff(username) {
      const all = await readJSON('staff', {})
      delete all[username]
      await writeJSON('staff', all)
    },

    async addPushSub(sub) {
      await writeJSON('push', { ...(await readJSON('push', {})), [sub._id]: sub })
    },
    async removePushSub(id) {
      const all = await readJSON('push', {})
      delete all[id]
      await writeJSON('push', all)
    },
    pushSubsFor: async (pids) => Object.values(await readJSON('push', {})).filter((s) => pids.includes(s.pid)),

    async addFollow(f) {
      await writeJSON('follows', { ...(await readJSON('follows', {})), [f._id]: f })
    },
    async removeFollow(id) {
      const all = await readJSON('follows', {})
      delete all[id]
      await writeJSON('follows', all)
    },
    async removeFollows(chat) {
      const all = await readJSON('follows', {})
      await writeJSON('follows', Object.fromEntries(Object.entries(all).filter(([, f]) => f.chat !== chat)))
    },
    clearFollows: () => writeJSON('follows', {}),
    followsFor: async (pids) => Object.values(await readJSON('follows', {})).filter((f) => pids.includes(f.pid)),
    followsOf: async (chat) => Object.values(await readJSON('follows', {})).filter((f) => f.chat === chat).sort((a, b) => b.at - a.at),

    async getStats(days = 56) {
      const all = await readJSON('stats', {})
      return Object.keys(all)
        .sort()
        .reverse()
        .slice(0, days)
        .map((date) => ({ date, ...all[date] }))
    },
    async incStat(date, hour, dept, wx, sig = []) {
      const all = await readJSON('stats', {})
      const d = (all[date] ||= { total: 0, byHour: {}, byDept: {}, sample: false })
      if (wx) d.wx = wx
      d.sig = sig
      d.total += 1
      d.byHour[hour] = (d.byHour[hour] || 0) + 1
      d.byDept[dept] = (d.byDept[dept] || 0) + 1
      await writeJSON('stats', all)
    },
    async putStats(rows) {
      const all = await readJSON('stats', {})
      for (const { date, ...r } of rows) all[date] = r
      await writeJSON('stats', all)
    },
    clearStats: () => writeJSON('stats', {}),

    async addAudit(entry) {
      const all = [entry, ...(await readJSON('audit', []))].slice(0, 2000)
      await writeJSON('audit', all)
    },
    async getAudit({ limit = 200, actor, action } = {}) {
      return (await readJSON('audit', []))
        .filter((r) => (!actor || r.actor === actor) && (!action || action.includes(r.action)))
        .slice(0, limit)
        .map((r, i) => ({ id: `${r.at}-${i}`, ...r }))
    },
    auditActors: async () => [...new Set((await readJSON('audit', [])).map((r) => r.actor))],

    listClaims: async () => Object.values(await readJSON('claims', {})).sort((a, b) => b.id.localeCompare(a.id)),
    getClaim: async (id) => (await readJSON('claims', {}))[id] || null,
    async saveClaim(c) {
      const all = await readJSON('claims', {})
      all[c.id] = c
      await writeJSON('claims', all)
    },
    async deleteSampleClaims() {
      const all = await readJSON('claims', {})
      await writeJSON('claims', Object.fromEntries(Object.entries(all).filter(([, c]) => !c.sample)))
    },

    listSignals: async () => Object.values(await readJSON('signals', {})),
    async saveSignal(x) {
      const all = await readJSON('signals', {})
      all[x.id] = x
      await writeJSON('signals', all)
    },
    async deleteSignal(id) {
      const all = await readJSON('signals', {})
      delete all[id]
      await writeJSON('signals', all)
    },
  }
}

export async function openStore(uri) {
  try {
    return await mongoStore(uri)
  } catch (err) {
    console.warn(`Could not connect to MongoDB at ${uri}: ${err.message}`)
    console.warn('Using a JSON file in server/data instead. Start MongoDB and restart to use the database.')
    return fileStore()
  }
}
