// Crowd and waiting-time forecast.
//
// How it works (a simple, explainable model, not a black box):
// 1. A normal day brings BASE_DAILY OPD patients, split by department
//    (departments.js sampleShare) and by hour (HOUR_SHARE).
// 2. The day is scaled by the day of the week, rain, heat, cold, bad air,
//    rainy-season fevers and the day after heavy rain (dayFactors).
// 3. Heavy road traffic makes part of each 15-minute group arrive 30 minutes
//    later, and makes doctors late at 9:00.
// 4. Each department's line is simulated in 15-minute steps: people join, and
//    the doctors see (rooms x 15 / average consultation) people per step.
// "Now" predictions start from the real queue and doctor status, so they match
// what patients see on their own screens.
// 5. With history from this hospital (registrations per day, hour and
//    department), the typical values in 1-2 are blended with what really
//    happened here (learnFromHistory). The more days, the more it trusts them.
// 6. Local alerts (an outbreak, a festival, a bandh, roads closed, a health
//    camp) change the days they cover, by what this hospital has seen in past
//    alerts of the same kind; and a department that has been busier than
//    usual for 3 days raises its own warning (opdTrend).

import { departments } from '../data/departments.js'
import { waitingAreas } from '../data/hospital.js'
import { dayWx, hourWx, trafficAt } from './model.js'
import { addDays, keyToDate, dateKey, minutesOfDay } from './clock.js'
import { waitingList, deptTiming, totalWaiting, estimateWait, crowdLevel, round5 } from './queue.js'
import { covers, effectFor, totalPct } from './signals.js'
import { DISEASE_EFFECT, TYPE_EFFECT } from '../data/signals.js'

export const OPEN_MIN = 8 * 60 // registration opens
export const OPD_START_MIN = 9 * 60 // doctors start
export const REG_CLOSE_MIN = 13 * 60 + 30 // last registration
export const OPD_END_MIN = 14 * 60
export const HOURS = [8, 9, 10, 11, 12, 13]
export const BASE_DAILY = 240
export const SEATS = waitingAreas.reduce((a, w) => a + w.seats, 0)

const SLOT = 15
const HOUR_SHARE = { 8: 0.16, 9: 0.27, 10: 0.22, 11: 0.16, 12: 0.12, 13: 0.07 }
const DAY_FACTOR = [0, 1.3, 1.1, 1.0, 1.0, 0.95, 0.85] // Sunday: OPD closed
// Typical effect of the weather on how many people come (learned per hospital).
export const DEFAULT_WEATHER = { heavyRain: 0.75, rain: 0.88, heat: 0.92 }

export function weatherKind(wx) {
  if (!wx) return null
  if ((wx.rain ?? 0) >= 20) return 'heavyRain'
  if ((wx.rain ?? 0) >= 5) return 'rain'
  if ((wx.tMax ?? 0) >= 40) return 'heat'
  return 'dry'
}

export function predictedCrowd(waiting) {
  const r = waiting / SEATS
  if (r < 0.5) return 'low'
  if (r < 0.8) return 'medium'
  if (r < 1.1) return 'high'
  return 'veryHigh'
}

// The factor line for an alert, e.g. factors.sig.outbreak.dengue.
const signalFactorKey = (s) => (s.source === 'opd' ? 'sig.trend' : s.type === 'outbreak' ? `sig.outbreak.${s.disease}` : `sig.${s.type}`)

