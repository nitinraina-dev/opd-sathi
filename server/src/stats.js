// Registrations per day, hour and department. Kept separately from the queues
// (a demo "reset" does not clear them), so the forecast learns how busy this
// hospital really is. Sample patients from the demo button are not counted.

import { learnFromHistory, BASE_DAILY } from '../../client/src/lib/predict.js'
import { simNow, dateKey, addDays, keyToDate } from '../../client/src/lib/clock.js'

export function createStats(store, getConditions) {
  let cache = null
  // Kinds of local alert in force on a day (set by the alerts module).
  let kindsOn = async () => []

  return {
    useSignals(fn) {
      kindsOn = fn
    },

    // Count one registration, with the day's weather so the forecast can
    // learn what rain and heat do here.
    async record(state, dept) {
      const now = simNow(state.clock)
      const date = dateKey(now)
      let wx = null
      try {
        const d = (await getConditions())?.daily?.[date]
        if (d) wx = { rain: d.rain ?? 0, tMax: d.tMax ?? null, tMin: d.tMin ?? null, aqi: d.aqi ?? null }
      } catch {
        // weather unknown today
      }
      const sig = await kindsOn(date).catch(() => [])
      cache = null
      return store.incStat(date, new Date(now).getHours(), dept, wx, sig)
    },

    async learned() {
      if (cache && Date.now() - cache.at < 30_000) return cache.value
      const value = learnFromHistory(await store.getStats(56))
      cache = { at: Date.now(), value }
      return value
    },

    async history() {
      return store.getStats(56)
    },

    // Demo: four weeks of made-up history for a hospital that is busier than
    // usual on Mondays, peaks at 10:00 instead of 9:00, and empties more than
    // usual on rainy days, so you can see the forecast learn. It also has a
    // dengue alert two to three weeks ago (more General Medicine and Children
    // patients), a festival day (fewer), and, in the last 3 open days, more
    // fever patients with no alert yet, which the early warning picks up.
    // Marked as sample.
    async loadSample(state) {
      const now = simNow(state.clock)
      const week = { 1: 1.55, 2: 1.15, 3: 1.0, 4: 0.95, 5: 0.9, 6: 0.7 }
      const hours = { 8: 0.12, 9: 0.21, 10: 0.27, 11: 0.19, 12: 0.13, 13: 0.08 }
      const dept = { MED: 0.4, CHD: 0.13, WMN: 0.12, BON: 0.1, ENT: 0.07, EYE: 0.1, SKN: 0.08 }
      let seed = 7
      const rand = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      const rows = []
      const today = dateKey(now)
      let open = 0
      for (let i = 1; i <= 28; i++) {
        const date = addDays(today, -i)
        const dow = keyToDate(date).getDay()
        if (dow === 0) continue
        open++
        const dengue = i >= 15 && i <= 21
        const festival = i === 10
        const rising = open <= 3
        // Weather for that day: about one day in four is rainy (the last 3
        // open days are dry, so the rise in fever patients shows clearly).
        const r = rising ? 1 : rand()
        const wx =
          r < 0.12
            ? { rain: Math.round(22 + rand() * 20), tMax: 28, tMin: 21, aqi: 70 }
            : r < 0.25
              ? { rain: Math.round(6 + rand() * 10), tMax: 30, tMin: 21, aqi: 90 }
              : { rain: 0, tMax: Math.round(30 + rand() * 4), tMin: Math.round(18 + rand() * 3), aqi: Math.round(120 + rand() * 80) }
        const rainEffect = wx.rain >= 20 ? 0.55 : wx.rain >= 5 ? 0.8 : 1
        const dayAll = BASE_DAILY * week[dow] * rainEffect * (festival ? 0.75 : 1) * (0.9 + rand() * 0.2)
        const extra = { MED: dengue ? 1.35 : rising ? 1.4 : 1, CHD: dengue ? 1.25 : rising ? 1.35 : 1 }
        const byDept = Object.fromEntries(Object.entries(dept).map(([k, v]) => [k, Math.round(dayAll * v * (extra[k] || 1) * (0.92 + rand() * 0.16))]))
        const total = Object.values(byDept).reduce((a, b) => a + b, 0)
        const byHour = Object.fromEntries(Object.entries(hours).map(([k, v]) => [k, Math.round(total * v * (0.9 + rand() * 0.2))]))
        const sig = dengue ? ['outbreak:dengue'] : festival ? ['festival'] : []
        rows.push({ date, total, byHour, byDept, wx, sig, sample: true })
      }
      await store.putStats(rows)
      cache = null
      return rows.length
    },

    async clear() {
      await store.clearStats()
      cache = null
    },
  }
}
