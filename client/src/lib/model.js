// Weather, air and traffic in one shape, wherever they come from:
// {
//   source: 'live' (Open-Meteo) | 'n8n' | 'sample',
//   fetchedAt,
//   now:    { temp, rain, code, humidity, wind, aqi },
//   hourly: { 'YYYY-MM-DDTHH': { temp, rain, rainProb, code, aqi } },
//   daily:  { 'YYYY-MM-DD':    { tMax, tMin, rain, rainProb, code, aqi } },
//   traffic: { level 0..1, ratio, at, source } | null,
//   scenario: { rain, heat, smog, cold, jam }   (demo "what if" switches)
// }
// Everything here is pure, so it also runs in Node for tests.

import { dateKey, addDays, keyToDate } from './clock.js'

const pad = (n) => String(n).padStart(2, '0')
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const hourKey = (key, h) => `${key}T${pad(h)}`

export function dayWx(cond, key) {
  return cond?.daily?.[key] || null
}

export function hourWx(cond, key, h) {
  return cond?.hourly?.[hourKey(key, h)] || null
}

// ---- Weather codes (WMO) ------------------------------------------------------

export function wxKind(code) {
  if (code == null) return 'unknown'
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

export const wxIcon = {
  clear: 'sun',
  partly: 'cloudSun',
  cloudy: 'cloud',
  fog: 'fog',
  drizzle: 'rain',
  rain: 'rain',
  snow: 'cloud',
  storm: 'storm',
  unknown: 'cloud',
}

export function aqiLevel(aqi) {
  if (aqi == null) return 'unknown'
  if (aqi <= 50) return 'good'
  if (aqi <= 100) return 'moderate'
  if (aqi <= 150) return 'sensitive'
  if (aqi <= 200) return 'unhealthy'
  return 'veryUnhealthy'
}

// ---- Traffic --------------------------------------------------------------------
// Without a live traffic feed we estimate road traffic from the time of day,
// the day of the week and rain. 0 = empty roads, 1 = jam.

export function trafficModel(date, rainMm = 0) {
  const h = date.getHours() + date.getMinutes() / 60
  const dow = date.getDay()
  const bump = (c, w, a) => a * Math.exp(-((h - c) ** 2) / (2 * w * w))
  let lvl = 0.12 + bump(9.25, 1.1, 0.6) + bump(18.5, 1.4, 0.65) + bump(13.5, 1.2, 0.18)
  if (dow === 0) lvl *= 0.55
  else if (dow === 6) lvl *= 0.85
  else if (dow === 1) lvl *= 1.1
  if (rainMm >= 5) lvl += 0.25
  else if (rainMm >= 1) lvl += 0.12
  return clamp(lvl, 0, 1)
}

export function trafficAt(cond, key, minute) {
  const d = keyToDate(key)
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0)
  const wx = hourWx(cond, key, Math.floor(minute / 60))
  let lvl = trafficModel(d, wx?.rain || 0)
  const live = cond?.traffic
  if (live && live.level != null && live.at) {
    // Blend a live reading (from n8n) into the estimate near the time it was taken.
    const diffH = Math.abs(d.getTime() - live.at) / 3600000
    if (diffH < 3) {
      const at = new Date(live.at)
      const then = hourWx(cond, dateKey(live.at), at.getHours())
      lvl += (live.level - trafficModel(at, then?.rain || 0)) * (1 - diffH / 3)
    }
  }
  if (cond?.scenario?.jam) lvl += 0.4
  return clamp(lvl, 0, 1)
}

export function trafficLabel(level) {
  if (level < 0.35) return 'light'
  if (level < 0.6) return 'moderate'
  if (level < 0.8) return 'heavy'
  return 'jam'
}

// How much longer a trip takes than on empty roads.
export function travelFactor(level) {
  return 1 + level * 1.2
}

// ---- Open-Meteo and n8n ------------------------------------------------------------

export function fromOpenMeteo(w, a) {
  const hourly = {}
  w.hourly.time.forEach((t, i) => {
    hourly[t.slice(0, 13)] = {
      temp: w.hourly.temperature_2m[i],
      rain: w.hourly.precipitation[i] ?? 0,
      rainProb: w.hourly.precipitation_probability?.[i] ?? null,
      code: w.hourly.weather_code[i],
      aqi: null,
    }
  })
  if (a?.hourly?.time) {
    a.hourly.time.forEach((t, i) => {
      const k = t.slice(0, 13)
      if (hourly[k]) hourly[k].aqi = a.hourly.us_aqi[i]
    })
  }
  const daily = {}
  w.daily.time.forEach((d, i) => {
    let aqi = null
    for (let h = 8; h <= 14; h++) {
      const v = hourly[hourKey(d, h)]?.aqi
      if (v != null) aqi = Math.max(aqi ?? 0, v)
    }
    daily[d] = {
      tMax: w.daily.temperature_2m_max[i],
      tMin: w.daily.temperature_2m_min[i],
      rain: w.daily.precipitation_sum[i] ?? 0,
      rainProb: w.daily.precipitation_probability_max?.[i] ?? null,
      code: w.daily.weather_code[i],
      aqi,
    }
  })
  return {
    source: 'live',
    fetchedAt: Date.now(),
    now: {
      temp: w.current?.temperature_2m ?? null,
      rain: w.current?.precipitation ?? 0,
      code: w.current?.weather_code ?? null,
      humidity: w.current?.relative_humidity_2m ?? null,
      wind: w.current?.wind_speed_10m ?? null,
      aqi: a?.current?.us_aqi ?? null,
    },
    hourly,
    daily,
    traffic: null,
  }
}