// Why a day is busier or quieter. pct is the rough effect on patient numbers.
export function dayFactors(key, cond, learned = null, signals = []) {
  const date = keyToDate(key)
  const dow = date.getDay()
  const month = date.getMonth() + 1
  const wx = dayWx(cond, key)
  const prev = dayWx(cond, addDays(key, -1))
  const dm = Object.fromEntries(departments.map((d) => [d.id, 1]))
  const factors = []
  if (dow === 0) return { closed: true, mult: 0, dm, factors: [{ key: 'closed', pct: -100 }], wx }

  let mult = DAY_FACTOR[dow]
  if (learned) {
    mult = learned.weekday[dow]
    factors.push({ key: 'learnedDay', pct: Math.round((mult - 1) * 100), vars: { n: learned.days } })
  } else {
    if (dow === 1) factors.push({ key: 'monday', pct: 30 })
    if (dow === 2) factors.push({ key: 'tuesday', pct: 10 })
    if (dow === 5) factors.push({ key: 'friday', pct: -5 })
    if (dow === 6) factors.push({ key: 'saturday', pct: -15 })
  }

  const w = learned?.weather || DEFAULT_WEATHER
  const pct = (m) => Math.round((m - 1) * 100)
  if (wx) {
    if (wx.rain >= 20) {
      mult *= w.heavyRain
      factors.push({ key: 'heavyRain', pct: pct(w.heavyRain), vars: { mm: Math.round(wx.rain) } })
    } else if (wx.rain >= 5) {
      mult *= w.rain
      factors.push({ key: 'rain', pct: pct(w.rain), vars: { mm: Math.round(wx.rain) } })
    }
    if (wx.tMax >= 40) {
      mult *= w.heat
      dm.MED *= 1.15
      factors.push({ key: 'heat', pct: pct(w.heat), vars: { t: Math.round(wx.tMax) } })
    }
    if (wx.tMin != null && wx.tMin <= 8) {
      dm.CHD *= 1.2
      dm.MED *= 1.1
      dm.ENT *= 1.1
      factors.push({ key: 'cold', pct: 8, vars: { t: Math.round(wx.tMin) } })
    }
    if (wx.aqi != null && wx.aqi > 150) {
      const k = wx.aqi > 250 ? 2 : 1
      dm.MED *= 1 + 0.08 * k
      dm.ENT *= 1 + 0.15 * k
      dm.CHD *= 1 + 0.1 * k
      dm.EYE *= 1 + 0.05 * k
      factors.push({ key: 'badAir', pct: 6 * k, vars: { aqi: Math.round(wx.aqi) } })
    }
  }
  if (prev && prev.rain >= 20) {
    mult *= 1.1
    factors.push({ key: 'afterRain', pct: 10 })
  }
  // Local alerts (staff, news, or this OPD's own numbers).
  const today = (signals || []).filter((x) => covers(x, key))
  for (const x of today) {
    const eff = effectFor(x, learned)
    mult *= 1 + (eff.all || 0) / 100
    for (const [d, p] of Object.entries(eff.depts || {})) if (dm[d] != null) dm[d] *= 1 + p / 100
    factors.push({ key: signalFactorKey(x), pct: totalPct(eff, learned?.deptShare), vars: x.dept ? { dept: x.dept } : {} })
  }
  // An outbreak alert already says it more precisely than the season does.
  if (month >= 7 && month <= 9 && !today.some((x) => x.type === 'outbreak')) {
    dm.MED *= 1.12
    dm.CHD *= 1.12
    dm.SKN *= 1.1
    factors.push({ key: 'feverSeason', pct: 8 })
  }
  if (!factors.length) factors.push({ key: 'normal', pct: 0 })
  return { closed: false, mult, dm, factors, wx }
}

const lateMinsFor = (level) => (level >= 0.8 ? 15 : level >= 0.6 ? 10 : 0)

