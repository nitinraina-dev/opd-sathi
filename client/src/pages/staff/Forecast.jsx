import { useEffect, useState } from 'react'
import { useHospital, useSimNow } from '../../lib/store.js'
import { useConditions, useScenario, fetchConditions } from '../../lib/conditions.js'
import { predictNow, simulateDay, weekAhead, staffSuggestions, busyDays, HOURS } from '../../lib/predict.js'
import { factorText, signalName, effectText } from '../../lib/text.js'
import { useSignals } from '../../lib/useSignals.js'
import { BusyDays, LocalAlerts } from './Alerts.jsx'
import { wxKind, wxIcon, aqiLevel, trafficLabel } from '../../lib/model.js'
import { dateKey, minutesOfDay, fmtTime, keyToDate } from '../../lib/clock.js'
import { defaultIntegrations, loadConfig, saveConfig, loadLog, sendTest } from '../../lib/n8n.js'
import { useMode } from '../../lib/store.js'
import { departments } from '../../data/departments.js'
import { round5 } from '../../lib/queue.js'
import { Button, Card, LevelChip, Notice } from '../../components/ui.jsx'
import ColumnChart from '../../components/ColumnChart.jsx'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import { hourRange, dayName } from '../Plan.jsx'
import { useStaffI18n, useCan } from './StaffLayout.jsx'
import { useLearned, loadSampleHistory, clearHistory } from '../../lib/learned.js'

function Tile({ icon, label, value, sub }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-base text-ink-2">
        <Icon name={icon} size={24} />
        {label}
      </p>
      <div className="mt-1 text-2xl font-bold leading-tight">{value}</div>
      {sub && <p className="mt-1 text-base text-ink-2">{sub}</p>}
    </Card>
  )
}

const SCENARIOS = [
  ['rain', 'rain'],
  ['heat', 'sun'],
  ['smog', 'wind'],
  ['cold', 'child'],
  ['jam', 'car'],
]


