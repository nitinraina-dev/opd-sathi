// Local alerts for the forecast.
// - Staff add an alert: an outbreak in the district, a festival or mela, a
//   bandh, roads closed, a health camp. It changes the forecast for its dates.
// - News: every 3 hours the server reads local headlines (Google News, in
//   English and Hindi) for the hospital's town. Headlines that name the town
//   and sound like one of these are grouped by kind into suggestions, which
//   staff accept or ignore. A headline never changes the forecast by itself.
// - This OPD's own numbers: a department busier than usual 3 days running
//   raises a warning by itself (opdTrend in lib/predict.js).
// Nothing about patients leaves the server; only the town's name is searched.
//
//   GET    /api/signals              alerts in force (everyone: no titles or news);
//                                    staff also get suggestions and the news status
//   POST   /api/signals              add an alert (staff)
//   POST   /api/signals/:id/accept   a news suggestion becomes an alert (staff)
//   POST   /api/signals/:id/dismiss  ignore a news suggestion for a week (staff)
//   DELETE /api/signals/:id          end an alert (staff)
//   POST   /api/signals/news         read the news now (staff)

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { Router } from 'express'
import { SIGNAL_TYPES, DISEASES, STRENGTH, DEFAULT_DAYS } from '../../client/src/data/signals.js'
import { classifyHeadline, parseRss, kindOf, covers } from '../../client/src/lib/signals.js'
import { opdTrend, trendSignals } from '../../client/src/lib/predict.js'
import { simNow, dateKey, addDays } from '../../client/src/lib/clock.js'

const DAY_MS = 24 * 60 * 60 * 1000
const NEWS_EVERY = 3 * 60 * 60 * 1000
const DAY = /^\d{4}-\d{2}-\d{2}$/
const EN_WORDS =
  '(dengue OR malaria OR "viral fever" OR flu OR cholera OR typhoid OR diarrhoea OR conjunctivitis OR "eye flu" OR covid OR bandh OR strike OR waterlogging OR "road closed" OR diversion OR mela OR "health camp")'
const HI_WORDS =
  '(डेंगू OR मलेरिया OR "वायरल बुखार" OR डायरिया OR हैजा OR टाइफाइड OR "आई फ्लू" OR कोरोना OR हड़ताल OR "भारत बंद" OR जलभराव OR डायवर्जन OR मेला OR "स्वास्थ्य शिविर")'

