// Forecast summary for other systems (the n8n morning report calls
// GET /api/forecast). Uses the same model as the staff Forecast screen.

import { predictNow, simulateDay, weekAhead, staffSuggestions, busyDays } from '../../client/src/lib/predict.js'
import { factorText } from '../../client/src/lib/text.js'
import { trafficLabel, wxKind } from '../../client/src/lib/model.js'
import { translate } from '../../client/src/i18n/translate.js'
import { dateKey, simNow, hm, fmtTime } from '../../client/src/lib/clock.js'
import { departments } from '../../client/src/data/departments.js'
import { round5 } from '../../client/src/lib/queue.js'

const range = (h) => (h === 13 ? '13:00–13:30' : `${hm(h * 60)}–${hm((h + 1) * 60)}`)

export function buildForecast(state, cond, lang = 'en', learned = null, signals = []) {
  const t = (k, v) => translate(lang, k, v)
  const now = simNow(state.clock)
  const key = dateKey(now)
  const pred = predictNow(state, cond, now, learned, signals)
  const day = simulateDay(key, cond, { learned, signals })
  const week = weekAhead(cond, key, 7, null, learned, signals)
  const tips = staffSuggestions(day, cond, key, signals)
  const busy = busyDays(week, learned)

  const factors = day.factors.map((f) => factorText(f, t))
  const suggestions = tips.map((s) =>
    t(`suggest.${s.key}`, {
      dept: s.dept ? t(`depts.${s.dept}.name`) : '',
      disease: s.disease ? t(`signals.disease.${s.disease}`) : '',
      time: s.hour != null ? hm(s.hour * 60) : '',
      t: s.t,
      aqi: s.aqi,
      n: s.mins,
    }),
  )

  const lines = [
    `${t('forecast.title')} · ${t('app.hospital')} · ${key}`,
    day.closed ? t('factors.closed') : `${t('forecast.todayTotal')}: ${Math.round(day.total)} ${t('forecast.patientsUnit')}`,
  ]
  if (!day.closed && day.peak) lines.push(`${range(day.peak.hour)}: ${t(`crowd.${day.peak.crowd}`)}`)
  if (factors.length) lines.push(`${t('forecast.why')}: ${factors.join('; ')}`)
  for (const s of suggestions) lines.push(`• ${s}`)
  // Busy days in the week ahead, for planning staff.
  const ahead = busy.slice(1).filter((d) => d.level === 'veryBusy' || d.level === 'busy')
  if (ahead.length) {
    lines.push(`${t('busy.title')}:`)
    for (const d of ahead)
      lines.push(`• ${d.key}: ${t(`busy.level.${d.level}`)} (${d.pct > 0 ? '+' : ''}${d.pct}%)${d.reasons.length ? ` · ${d.reasons.map((f) => factorText(f, t)).join('; ')}` : ''}`)
  }

  return {
    date: key,
    hospitalTime: fmtTime(now),
    source: cond.source,
    learnedFromDays: learned ? learned.days : 0,
    now: {
      waiting: pred.hallWaiting,
      hallCrowd: pred.hallCrowd,
      nextHourArrivals: pred.nextHour ?? null,
      doctorsLateRisk: pred.lateRisk ?? null,
      roads: trafficLabel(pred.traffic),
      waitForNewPatient: pred.waitNow,
    },
    today: {
      closed: day.closed,
      total: Math.round(day.total),
      byDept: Object.fromEntries(departments.map((d) => [d.id, Math.round(day.byDept[d.id] || 0)])),
      peakHour: day.peak ? day.peak.hour : null,
      peakCrowd: day.peak ? day.peak.crowd : null,
      hours: (day.hours || []).map((h) => ({ hour: h.hour, arrivals: Math.round(h.arrivals), wait: round5(h.wait), crowd: h.crowd })),
      factors,
      suggestions,
    },
    alerts: signals.map((x) => ({ type: x.type, disease: x.disease || null, dept: x.dept || null, from: x.from, to: x.to, source: x.source })),
    week: busy.map((d) => ({
      date: d.key,
      closed: d.closed,
      total: d.total,
      level: d.level,
      vsUsualPct: d.closed ? null : d.pct,
      reasons: d.reasons.map((f) => factorText(f, t)),
      peakCrowd: d.peakCrowd,
      bestHour: d.best ? d.best.hour : null,
      weather: d.wx ? wxKind(d.wx.code) : null,
      tMax: d.wx?.tMax ?? null,
      rainMm: d.wx?.rain ?? null,
    })),
    text: lines.join('\n'),
  }
}