export function simulateDay(key, cond, { fromMinute = OPEN_MIN, waiting = null, timing = null, learned = null, signals = [] } = {}) {
  const f = dayFactors(key, cond, learned, signals)
  const hourShare = learned?.hourShare || HOUR_SHARE
  if (f.closed) return { key, closed: true, factors: f.factors, wx: f.wx, hours: [], total: 0, byDept: {} }

  const slots = []
  for (let m = OPEN_MIN; m < OPD_END_MIN; m += SLOT) slots.push(m)
  const traffic = slots.map((m) => trafficAt(cond, key, m + 7))
  const lateMins = lateMinsFor(trafficAt(cond, key, 8 * 60 + 30))
  const lastReg = slots.filter((m) => m < REG_CLOSE_MIN).length - 1
  const from = Math.max(OPEN_MIN, fromMinute)
  const startIdx = Math.min(slots.length - 1, Math.floor((from - OPEN_MIN) / SLOT))
  const startFrac = 1 - ((from - OPEN_MIN) % SLOT) / SLOT
  const total = BASE_DAILY * f.mult

  const res = {}
  for (const d of departments) {
    const t = timing?.[d.id] || { avg: d.avgConsultMins, capacity: d.rooms.length, delay: 0 }
    const dayTotal = total * (learned?.deptShare[d.id] ?? d.sampleShare) * f.dm[d.id]
    const base = slots.map((m) => {
      if (m >= REG_CLOSE_MIN) return 0
      const h = Math.floor(m / 60)
      return (dayTotal * hourShare[h]) / (h === 13 ? 2 : 4)
    })
    const arr = base.map(() => 0)
    base.forEach((a, i) => {
      const moved = (a * 0.35 * Math.max(0, traffic[i] - 0.4)) / 0.6
      arr[i] += a - moved
      arr[Math.min(i + 2, lastReg)] += moved
    })

    let backlog = waiting ? waiting[d.id] || 0 : 0
    const out = { arr: [], wait: [], queue: [] }
    slots.forEach((m, i) => {
      if (i < startIdx) {
        out.arr.push(0)
        out.wait.push(null)
        out.queue.push(null)
        return
      }
      const a = i === startIdx && waiting ? arr[i] * startFrac : arr[i]
      const late = m === OPD_START_MIN ? lateMins : 0
      const cap = m >= OPD_START_MIN ? (t.capacity * (SLOT - late)) / t.avg : 0
      const delay = Math.max(0, t.delay - Math.max(0, m - from)) + (m < OPD_START_MIN + 30 ? lateMins : 0)
      const ahead = backlog + a / 2
      out.wait.push((ahead * t.avg) / t.capacity + Math.max(0, OPD_START_MIN - m) + delay)
      out.queue.push(ahead)
      out.arr.push(a)
      backlog = Math.max(0, backlog + a - cap)
    })
    res[d.id] = out
  }

  const hours = []
  for (const h of HOURS) {
    const idx = slots.map((m, i) => (Math.floor(m / 60) === h && i >= startIdx ? i : -1)).filter((i) => i >= 0)
    if (!idx.length) continue
    const regIdx = idx.filter((i) => slots[i] < REG_CLOSE_MIN)
    const byDept = {}
    const waitByDept = {}
    const queueByDept = {}
    let arrivals = 0
    let waiting = 0
    let wSum = 0
    let wW = 0
    for (const d of departments) {
      const r = res[d.id]
      const a = idx.reduce((s, i) => s + r.arr[i], 0)
      const use = regIdx.length ? regIdx : idx
      const w = use.reduce((s, i) => s + r.wait[i], 0) / use.length
      const q = idx.reduce((s, i) => s + r.queue[i], 0) / idx.length
      byDept[d.id] = a
      waitByDept[d.id] = w
      queueByDept[d.id] = q
      arrivals += a
      waiting += q
      wSum += w * (a + 0.01)
      wW += a + 0.01
    }
    const wx = hourWx(cond, key, h)
    hours.push({
      hour: h,
      arrivals,
      byDept,
      waitByDept,
      queueByDept,
      wait: wSum / wW,
      waiting,
      crowd: predictedCrowd(waiting),
      traffic: Math.max(...idx.map((i) => traffic[i])),
      rain: wx?.rain ?? 0,
      rainProb: wx?.rainProb ?? null,
      temp: wx?.temp ?? null,
      canRegister: regIdx.length > 0,
    })
  }

  const byDept = Object.fromEntries(departments.map((d) => [d.id, res[d.id].arr.reduce((s, v) => s + v, 0)]))
  const slotArr = slots.map((_, i) => departments.reduce((s, d) => s + res[d.id].arr[i], 0))
  const peak = hours.reduce((a, b) => (!a || b.waiting > a.waiting ? b : a), null)
  return {
    key,
    closed: false,
    factors: f.factors,
    wx: f.wx,
    mult: f.mult,
    total: Object.values(byDept).reduce((a, b) => a + b, 0),
    byDept,
    hours,
    slots,
    slotArr,
    lateMins,
    peak,
  }
}

// The hour with the shortest expected wait (rain makes an hour less attractive).
export function bestHour(sim, deptId = null, fromMinute = 0) {
  if (!sim || sim.closed) return null
  let best = null
  for (const h of sim.hours) {
    if (!h.canRegister || (h.hour + 1) * 60 <= fromMinute) continue
    const w = deptId ? h.waitByDept[deptId] : h.wait
    const rainy = (h.rain ?? 0) >= 2 || (h.rainProb ?? 0) >= 60
    // Avoid sending people to the last half hour before registration closes
    // unless it is clearly better.
    const score = w + (rainy ? 15 : 0) + (h.hour === 13 ? 10 : 0)
    if (!best || score < best.score) best = { hour: h.hour, wait: round5(w), rainy, score, crowd: h.crowd }
  }
  return best
}

