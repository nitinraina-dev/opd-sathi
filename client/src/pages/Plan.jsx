import { useState } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../i18n/index.js'
import { useHospital, useSimNow } from '../lib/store.js'
import { useSettings } from '../lib/settings.js'
import { useConditions } from '../lib/conditions.js'
import { predictNow, weekAhead, bestHour } from '../lib/predict.js'
import { wxKind, wxIcon, aqiLevel, trafficLabel, trafficAt, travelFactor } from '../lib/model.js'
import { dateKey, minutesOfDay, hm, keyToDate } from '../lib/clock.js'
import { followMoves } from '../lib/queue.js'
import { departments } from '../data/departments.js'
import { usePageSpeech } from '../components/pageSpeech.js'
import { useLearned } from '../lib/learned.js'
import { useSignals } from '../lib/useSignals.js'
import { PageTitle, Card, Notice, LevelChip, Choice } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { NearbySuggestion, NearbyList } from '../components/Nearby.jsx'

export function hourRange(h) {
  return h === 13 ? '13:00–13:30' : `${hm(h * 60)}–${hm((h + 1) * 60)}`
}

export function dayName(key, t, todayKey) {
  if (key === todayKey) return t('common.today')
  const d = keyToDate(key)
  const tomorrow = keyToDate(todayKey)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return t('common.tomorrow')
  return `${t(`days.${d.getDay()}`)} ${d.getDate()} ${t(`months.${d.getMonth()}`)}`
}

// Plain-words advice for patients from today's weather.
export function weatherAdvice(wx, nowWx, t) {
  const out = []
  if ((wx?.rain ?? 0) >= 2 || (nowWx?.rain ?? 0) > 0.5) out.push(['rain', t('plan.advice.rain')])
  if ((wx?.tMax ?? 0) >= 38) out.push(['sun', t('plan.advice.heat')])
  if ((nowWx?.aqi ?? wx?.aqi ?? 0) > 150) out.push(['wind', t('plan.advice.air')])
  if (wx?.tMin != null && wx.tMin <= 10) out.push(['child', t('plan.advice.cold')])
  return out
}

