// Loads weather, air quality and traffic for the forecast.
// Order: the n8n feed (if set) -> Open-Meteo (free, no key) -> sample data.
// Results are cached for 15 minutes so a weak connection is not hammered.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { getIntegrations } from './n8n.js'
import { isServer, whenReady, API } from './store.js'
import { fromOpenMeteo, fromFeed, sampleConditions, applyScenario } from './model.js'
import { dateKey } from './clock.js'

const CACHE = 'opd-saathi-conditions'
const TTL = 15 * 60 * 1000

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE) || 'null')
  } catch {
    return null
  }
}

function writeCache(c) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(c))
  } catch {
    // ignore
  }
}

async function getJSON(url, ms = 8000) {
  const ctl = new AbortController()
  const id = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(id)
  }
}

const cfgKey = (cfg) => `${cfg.feedUrl}|${cfg.lat}|${cfg.lon}`

export async function fetchConditions({ force = false, simTime = Date.now() } = {}) {
  await whenReady()
  if (isServer()) {
    // The server fetches (and caches) weather, air and the n8n feed for everyone.
    try {
      const data = await getJSON(`${API}/api/conditions${force ? '?force=1' : ''}`, 12000)
      writeCache({ ...data, key: 'server' })
      return data
    } catch {
      return readCache() || sampleConditions(simTime)
    }
  }
  const cfg = getIntegrations()
  const cached = readCache()
  if (!force && cached && cached.key === cfgKey(cfg) && Date.now() - cached.fetchedAt < TTL) return cached

  let data = null
  if (cfg.feedUrl) {
    try {
      data = fromFeed(await getJSON(cfg.feedUrl))
    } catch {
      data = null
    }
  }
  if (!data) {
    try {
      const q = `latitude=${cfg.lat}&longitude=${cfg.lon}&timezone=auto`
      const [w, a] = await Promise.all([
        getJSON(
          `https://api.open-meteo.com/v1/forecast?${q}&past_days=1&forecast_days=7` +
            '&current=temperature_2m,precipitation,weather_code,wind_speed_10m,relative_humidity_2m' +
            '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
        ),
        getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&forecast_days=5&current=us_aqi&hourly=us_aqi`).catch(
          () => null,
        ),
      ])
      data = fromOpenMeteo(w, a)
    } catch {
      data = null
    }
  }
  if (!data) data = sampleConditions(simTime)
  data.key = cfgKey(cfg)
  writeCache(data)
  return data
}

// ---- Demo "what if" switches (rain, heat wave, bad air, cold, traffic jam) ----

const SC = 'opd-saathi-scenario'
const scSubs = new Set()
let scenario = loadScenario()

function loadScenario() {
  try {
    return JSON.parse(localStorage.getItem(SC) || '{}')
  } catch {
    return {}
  }
}

export function setScenario(patch) {
  scenario = { ...scenario, ...patch }
  try {
    localStorage.setItem(SC, JSON.stringify(scenario))
  } catch {
    // ignore
  }
  for (const fn of scSubs) fn()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SC) {
      scenario = loadScenario()
      for (const fn of scSubs) fn()
    }
  })
}

export function useScenario() {
  const sc = useSyncExternalStore(
    (fn) => {
      scSubs.add(fn)
      return () => scSubs.delete(fn)
    },
    () => scenario,
  )
  return [sc, setScenario]
}

// ---- Hook ---------------------------------------------------------------------

export function useConditions(simTime) {
  const [raw, setRaw] = useState(() => readCache())
  const [loading, setLoading] = useState(true)
  const [force, setForce] = useState(0)
  const [sc] = useScenario()

  useEffect(() => {
    let alive = true
    const load = (f) => {
      setLoading(true)
      fetchConditions({ force: f, simTime }).then((d) => {
        if (!alive) return
        setRaw(d)
        setLoading(false)
      })
    }
    load(force > 0)
    const id = setInterval(() => load(false), TTL)
    const onCfg = () => load(true)
    window.addEventListener('opd-integrations', onCfg)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('opd-integrations', onCfg)
    }
    // simTime only matters for sample data; do not refetch every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [force])

  const today = dateKey(simTime)
  const cond = useMemo(() => applyScenario(raw, sc, today), [raw, sc, today])
  const refresh = useCallback(() => setForce((n) => n + 1), [])
  return { cond, raw, loading, refresh, scenario: sc }
}