export function weekAhead(cond, fromKey, days = 7, deptId = null, learned = null, signals = []) {
  const out = []
  for (let i = 0; i < days; i++) {
    const key = addDays(fromKey, i)
    const sim = simulateDay(key, cond, { learned, signals })
    out.push({
      key,
      sim,
      closed: sim.closed,
      total: Math.round(sim.total),
      peakCrowd: sim.peak ? sim.peak.crowd : null,
      best: bestHour(sim, deptId),
      wx: dayWx(cond, key),
    })
  }
  return out
}

// Today, starting from the real queue.
export function predictNow(state, cond, now, learned = null, signals = []) {
  const key = dateKey(now)
  const minute = minutesOfDay(now)
  const waiting = {}
  const timing = {}
  for (const d of departments) {
    waiting[d.id] = waitingList(state, d.id).length
    timing[d.id] = deptTiming(state, d.id, now)
  }
  const hallWaiting = totalWaiting(state)
  const base = {
    key,
    minute,
    hallWaiting,
    hallCrowd: crowdLevel(hallWaiting, SEATS),
    waiting,
    waitNow: Object.fromEntries(departments.map((d) => [d.id, estimateWait(state, d.id, waiting[d.id], now)])),
    traffic: trafficAt(cond, key, minute),
  }
  if (minute >= REG_CLOSE_MIN) return { ...base, after: true, sim: simulateDay(key, cond, { learned, signals }) }
  const sim = simulateDay(key, cond, { fromMinute: minute, waiting, timing, learned, signals })
  if (sim.closed) return { ...base, closed: true, sim }
  let nextHour = 0
  sim.slots.forEach((m, i) => {
    if (m + SLOT > minute && m < minute + 60) nextHour += sim.slotArr[i]
  })
  const lateRisk = minute < 10 * 60 ? sim.lateMins : lateMinsFor(base.traffic)
  return { ...base, sim, nextHour: Math.round(nextHour), lateRisk: lateRisk >= 15 ? 'high' : lateRisk >= 10 ? 'medium' : 'low' }
}

// The next days against a usual day at this hospital, with the main reasons.
// level: veryBusy | busy | normal | quiet | closed
export function busyDays(week, learned = null) {
  const wk = learned?.weekday || DAY_FACTOR
  const usual = (BASE_DAILY * [1, 2, 3, 4, 5, 6].reduce((a, d) => a + wk[d], 0)) / 6
  return week.map((d) => {
    // Closed days carry the usual day too: the list may start on a Sunday.
    if (d.closed) return { ...d, level: 'closed', pct: -100, usual: Math.round(usual), reasons: [] }
    const pct = Math.round((d.total / usual - 1) * 100)
    const level = pct >= 25 ? 'veryBusy' : pct >= 10 ? 'busy' : pct <= -15 ? 'quiet' : 'normal'
    const reasons = (d.sim.factors || [])
      .filter((f) => f.pct)
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 3)
    return { ...d, level, pct, usual: Math.round(usual), reasons }
  })
}