// The n8n feed workflow returns the shape above already.
export function fromFeed(json) {
  const j = Array.isArray(json) ? json[0] : json
  if (!j || !j.hourly || !j.daily) throw new Error('bad feed')
  return {
    ...j,
    source: 'n8n',
    fetchedAt: Date.now(),
    traffic: j.traffic && j.traffic.level != null ? { ...j.traffic, at: j.traffic.at || Date.now() } : null,
  }
}

// ---- Sample data (offline) ------------------------------------------------------------
// Typical north-Indian weather by month: max °C, min °C, chance of a rainy
// day, rain on a rainy day (mm), usual AQI.
const CLIMATE = [
  [21, 8, 0.1, 6, 230],
  [25, 11, 0.1, 5, 190],
  [31, 16, 0.08, 4, 150],
  [37, 21, 0.06, 4, 140],
  [41, 26, 0.1, 6, 150],
  [39, 28, 0.35, 15, 110],
  [34, 27, 0.6, 25, 70],
  [33, 26, 0.6, 22, 65],
  [33, 25, 0.45, 15, 80],
  [32, 20, 0.12, 6, 160],
  [28, 14, 0.05, 4, 240],
  [23, 9, 0.08, 4, 260],
]

function seeded(str) {
  let h = 2166136261
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sampleConditions(now = Date.now()) {
  const daily = {}
  const hourly = {}
  const today = dateKey(now)
  for (let i = -1; i < 8; i++) {
    const key = addDays(today, i)
    const [tx, tn, pRain, mm, aqi] = CLIMATE[keyToDate(key).getMonth()]
    const r = seeded(key)
    const rainy = r() < pRain
    const rain = rainy ? Math.round(mm * (0.4 + r() * 1.4)) : 0
    const tMax = Math.round(tx + (r() - 0.5) * 4 - (rainy ? 2 : 0))
    const tMin = Math.round(tn + (r() - 0.5) * 3)
    const dayAqi = Math.round(aqi * (0.75 + r() * 0.5) * (rainy ? 0.7 : 1))
    const rainStart = 9 + Math.floor(r() * 6)
    const code = rainy ? (rain > 15 ? 65 : 61) : r() < 0.5 ? 1 : 0
    daily[key] = { tMax, tMin, rain, rainProb: rainy ? 60 + Math.round(r() * 35) : Math.round(r() * 20), code, aqi: dayAqi }
    for (let h = 0; h < 24; h++) {
      const frac = (1 - Math.cos(((h - 3) / 24) * 2 * Math.PI)) / 2
      const rainH = rainy && h >= rainStart && h < rainStart + 4 ? Math.round((rain / 4) * 10) / 10 : 0
      hourly[hourKey(key, h)] = {
        temp: Math.round(tMin + (tMax - tMin) * frac),
        rain: rainH,
        rainProb: rainH ? 75 : Math.round(daily[key].rainProb / 2),
        code: rainH ? 61 : rainy ? 3 : code,
        aqi: Math.round(dayAqi * (h < 10 || h > 19 ? 1.1 : 0.9)),
      }
    }
  }
  const nowH = hourly[hourKey(today, new Date(now).getHours())]
  return {
    source: 'sample',
    fetchedAt: Date.now(),
    now: { temp: nowH.temp, rain: nowH.rain, code: nowH.code, humidity: 55, wind: 8, aqi: nowH.aqi },
    hourly,
    daily,
    traffic: null,
  }
}

// ---- Demo "what if" switches ---------------------------------------------------------------

export function applyScenario(cond, sc, todayKey) {
  if (!cond || !sc || !Object.values(sc).some(Boolean)) return cond
  const c = structuredClone(cond)
  c.scenario = { ...sc }
  const day = (c.daily[todayKey] ||= { tMax: 30, tMin: 20, rain: 0, rainProb: 0, code: 1, aqi: 100 })
  const eachHour = (fn) => {
    for (let h = 0; h < 24; h++) {
      const k = hourKey(todayKey, h)
      c.hourly[k] = fn({ ...(c.hourly[k] || { temp: 28, rain: 0, rainProb: 0, code: 1, aqi: 100 }) }, h)
    }
  }
  if (sc.rain) {
    Object.assign(day, { rain: Math.max(day.rain || 0, 35), rainProb: 95, code: 65 })
    eachHour((x, h) => (h >= 7 && h <= 15 ? { ...x, rain: 6, rainProb: 95, code: 65 } : x))
    c.now = { ...c.now, rain: 6, code: 65 }
  }
  if (sc.heat) {
    day.tMax = Math.max(day.tMax ?? 0, 45)
    eachHour((x) => ({ ...x, temp: (x.temp ?? 30) + 7 }))
    c.now = { ...c.now, temp: Math.max(c.now.temp ?? 0, 43) }
  }
  if (sc.smog) {
    day.aqi = 320
    eachHour((x) => ({ ...x, aqi: 320 }))
    c.now = { ...c.now, aqi: 320 }
  }
  if (sc.cold) {
    day.tMin = Math.min(day.tMin ?? 99, 5)
    c.now = { ...c.now, temp: Math.min(c.now.temp ?? 99, 8) }
  }
  return c
}