export default function Plan() {
  const { t } = useI18n()
  const state = useHospital()
  const now = useSimNow(30000)
  const [settings] = useSettings()
  const { cond } = useConditions(now)
  const learned = useLearned()
  const { active: signals } = useSignals()
  const me = settings.me && state.patients[settings.me] ? followMoves(state, state.patients[settings.me]) : null
  const [dept, setDept] = useState(me?.dept || 'MED')
  const [trip, setTrip] = useState(30)

  const key = dateKey(now)
  const minute = minutesOfDay(now)
  const pred = cond ? predictNow(state, cond, now, learned, signals) : null
  const week = cond ? weekAhead(cond, key, 7, dept, learned, signals) : []
  const todayBest = pred && pred.sim && !pred.sim.closed && !pred.after ? bestHour(pred.sim, dept, minute) : null
  const nextBest = week
    .slice(1)
    .filter((d) => !d.closed && d.best)
    .sort((a, b) => a.best.score - b.best.score)[0]
  const target = todayBest ? { key, best: todayBest } : nextBest ? { key: nextBest.key, best: nextBest.best } : null
  const tripLevel = target && cond ? trafficAt(cond, target.key, target.best.hour * 60) : 0
  const tripMins = Math.round((trip * travelFactor(tripLevel)) / 5) * 5
  const nowWx = cond?.now
  const advice = cond ? weatherAdvice(cond.daily[key], nowWx, t) : []

  usePageSpeech(
    cond
      ? [
          t('plan.title'),
          t('plan.emergency'),
          todayBest ? t('plan.bestToday', { time: hourRange(todayBest.hour), wait: todayBest.wait }) : '',
          nextBest ? t('plan.bestDay', { day: dayName(nextBest.key, t, key), time: hourRange(nextBest.best.hour) }) : '',
          ...advice.map((a) => a[1]),
        ]
          .filter(Boolean)
          .join('. ')
      : t('common.loading'),
  )

  return (
    <div className="space-y-5">
      <PageTitle sub={t('plan.sub')}>
        {t('plan.title')}
      </PageTitle>
      <Notice kind="danger" title={t('plan.emergency')}>
        <Link to="/emergency" className="font-bold underline">
          {t('plan.emergencyLink')}
        </Link>
      </Notice>

      {!cond && <p className="text-lg">{t('common.loading')}</p>}

      {cond && pred && (
        <div className="space-y-5 md:grid md:grid-cols-2 md:items-start md:gap-8 md:space-y-0">
          <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-lg font-semibold">{t('plan.rightNow')}</h2>
            <ul className="space-y-3 text-lg">
              <li className="flex flex-wrap items-center gap-2">
                <Icon name="users" />
                <LevelChip level={pred.hallCrowd} label={t(`crowdLive.${pred.hallCrowd}`)} />
                <span>{t('plan.peopleWaiting', { n: pred.hallWaiting })}</span>
              </li>
              {nowWx && (
                <li className="flex items-center gap-2">
                  <Icon name={wxIcon[wxKind(nowWx.code)]} />
                  <span>
                    {t(`wx.${wxKind(nowWx.code)}`)}
                    {nowWx.temp != null && `, ${Math.round(nowWx.temp)}°C`}
                  </span>
                </li>
              )}
              {nowWx?.aqi != null && (
                <li className="flex items-center gap-2">
                  <Icon name="wind" />
                  <span>{t(`aqi.${aqiLevel(nowWx.aqi)}`)} (AQI {Math.round(nowWx.aqi)})</span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <Icon name="car" />
                <span>{t('plan.roads', { level: t(`traffic.${trafficLabel(pred.traffic)}`) })}</span>
              </li>
            </ul>
            {advice.length > 0 && (
              <ul className="mt-3 space-y-2">
                {advice.map(([icon, text]) => (
                  <li key={icon} className="flex items-start gap-2 rounded-xl bg-warn-soft p-2 text-lg">
                    <Icon name={icon} />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-base text-ink-2">
              {t(`source.${cond.source}`)} · {cond.traffic ? t('source.trafficLive') : t('source.trafficModel')}
            </p>
          </Card>

          <div>
            <label htmlFor="plan-dept" className="mb-1 block text-sm font-semibold text-ink-2">
              {t('plan.whichDoctor')}
            </label>
            <select
              id="plan-dept"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="w-full rounded-xl border border-line bg-card px-3 min-h-12 text-base font-semibold"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {t(`depts.${d.id}.name`)}
                </option>
              ))}
            </select>
          </div>

          <Card className="border-brand">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <Icon name="star" />
              {t('plan.bestTitle')}
            </h2>
            {todayBest ? (
              <p className="text-xl">{t('plan.bestToday', { time: hourRange(todayBest.hour), wait: todayBest.wait })}</p>
            ) : (
              <p className="text-xl">{pred.closed ? t('plan.closedToday') : t('plan.lateToday')}</p>
            )}
            {nextBest && (
              <p className="mt-2 text-xl">
                {t('plan.bestDay', { day: dayName(nextBest.key, t, key), time: hourRange(nextBest.best.hour) })}
              </p>
            )}
            <p className="mt-2 text-base text-ink-2">{t('plan.hours')}</p>
          </Card>

          {target && (
            <Card>
              <h2 id="trip-h" className="mb-2 text-lg font-semibold">
                {t('plan.tripTitle')}
              </h2>
              <div role="radiogroup" aria-labelledby="trip-h" className="grid gap-2">
                {[15, 30, 60].map((m) => (
                  <Choice key={m} icon="car" title={t('plan.tripMins', { n: m })} selected={trip === m} onSelect={() => setTrip(m)} />
                ))}
              </div>
              <p className="mt-3 text-xl">
                {t('plan.leaveBy', {
                  n: tripMins,
                  time: hm(target.best.hour * 60 - tripMins),
                  arrive: hm(target.best.hour * 60),
                  day: dayName(target.key, t, key),
                  level: t(`traffic.${trafficLabel(tripLevel)}`),
                })}
              </p>
            </Card>
          )}

          <NearbySuggestion state={state} dept={dept} now={now} />
          </div>
          <div className="space-y-5">
          {pred.sim && !pred.sim.closed && !pred.after && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">{t('plan.todayHours')}</h2>
              <ul className="grid gap-2">
                {pred.sim.hours
                  .filter((h) => h.canRegister)
                  .map((h) => (
                    <li key={h.hour} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-card p-3">
                      <span className="w-36 font-mono text-lg font-bold">{hourRange(h.hour)}</span>
                      <LevelChip level={h.crowd} label={t(`crowd.${h.crowd}`)} />
                      <span className="text-lg">{t('plan.waitShort', { n: Math.round(h.waitByDept[dept] / 5) * 5 })}</span>
                      {(h.rain >= 1 || (h.rainProb ?? 0) >= 60) && (
                        <span className="flex items-center gap-1 text-lg">
                          <Icon name="rain" size={22} />
                          {t('plan.rainLikely')}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">{t('plan.week')}</h2>
            <ul className="grid gap-2">
              {week.map((d) => (
                <li key={d.key} className="rounded-2xl border border-line bg-card p-3">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-lg font-bold">{dayName(d.key, t, key)}</span>
                    {d.wx && (
                      <span className="flex items-center gap-1 text-lg">
                        <Icon name={wxIcon[wxKind(d.wx.code)]} size={24} />
                        {t(`wx.${wxKind(d.wx.code)}`)}
                        {d.wx.tMax != null && ` · ${Math.round(d.wx.tMax)}°C`}
                      </span>
                    )}
                  </p>
                  {d.closed ? (
                    <p className="mt-1 text-lg">{t('plan.closedDay')}</p>
                  ) : (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-lg">
                      <LevelChip level={d.peakCrowd} label={t(`crowd.${d.peakCrowd}`)} />
                      {d.best && <span>{t('plan.bestShort', { time: hourRange(d.best.hour) })}</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <p className="text-base text-ink-2">{t('plan.disclaimer')}</p>
          <NearbyList dept={dept} now={now} />
          </div>
        </div>
      )}
    </div>
  )
}