// Practical suggestions for staff, from the day's forecast.
export function staffSuggestions(sim, cond, key, signals = []) {
  const out = []
  if (!sim || sim.closed) return out
  const wx = dayWx(cond, key) || {}
  const month = keyToDate(key).getMonth() + 1

  const lines = []
  for (const d of departments) {
    let peak = null
    for (const h of sim.hours) {
      const q = h.queueByDept[d.id]
      if (q > d.seats * 1.2 && (!peak || q > peak.q)) peak = { q, hour: h.hour }
    }
    if (peak) lines.push({ dept: d.id, ...peak, over: peak.q / d.seats })
  }
  lines
    .sort((a, b) => b.over - a.over)
    .slice(0, 2)
    .forEach((l) => out.push({ key: 'extraDoctor', level: 'warn', icon: 'doctor', dept: l.dept, hour: l.hour }))
  const crowded = sim.hours.find((h) => h.crowd === 'veryHigh')
  if (crowded) out.push({ key: 'overflow', level: 'warn', icon: 'chair', hour: crowded.hour })
  if ((wx.rain ?? 0) >= 5 || sim.hours.some((h) => h.rain >= 1)) out.push({ key: 'wetFloor', level: 'info', icon: 'rain' })
  if ((wx.tMax ?? 0) >= 38) out.push({ key: 'heat', level: 'warn', icon: 'sun', t: Math.round(wx.tMax) })
  if ((wx.aqi ?? 0) > 150) out.push({ key: 'air', level: 'warn', icon: 'wind', aqi: Math.round(wx.aqi) })
  if (sim.lateMins > 0) out.push({ key: 'traffic', level: 'info', icon: 'car', mins: sim.lateMins })
  if (sim.mult >= 1.15) out.push({ key: 'rush', level: 'info', icon: 'users' })
  if (wx.tMin != null && wx.tMin <= 10) out.push({ key: 'cold', level: 'info', icon: 'child' })
  const alerts = (signals || []).filter((x) => covers(x, key))
  if (month >= 7 && month <= 9 && !alerts.some((x) => x.type === 'outbreak')) out.push({ key: 'fever', level: 'info', icon: 'lab' })
  const seen = new Set()
  for (const x of alerts) {
    const s =
      x.source === 'opd'
        ? { key: 'sigTrend', level: 'warn', icon: 'users', dept: x.dept }
        : x.type === 'outbreak'
          ? { key: 'sigOutbreak', level: 'warn', icon: 'lab', disease: x.disease }
          : x.type === 'camp' || x.type === 'busier'
            ? { key: 'sigBusier', level: 'info', icon: 'users' }
            : { key: 'sigQuiet', level: 'info', icon: 'calendar' }
    const id = `${s.key}:${s.dept || s.disease || ''}`
    if (!seen.has(id)) out.push(s)
    seen.add(id)
  }
  if (!out.length) out.push({ key: 'normal', level: 'ok', icon: 'check' })
  return out
}

// ---- Learning from this hospital's own history ---------------------------------
// days: [{ date: 'YYYY-MM-DD', total, byHour: { 9: n }, byDept: { MED: n },
//          wx: { rain, tMax, tMin, aqi }, sample }]
// Each built-in value counts as K typical days; real days are added on top,
// so a week of data nudges the forecast and two months of data mostly decide it.
// Weather and day of the week are separated: a rainy Monday teaches both
// "Mondays are busy" and "rain keeps people home" (two rounds of fitting).
const K = 3

export function learnFromHistory(days) {
  const real = (days || []).filter((d) => d.total > 0 && keyToDate(d.date).getDay() !== 0)
  if (!real.length) return null
  // Days with a local alert (an outbreak, a festival…) are not usual days:
  // they teach what that kind of alert does here, not the usual pattern.
  const usual = real.filter((d) => !d.sig?.length)
  const base = usual.length ? usual : real
  const blend = (n, observed, typical) => (n * observed + K * typical) / (n + K)
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const dowOf = (d) => keyToDate(d.date).getDay()

  const weather = { ...DEFAULT_WEATHER }
  const weatherDays = { heavyRain: 0, rain: 0, heat: 0 }
  const weatherOf = (d) => {
    const k = weatherKind(d.wx)
    return k && k !== 'dry' ? weather[k] : 1
  }
  const weekday = { 0: 0 }
  const fitWeekday = () => {
    for (let dow = 1; dow <= 6; dow++) {
      const xs = base.filter((d) => dowOf(d) === dow).map((d) => d.total / BASE_DAILY / weatherOf(d))
      weekday[dow] = blend(xs.length, mean(xs), DAY_FACTOR[dow])
    }
  }
  const fitWeather = () => {
    for (const k of Object.keys(DEFAULT_WEATHER)) {
      const xs = base.filter((d) => weatherKind(d.wx) === k).map((d) => d.total / (BASE_DAILY * weekday[dowOf(d)]))
      weatherDays[k] = xs.length
      weather[k] = blend(xs.length, mean(xs), DEFAULT_WEATHER[k])
    }
  }
  fitWeekday()
  fitWeather()
  fitWeekday()

  const N = base.length
  const sumBy = (field, keys) => {
    const tot = Object.fromEntries(keys.map((k) => [k, 0]))
    let all = 0
    for (const d of base) {
      for (const k of keys) {
        const n = Number(d[field]?.[k] || 0)
        tot[k] += n
        all += n
      }
    }
    return { tot, all }
  }
  const hours = sumBy('byHour', HOURS)
  const hourShare = Object.fromEntries(
    HOURS.map((h) => [h, hours.all ? blend(N, hours.tot[h] / hours.all, HOUR_SHARE[h]) : HOUR_SHARE[h]]),
  )
  const depts = sumBy(
    'byDept',
    departments.map((d) => d.id),
  )
  const deptShare = Object.fromEntries(
    departments.map((d) => [d.id, depts.all ? blend(N, depts.tot[d.id] / depts.all, d.sampleShare) : d.sampleShare]),
  )

  // Each kind of alert seen in the history: how many more (or fewer) patients
  // came than a usual day like it would bring, blended with the starting value.
  const expected = (d) => BASE_DAILY * weekday[dowOf(d)] * weatherOf(d)
  const pctOf = (m) => Math.round((m - 1) * 100)
  const signals = {}
  for (const kind of [...new Set(real.flatMap((d) => d.sig || []))]) {
    const ds = real.filter((d) => d.sig.includes(kind))
    const [type, disease] = kind.split(':')
    if (type === 'outbreak') {
      const deptsFx = {}
      for (const [dep, p] of Object.entries(DISEASE_EFFECT[disease] || {})) {
        const xs = ds.map((d) => Number(d.byDept?.[dep] || 0) / (expected(d) * deptShare[dep]))
        deptsFx[dep] = pctOf(blend(xs.length, mean(xs), 1 + p / 100))
      }
      signals[kind] = { all: 0, depts: deptsFx, days: ds.length }
    } else if (TYPE_EFFECT[type] != null) {
      const xs = ds.map((d) => d.total / expected(d))
      signals[kind] = { all: pctOf(blend(xs.length, mean(xs), 1 + TYPE_EFFECT[type] / 100)), depts: {}, days: ds.length }
    }
  }

  return {
    days: real.length,
    sampleDays: real.filter((d) => d.sample).length,
    withWeather: real.filter((d) => d.wx).length,
    from: real[real.length - 1]?.date,
    weekday,
    weather,
    weatherDays,
    hourShare,
    deptShare,
    signals,
  }
}