function Automation({ t }) {
  const { mode, storage } = useMode()
  const [cfg, setCfg] = useState(defaultIntegrations)
  const [log, setLog] = useState([])
  const [msg, setMsg] = useState('')
  useEffect(() => {
    loadConfig()
      .then(setCfg)
      .catch(() => {})
    const on = () =>
      loadLog()
        .then(setLog)
        .catch(() => {})
    on()
    const id = setInterval(on, 5000)
    window.addEventListener('opd-n8n-log', on)
    return () => {
      clearInterval(id)
      window.removeEventListener('opd-n8n-log', on)
    }
  }, [mode])
  const field = (key, label, hint, type = 'url') => (
    <div>
      <label htmlFor={`n8n-${key}`} className="mb-1 block text-lg font-semibold">
        {label}
      </label>
      <input
        id={`n8n-${key}`}
        type={type}
        value={cfg[key] ?? ''}
        onChange={(e) => setCfg({ ...cfg, [key]: type === 'number' ? e.target.value : e.target.value.trim() })}
        aria-describedby={`n8n-${key}-hint`}
        className="w-full rounded-xl border border-line bg-card px-3 min-h-12 text-lg"
        placeholder={type === 'url' ? 'https://your-n8n/webhook/…' : ''}
        step="any"
      />
      <p id={`n8n-${key}-hint`} className="mt-1 text-base text-ink-2">
        {hint}
      </p>
    </div>
  )
  return (
    <Card className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="bolt" />
        {t('n8n.title')}
      </h2>
      <p className="text-lg">{t('n8n.intro')}</p>
      <p className="flex items-center gap-2 text-base font-semibold">
        <Icon name="info" size={22} />
        {mode === 'server' ? t('n8n.serverMode', { storage }) : t('n8n.localMode')}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {field('eventsUrl', t('n8n.events'), t('n8n.eventsHint'))}
        {field('feedUrl', t('n8n.feed'), t('n8n.feedHint'))}
        {field('lat', t('n8n.lat'), t('n8n.latHint'), 'number')}
        {field('lon', t('n8n.lon'), t('n8n.latHint'), 'number')}
        {field('place', t('n8n.place'), t('n8n.placeHint'))}
        {field('placeHi', t('n8n.placeHi'), t('n8n.placeHint'))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          icon="check"
          onClick={async () => {
            try {
              setCfg(await saveConfig({ ...cfg, lat: Number(cfg.lat) || 0, lon: Number(cfg.lon) || 0 }))
              setMsg(t('common.saved'))
            } catch {
              setMsg(t('n8n.saveFailed'))
            }
          }}
        >
          {t('common.save')}
        </Button>
        <Button
          variant="secondary"
          icon="bolt"
          onClick={async () => {
            const r = await sendTest().catch(() => 'error')
            setMsg(t(`n8n.result.${r}`))
          }}
        >
          {t('n8n.testEvent')}
        </Button>
        <Button
          variant="secondary"
          icon="refresh"
          onClick={async () => {
            const c = await fetchConditions({ force: true })
            setMsg(t(`source.${c.source}`))
          }}
        >
          {t('n8n.testFeed')}
        </Button>
      </div>
      <p role="status" className="min-h-7 text-lg font-semibold">
        {msg}
      </p>
      <h3 className="text-xl font-bold">{t('n8n.log')}</h3>
      {log.length === 0 ? (
        <p className="text-base text-ink-2">{t('n8n.logEmpty')}</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto text-base">
          {log.map((l, i) => (
            <li key={i} className="flex flex-wrap gap-x-3 border-b border-line py-1">
              <span className="tabular-nums text-ink-2">{fmtTime(l.at)}</span>
              <span className="font-mono">{l.type}</span>
              <span className="flex items-center gap-1">
                <Icon name={l.status === 'sent' ? 'check' : l.status === 'off' ? 'minus' : 'alert'} size={18} />
                {t(`n8n.status.${l.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const signed = (m) => `${m >= 1 ? '+' : '−'}${Math.abs(Math.round((m - 1) * 100))}%`

function LearnedSummary({ learned, t }) {
  const busiest = [1, 2, 3, 4, 5, 6].reduce((a, b) => (learned.weekday[b] > learned.weekday[a] ? b : a), 1)
  const peak = Object.entries(learned.hourShare).reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  return (
    <ul className="space-y-1 text-lg">
      <li className="flex items-start gap-2">
        <Icon name="calendar" size={24} />
        {t('learn.busiest', { day: t(`days.${busiest}`), pct: signed(learned.weekday[busiest]) })}
      </li>
      <li className="flex items-start gap-2">
        <Icon name="clock" size={24} />
        {t('learn.peak', { time: `${String(peak).padStart(2, '0')}:00` })}
      </li>
      {Object.entries(learned.weatherDays || {})
        .filter(([, n]) => n > 0)
        .map(([k, n]) => (
          <li key={k} className="flex items-start gap-2">
            <Icon name={k === 'heat' ? 'sun' : 'rain'} size={24} />
            {t(`learn.wx.${k}`, { pct: signed(learned.weather[k]), n })}
          </li>
        ))}
      {Object.entries(learned.signals || {})
        .filter(([, x]) => x.days > 0)
        .map(([kind, x]) => {
          const [type, disease] = kind.split(':')
          return (
            <li key={kind} className="flex items-start gap-2">
              <Icon name="alert" size={24} />
              {t('learn.sig', { what: signalName({ type, disease }, t), effect: effectText(x, t), n: x.days })}
            </li>
          )
        })}
      {!learned.withWeather && (
        <li className="flex items-start gap-2">
          <Icon name="info" size={24} />
          {t('learn.noWeather')}
        </li>
      )}
    </ul>
  )
}

function Learning({ learned, t, allowed, mode }) {
  const [msg, setMsg] = useState('')
  const run = async (fn, done) => {
    try {
      await fn()
      window.dispatchEvent(new Event('opd-learned'))
      setMsg(done)
    } catch (err) {
      setMsg(err.message)
    }
  }
  return (
    <Card className="space-y-2 p-4">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Icon name="star" />
        {t('learn.title')}
      </h2>
      <p className="text-lg">
        {mode !== 'server'
          ? t('learn.needsServer')
          : learned
            ? t(learned.sampleDays === learned.days ? 'learn.fromSample' : learned.sampleDays ? 'learn.fromMixed' : 'learn.fromDays', {
                n: learned.days,
                s: learned.sampleDays,
              })
            : t('learn.none')}
      </p>
      {learned && <LearnedSummary learned={learned} t={t} />}
      <p className="text-base text-ink-2">{t('learn.how')}</p>
      {mode === 'server' && allowed('demo') && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="calendar" onClick={() => run(loadSampleHistory, t('learn.loaded'))}>
            {t('learn.loadSample')}
          </Button>
          <Button variant="secondary" icon="close" onClick={() => run(clearHistory, t('learn.cleared'))}>
            {t('learn.clear')}
          </Button>
        </div>
      )}
      <p role="status" className="text-base font-semibold">
        {msg}
      </p>
    </Card>
  )
}

export default function Forecast() {
  const { t, lang } = useStaffI18n()
  const state = useHospital()
  const now = useSimNow(10000)
  const { cond, loading, refresh } = useConditions(now)
  const [scenario, setScenario] = useScenario()
  const learned = useLearned()
  const allowed = useCan()
  const { mode } = useMode()
  const sig = useSignals()

  if (!cond) return <p className="text-lg">{t('common.loading')}</p>

  const key = dateKey(now)
  const minute = minutesOfDay(now)
  const signals = sig.active
  const pred = predictNow(state, cond, now, learned, signals)
  const day = simulateDay(key, cond, { learned, signals })
  const week = weekAhead(cond, key, 7, null, learned, signals)
  const tips = staffSuggestions(day, cond, key, signals)
  const busy = busyDays(week, learned)
  const curHour = Math.floor(minute / 60)
  const nowWx = cond.now || {}
  const kind = wxKind(nowWx.code)
  const liveHours = new Map((pred.sim?.hours || []).map((h) => [h.hour, h]))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t('forecast.title')}</h1>
        <Button variant="secondary" icon="refresh" onClick={refresh} disabled={loading} className="ml-auto">
          {loading ? t('common.loading') : t('forecast.refresh')}
        </Button>
      </div>
      <p className="text-lg text-ink-2">{t('forecast.intro')}</p>
      <ScreenGuide id="forecast" items={['read', 'alerts', 'whatIf']} t={t} />
      <p className="flex flex-wrap items-center gap-2 text-base text-ink-2">
        <Icon name="info" size={22} />
        {t(`source.${cond.source}`)} · {cond.traffic ? t('source.trafficLive') : t('source.trafficModel')} ·{' '}
        {t('forecast.updated', { time: fmtTime(cond.fetchedAt) })}
      </p>

      <BusyDays days={busy} todayKey={key} t={t} />
      {mode === 'server' ? (
        <LocalAlerts sig={sig} learned={learned} todayKey={key} t={t} allowed={allowed} />
      ) : (
        <Notice kind="info">{t('signals.needsServer')}</Notice>
      )}

      <Card className="space-y-2 p-4">
        <h2 className="text-xl font-bold">{t('forecast.whatIf')}</h2>
        <p className="text-base text-ink-2">{t('forecast.whatIfHint')}</p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map(([k, icon]) => (
            <button
              key={k}
              type="button"
              aria-pressed={!!scenario[k]}
              onClick={() => setScenario({ [k]: !scenario[k] })}
              className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 font-semibold ${
                scenario[k] ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-card'
              }`}
            >
              <Icon name={scenario[k] ? 'check' : icon} />
              {t(`forecast.sc.${k}`)}
            </button>
          ))}
        </div>
      </Card>

      <h2 className="text-lg font-semibold">{t('forecast.now')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          icon="users"
          label={t('forecast.crowdNow')}
          value={<LevelChip level={pred.hallCrowd} label={t(`crowdLive.${pred.hallCrowd}`)} />}
          sub={t('plan.peopleWaiting', { n: pred.hallWaiting })}
        />
        <Tile
          icon="register"
          label={t('forecast.nextHour')}
          value={pred.nextHour != null ? t('forecast.patients', { n: pred.nextHour }) : t('forecast.closedNow')}
          sub={t('forecast.nextHourSub')}
        />
        <Tile
          icon="doctor"
          label={t('forecast.lateRisk')}
          value={pred.lateRisk ? t(`forecast.risk.${pred.lateRisk}`) : '—'}
          sub={t('forecast.lateRiskSub')}
        />
        <Tile
          icon={wxIcon[kind]}
          label={t('forecast.weather')}
          value={`${t(`wx.${kind}`)}${nowWx.temp != null ? `, ${Math.round(nowWx.temp)}°C` : ''}`}
          sub={nowWx.rain ? t('forecast.rainNow', { mm: nowWx.rain }) : null}
        />
        <Tile
          icon="wind"
          label={t('forecast.air')}
          value={nowWx.aqi != null ? `AQI ${Math.round(nowWx.aqi)}` : '—'}
          sub={t(`aqi.${aqiLevel(nowWx.aqi)}`)}
        />
        <Tile icon="car" label={t('forecast.roads')} value={t(`traffic.${trafficLabel(pred.traffic)}`)} sub={t('forecast.roadsSub')} />
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-xl font-bold">{t('forecast.waitNow')}</h2>
        {/* Phones: one block per department; wider screens: a table. */}
        <ul className="divide-y divide-line sm:hidden">
          {departments.map((d) => (
            <li key={d.id} className="py-2">
              <p className="font-semibold">{t(`depts.${d.id}.name`)}</p>
              <dl className="mt-1 grid grid-cols-3 gap-2">
                {[
                  [t('staff.waiting'), pred.waiting[d.id]],
                  [t('forecast.newWait'), t('common.minutes', { n: pred.waitNow[d.id] })],
                  [t('forecast.todayTotal'), day.closed ? '—' : Math.round(day.byDept[d.id])],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-sm leading-tight text-ink-2">{k}</dt>
                    <dd className="tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <table className="hidden w-full text-left text-lg sm:table">
          <thead>
            <tr className="border-b-2 border-line text-base text-ink-2">
              <th className="py-1 pr-2">{t('forecast.dept')}</th>
              <th className="py-1 pr-2">{t('staff.waiting')}</th>
              <th className="py-1 pr-2">{t('forecast.newWait')}</th>
              <th className="py-1">{t('forecast.todayTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id} className="border-b border-line">
                <td className="py-1 pr-2">{t(`depts.${d.id}.name`)}</td>
                <td className="py-1 pr-2 tabular-nums">{pred.waiting[d.id]}</td>
                <td className="py-1 pr-2 tabular-nums">{t('common.minutes', { n: pred.waitNow[d.id] })}</td>
                <td className="py-1 tabular-nums">{day.closed ? '—' : Math.round(day.byDept[d.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {day.closed ? (
        <Notice kind="info" title={t('factors.closed')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <ColumnChart
              t={t}
              title={t('forecast.chartArrivals')}
              valueLabel={t('forecast.patientsUnit')}
              highlight={HOURS.indexOf(curHour)}
              highlightLabel={t('forecast.thisHour')}
              data={day.hours.map((h) => ({
                label: hourRange(h.hour).split('–')[0],
                sub: h.rain >= 1 ? t('forecast.rainy') : '',
                value: h.arrivals,
                tip: `${t(`crowd.${h.crowd}`)} · ${t(`traffic.${trafficLabel(h.traffic)}`)}`,
              }))}
            />
          </Card>
          <Card>
            <ColumnChart
              t={t}
              title={t('forecast.chartWait')}
              valueLabel={t('forecast.minutesUnit')}
              highlight={HOURS.indexOf(curHour)}
              highlightLabel={t('forecast.waitNote')}
              data={day.hours
                .filter((h) => h.canRegister)
                .map((h) => {
                  const live = liveHours.get(h.hour)
                  return {
                    label: hourRange(h.hour).split('–')[0],
                    value: round5((live || h).wait),
                    tip: live ? t('forecast.fromQueue') : t('forecast.fromModel'),
                  }
                })}
            />
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="text-xl font-bold">{t('forecast.why')}</h2>
          <ul className="space-y-1 text-lg">
            {day.factors.map((f, i) => (
              <li key={`${f.key}-${i}`} className="flex items-start gap-2">
                <Icon name={f.pct > 0 ? 'plus' : f.pct < 0 ? 'minus' : 'dot'} size={22} className="mt-1" />
                {factorText(f, t)}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-2">
          <h2 className="text-xl font-bold">{t('forecast.todo')}</h2>
          <ul className="space-y-2 text-lg">
            {tips.map((s, i) => (
              <li key={i} className={`flex items-start gap-2 rounded-xl p-2 ${s.level === 'warn' ? 'bg-warn-soft' : 'bg-brand-soft'}`}>
                <Icon name={s.icon} size={26} />
                <span>
                  {t(`suggest.${s.key}`, {
                    dept: s.dept ? t(`depts.${s.dept}.name`) : '',
                    disease: s.disease ? t(`signals.disease.${s.disease}`) : '',
                    time: s.hour != null ? hourRange(s.hour).split('–')[0] : '',
                    t: s.t,
                    aqi: s.aqi,
                    n: s.mins,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <ColumnChart
          t={t}
          title={t('forecast.chartWeek')}
          valueLabel={t('forecast.patientsUnit')}
          highlight={0}
          highlightLabel={t('forecast.weekNote')}
          data={week.map((d) => ({
            label: t(`days.${keyToDate(d.key).getDay()}`),
            sub: d.closed ? t('forecast.closed') : d.wx?.tMax != null ? `${Math.round(d.wx.tMax)}°C` : '',
            value: d.total,
            tip: [
              dayName(d.key, t, key),
              d.wx ? t(`wx.${wxKind(d.wx.code)}`) : '',
              d.closed ? t('factors.closed') : d.sim.factors.map((f) => factorText(f, t)).join('; '),
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />
      </Card>

      <Learning learned={learned} t={t} allowed={allowed} mode={mode} />

      {allowed('automation') ? <Automation t={t} lang={lang} /> : <Notice kind="info">{t('n8n.adminOnly')}</Notice>}
    </div>
  )
}
