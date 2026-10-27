// Weather, air quality and traffic for the forecast, fetched by the server
// for every screen and cached for 15 minutes.
// Order: the n8n conditions feed (if set) -> Open-Meteo (free, no key) -> sample data.

import { fromOpenMeteo, fromFeed, sampleConditions } from '../../client/src/lib/model.js'

const TTL = 15 * 60 * 1000

async function getJSON(url, ms = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function createConditions(store) {
  let mem = null

  return async function getConditions({ force = false, simTime = Date.now() } = {}) {
    const cfg = await store.getConfig()
    const feedUrl = cfg.feedUrl || process.env.N8N_FEED_URL || ''
    const key = `${feedUrl}|${cfg.lat}|${cfg.lon}`
    if (!mem) mem = await store.getCache('conditions')
    if (!force && mem && mem.key === key && Date.now() - mem.fetchedAt < TTL) return mem

    let data = null
    if (feedUrl) {
      try {
        data = fromFeed(await getJSON(feedUrl, 25000))
      } catch (err) {
        console.warn('n8n conditions feed failed:', err.message)
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
          getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&forecast_days=5&current=us_aqi&hourly=us_aqi`).catch(() => null),
        ])
        data = fromOpenMeteo(w, a)
      } catch (err) {
        console.warn('Open-Meteo failed, using sample weather:', err.message)
      }
    }
    if (!data) data = sampleConditions(simTime)
    data.key = key
    mem = data
    store.setCache('conditions', data).catch(() => {})
    return data
  }
}