// Early warning from this OPD's own numbers: a department that had clearly
// more patients than a usual day would bring (allowing for the day of the
// week, the weather and alerts already known) on each of the last 3 open days.
// "Usual" is learned from the weeks before those 3 days, so a rise does not
// hide itself. Often the first sign of a local outbreak. → [{ dept, pct, days }]
export function opdTrend(days, learnedAll, todayKey) {
  const recent = (days || [])
    .filter((d) => d.date < todayKey && d.total > 0 && keyToDate(d.date).getDay() !== 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
  if (recent.length < 3) return []
  const recentDates = new Set(recent.map((d) => d.date))
  const learned = learnFromHistory(days.filter((d) => !recentDates.has(d.date))) || learnedAll
  if (!learned) return []
  const usualFor = (d, dep) => {
    const k = weatherKind(d.wx)
    let m = BASE_DAILY * learned.weekday[keyToDate(d.date).getDay()] * (k && k !== 'dry' ? learned.weather[k] : 1) * learned.deptShare[dep]
    for (const kind of d.sig || []) {
      const fx = learned.signals?.[kind]
      if (fx) m *= (1 + (fx.all || 0) / 100) * (1 + (fx.depts?.[dep] || 0) / 100)
    }
    return m
  }
  const out = []
  for (const dep of departments) {
    let actual = 0
    let usualSum = 0
    let everyDay = true
    for (const d of recent) {
      const a = Number(d.byDept?.[dep.id] || 0)
      const u = usualFor(d, dep.id)
      actual += a
      usualSum += u
      if (a < u * 1.05) everyDay = false
    }
    const ratio = usualSum ? actual / usualSum : 1
    if (everyDay && ratio >= 1.2 && actual >= 15) out.push({ dept: dep.id, pct: Math.round((ratio - 1) * 100), days: recent.length })
  }
  return out
}

// The warning as an alert for the forecast: half the recent extra, for a week.
export function trendSignals(trend, todayKey) {
  return trend.map((x) => ({
    id: `opd-${x.dept}`,
    source: 'opd',
    type: 'busier',
    dept: x.dept,
    pct: x.pct,
    from: todayKey,
    to: addDays(todayKey, 6),
    effect: { all: 0, depts: { [x.dept]: Math.round(x.pct / 2) } },
  }))
}