class Bad extends Error {}
const bad = (msg) => {
  throw new Bad(msg)
}
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function createSignals({ store, hospital, stats, audit, auth }) {
  const news = { at: null, ok: null, error: '', found: 0 }
  const today = () => dateKey(simNow(hospital.raw().clock))
  const all = () => store.listSignals()
  const inForce = (list, t) => list.filter((x) => x.status === 'active' && x.to >= t)

  // The hospital's own numbers: departments busier than usual lately.
  async function trend(t) {
    return trendSignals(opdTrend(await stats.history(), await stats.learned(), t), t)
  }

  // What the forecast uses: alerts in force, and the OPD's own warning.
  async function forForecast() {
    const t = today()
    return [...inForce(await all(), t), ...(await trend(t))]
  }

  // Kinds of alert on a day, written into that day's history for learning.
  async function kindsOn(key) {
    return [...new Set((await all()).filter((x) => x.status === 'active' && covers(x, key)).map(kindOf))]
  }

  // ---- News ------------------------------------------------------------------
  const feedUrl = (q, lang) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=${lang === 'hi' ? 'hi' : 'en-IN'}&gl=IN&ceid=IN:${lang === 'hi' ? 'hi' : 'en'}`
  async function fetchFeed(url) {
    // Tests read a saved feed instead of the internet.
    if (process.env.NEWS_FILE) return fs.readFile(process.env.NEWS_FILE, 'utf8')
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`News: HTTP ${res.status}`)
    return res.text()
  }

  async function readNews() {
    if (process.env.NEWS === 'off') return news
    const cfg = await store.getConfig()
    const names = [cfg.place, cfg.placeHi].filter(Boolean)
    if (!names.length) return news
    try {
      const items = []
      if (cfg.place) items.push(...parseRss(await fetchFeed(feedUrl(`"${cfg.place}" ${EN_WORDS}`, 'en'))))
      if (cfg.placeHi) items.push(...parseRss(await fetchFeed(feedUrl(`${cfg.placeHi} ${HI_WORDS}`, 'hi'))))
      // Only headlines from the last week that name the town, grouped by kind.
      const lower = names.map((n) => n.toLowerCase())
      const byKind = new Map()
      const seen = new Set()
      for (const it of items) {
        const title = it.title.toLowerCase()
        if (seen.has(title) || !lower.some((n) => title.includes(n))) continue
        if (it.publishedAt && it.publishedAt < Date.now() - 7 * DAY_MS) continue
        seen.add(title)
        const c = classifyHeadline(it.title)
        if (!c) continue
        const kind = kindOf(c)
        if (!byKind.has(kind)) byKind.set(kind, { ...c, items: [] })
        byKind.get(kind).items.push(it)
      }
      const list = await all()
      const t = today()
      const covered = new Set(inForce(list, t).filter((x) => covers(x, t)).map(kindOf))
      for (const [kind, g] of byKind) {
        const id = `news-${kind.replace(':', '-')}`
        const old = list.find((x) => x.id === id)
        const quiet = old?.status === 'dismissed' && Date.now() - old.decidedAt < 7 * DAY_MS
        await store.saveSignal({
          id,
          source: 'news',
          type: g.type,
          disease: g.disease || null,
          status: quiet ? 'dismissed' : covered.has(kind) ? 'covered' : 'suggested',
          headlines: g.items.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)).slice(0, 5),
          count: g.items.length,
          seenAt: Date.now(),
          ...(quiet ? { decidedAt: old.decidedAt, decidedBy: old.decidedBy } : {}),
        })
      }
      // Suggestions with no news this week, and alerts long over, are dropped.
      for (const x of list) {
        if (x.source === 'news' && x.status !== 'active' && !byKind.has(kindOf(x)) && x.status !== 'dismissed') await store.deleteSignal(x.id)
        if (x.status === 'active' && x.to < addDays(t, -30)) await store.deleteSignal(x.id)
      }
      Object.assign(news, { at: Date.now(), ok: true, error: '', found: byKind.size })
    } catch (err) {
      Object.assign(news, { at: Date.now(), ok: false, error: err.message, found: 0 })
    }
    return news
  }
  setTimeout(readNews, 5000).unref()
  setInterval(readNews, NEWS_EVERY).unref()

  // ---- Routes ------------------------------------------------------------------
  const router = Router()
  const staffOnly = auth.requireRole('signals')
  const send = (res, fn) =>
    fn()
      .then((out) => res.json(out))
      .catch((err) => {
        if (err instanceof Bad) return res.status(400).json({ error: err.message })
        console.error(err)
        res.status(500).json({ error: 'Server error' })
      })

  // Dates and strength from a form (defaults: from today, for the usual length).
  function period(b, type) {
    const t = today()
    const from = b.from === undefined ? t : DAY.test(b.from) ? b.from : bad('from')
    const to = b.to === undefined ? addDays(from, DEFAULT_DAYS[type] - 1) : DAY.test(b.to) ? b.to : bad('to')
    if (to < from) bad('to')
    if (to < t) bad('to')
    if (to > addDays(from, 60)) bad('to')
    const strength = b.strength === undefined ? 'medium' : STRENGTH[b.strength] ? b.strength : bad('strength')
    return { from, to, strength }
  }

  router.get('/signals', (req, res) =>
    send(res, async () => {
      const t = today()
      const list = await all()
      const active = [...inForce(list, t), ...(await trend(t))]
      if (!req.staff) {
        // Everyone (the patient's Plan page): what changes the forecast, nothing more.
        return {
          active: active.map((x) => ({
            id: x.id,
            source: x.source === 'opd' ? 'opd' : 'alert',
            type: x.type,
            disease: x.disease || null,
            dept: x.dept || null,
            from: x.from,
            to: x.to,
            strength: x.strength || 'medium',
            ...(x.effect ? { effect: x.effect } : {}),
          })),
        }
      }
      const cfg = await store.getConfig()
      return {
        today: t,
        active: active.sort((a, b) => a.from.localeCompare(b.from)),
        suggestions: list.filter((x) => x.status === 'suggested').sort((a, b) => b.count - a.count),
        news: { ...news, place: cfg.place, placeHi: cfg.placeHi, off: process.env.NEWS === 'off' },
      }
    }),
  )

  // An alert from staff: { type, disease?, title?, from?, to?, strength? }.
  async function addAlert(b, staff) {
    const type = SIGNAL_TYPES.includes(b.type) ? b.type : bad('type')
    const disease = type === 'outbreak' ? (DISEASES.includes(b.disease) ? b.disease : bad('disease')) : null
    const x = {
      id: `A-${crypto.randomBytes(5).toString('hex')}`,
      source: 'staff',
      status: 'active',
      type,
      disease,
      title: text(b.title, 120),
      ...period(b, type),
      createdBy: staff.username,
      createdAt: Date.now(),
    }
    await store.saveSignal(x)
    audit.log(staff, 'signalAdded', { type, disease, from: x.from, to: x.to, source: 'staff' })
    return x
  }

  router.post('/signals', staffOnly, (req, res) => send(res, async () => ({ signal: await addAlert(req.body || {}, req.staff) })))

  router.post('/signals/news', staffOnly, (req, res) => send(res, async () => ({ news: await readNews() })))

  router.post('/signals/:id/accept', staffOnly, (req, res) =>
    send(res, async () => {
      const s = (await all()).find((x) => x.id === req.params.id && x.status === 'suggested') || bad('Suggestion not found')
      const x = {
        id: `A-${crypto.randomBytes(5).toString('hex')}`,
        source: 'news',
        status: 'active',
        type: s.type,
        disease: s.disease,
        title: text(req.body?.title, 120) || s.headlines[0]?.title.slice(0, 120) || '',
        headlines: s.headlines.slice(0, 3),
        ...period(req.body || {}, s.type),
        createdBy: req.staff.username,
        createdAt: Date.now(),
      }
      await store.saveSignal(x)
      await store.saveSignal({ ...s, status: 'covered', decidedAt: Date.now(), decidedBy: req.staff.username })
      audit.log(req.staff, 'signalAdded', { type: x.type, disease: x.disease, from: x.from, to: x.to, source: 'news' })
      return { signal: x }
    }),
  )

  router.post('/signals/:id/dismiss', staffOnly, (req, res) =>
    send(res, async () => {
      const s = (await all()).find((x) => x.id === req.params.id && x.status === 'suggested') || bad('Suggestion not found')
      await store.saveSignal({ ...s, status: 'dismissed', decidedAt: Date.now(), decidedBy: req.staff.username })
      audit.log(req.staff, 'signalDismissed', { type: s.type, disease: s.disease })
      return { ok: true }
    }),
  )

  router.delete('/signals/:id', staffOnly, (req, res) =>
    send(res, async () => {
      const s = (await all()).find((x) => x.id === req.params.id && x.status === 'active') || bad('Alert not found')
      await store.deleteSignal(s.id)
      audit.log(req.staff, 'signalRemoved', { type: s.type, disease: s.disease })
      return { ok: true }
    }),
  )

  // Alerts in force made by staff (not news or the OPD's own warning).
  async function endStaffAlerts() {
    for (const x of await all()) if (x.status === 'active' && x.source === 'staff') await store.deleteSignal(x.id)
  }

  return { router, forForecast, kindsOn, readNews, addAlert, endStaffAlerts }
}
