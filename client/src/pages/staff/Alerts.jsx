import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useConditions } from '../../lib/conditions.js'
import { useLearned } from '../../lib/learned.js'
import { useSignals } from '../../lib/useSignals.js'
import { weekAhead, busyDays } from '../../lib/predict.js'
import { SIGNAL_TYPES, DISEASES, DEFAULT_DAYS, TYPE_ICON } from '../../data/signals.js'
import { effectFor } from '../../lib/signals.js'
import { factorText, signalName, effectText } from '../../lib/text.js'
import { plural } from '../../i18n/index.js'
import { addDays, dateKey, fmtTime, keyToDate } from '../../lib/clock.js'
import { addSignal, acceptSuggestion, dismissSuggestion, endSignal, checkNews } from '../../lib/useSignals.js'
import { Button, Card, LevelChip, Notice, Segmented } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import { dayName } from '../Plan.jsx'

const CHIP = { veryBusy: 'veryHigh', busy: 'high', normal: 'low', quiet: 'low', closed: 'low' }
const input = 'w-full rounded-xl border border-line bg-card px-3 min-h-12 text-base'
const label = 'mb-1 block text-sm font-semibold text-ink-2'

const shortDate = (key, t) => {
  const d = keyToDate(key)
  return `${d.getDate()} ${t(`months.${d.getMonth()}`)}`
}
const dates = (x, t) => (x.from === x.to ? shortDate(x.from, t) : `${shortDate(x.from, t)} – ${shortDate(x.to, t)}`)

// On the Dashboard: a very busy day coming in the next 3 days, and why.
export function BusyBanner({ now, t }) {
  const { cond } = useConditions(now)
  const learned = useLearned()
  const { active } = useSignals()
  const key = dateKey(now)
  const minute = Math.floor(now / 60000)
  const day = useMemo(
    () => (cond ? busyDays(weekAhead(cond, key, 3, null, learned, active), learned).find((d) => d.level === 'veryBusy') : null),
    [cond, key, minute, learned, active], // eslint-disable-line react-hooks/exhaustive-deps
  )
  if (!day) return null
  return (
    <Notice kind="warn" icon="calendar" title={t('busy.banner', { day: dayName(day.key, t, key), n: day.total, pct: `+${day.pct}%` })}>
      {day.reasons.length > 0 && <p>{day.reasons.map((f) => factorText(f, t)).join(' · ')}</p>}
      <Link to="/staff/forecast" className="mt-1 inline-block font-semibold underline">
        {t('busy.see')}
      </Link>
    </Notice>
  )
}

// The week ahead against a usual day here, with the main reasons.
export function BusyDays({ days, todayKey, t }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Icon name="calendar" />
        {t('busy.title')}
      </h2>
      <p className="text-base text-ink-2">{t('busy.intro', { n: days[0]?.usual ?? 0 })}</p>
      <ul className="divide-y divide-line">
        {days.map((d) => (
          <li key={d.key} className={`flex flex-wrap items-start gap-x-4 gap-y-1 py-2 ${d.level === 'veryBusy' ? 'bg-danger-soft/40' : ''}`}>
            <span className="w-32 shrink-0 font-semibold">{dayName(d.key, t, todayKey)}</span>
            <LevelChip level={CHIP[d.level]} label={t(`busy.level.${d.level}`)} className="shrink-0" />
            {!d.closed && (
              <span className="min-w-[min(100%,14rem)] flex-1">
                <span className="block">{t('busy.patients', { n: d.total, pct: `${d.pct > 0 ? '+' : d.pct < 0 ? '−' : '±'}${Math.abs(d.pct)}%` })}</span>
                {d.reasons.length > 0 && <span className="block text-sm text-ink-2">{d.reasons.map((f) => factorText(f, t)).join(' · ')}</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function AddAlert({ t, todayKey, preset, onDone }) {
  const [f, setF] = useState({ type: 'outbreak', disease: 'dengue', title: '', strength: 'medium', ...preset })
  const [from, setFrom] = useState(todayKey)
  const [to, setTo] = useState(addDays(todayKey, DEFAULT_DAYS[f.type] - 1))
  const [err, setErr] = useState('')
  const set = (patch) => {
    const next = { ...f, ...patch }
    if (patch.type) setTo(addDays(from, DEFAULT_DAYS[patch.type] - 1))
    setF(next)
  }
  const submit = async (e) => {
    e.preventDefault()
    try {
      await addSignal({ ...f, disease: f.type === 'outbreak' ? f.disease : undefined, from, to })
      onDone()
    } catch (e2) {
      setErr(e2.message)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-page p-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sig-type" className={label}>
            {t('signals.form.type')}
          </label>
          <select id="sig-type" className={input} value={f.type} onChange={(e) => set({ type: e.target.value })}>
            {SIGNAL_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`signals.type.${x}`)}
              </option>
            ))}
          </select>
        </div>
        {f.type === 'outbreak' && (
          <div>
            <label htmlFor="sig-disease" className={label}>
              {t('signals.form.disease')}
            </label>
            <select id="sig-disease" className={input} value={f.disease} onChange={(e) => set({ disease: e.target.value })}>
              {DISEASES.map((x) => (
                <option key={x} value={x}>
                  {t(`signals.disease.${x}`)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="sig-title" className={label}>
            {t('signals.form.note')}
          </label>
          <input id="sig-title" className={input} value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div>
          <label htmlFor="sig-from" className={label}>
            {t('signals.form.from')}
          </label>
          <input id="sig-from" type="date" className={input} value={from} min={todayKey} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sig-to" className={label}>
            {t('signals.form.to')}
          </label>
          <input id="sig-to" type="date" className={input} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <Segmented
        label={t('signals.form.strength')}
        value={f.strength}
        onChange={(v) => set({ strength: v })}
        options={['small', 'medium', 'large'].map((v) => ({ value: v, label: t(`signals.strength.${v}`) }))}
      />
      <p className="text-sm text-ink-2">{t('signals.form.expect', { effect: effectText(effectFor(f), t) })}</p>
      {err && (
        <Notice kind="danger" live>
          {err}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon="check">
          {t('signals.form.add')}
        </Button>
        <Button variant="ghost" onClick={() => onDone()}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

// Alerts in force, the OPD's own warning, and news suggestions.
export function LocalAlerts({ sig, learned, todayKey, t, allowed }) {
  const [adding, setAdding] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const may = allowed('signals')
  const run = async (fn) => {
    setErr('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  const news = sig.news

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 text-xl font-bold">
          <Icon name="alert" />
          {t('signals.title')}
        </h2>
        {may && !adding && (
          <Button icon="plus" onClick={() => setAdding({})}>
            {t('signals.add')}
          </Button>
        )}
      </div>
      <p className="text-base text-ink-2">{t('signals.intro')}</p>
      {adding && <AddAlert t={t} todayKey={todayKey} preset={adding} onDone={() => setAdding(null)} />}

      {!sig.active.length ? (
        <p className="text-base text-ink-2">{t('signals.none')}</p>
      ) : (
        <ul className="space-y-2">
          {sig.active.map((x) => (
            <li key={x.id} className={`rounded-xl border p-3 ${x.source === 'opd' ? 'border-warn bg-warn-soft' : 'border-line'}`}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <Icon name={x.source === 'opd' ? 'users' : TYPE_ICON[x.type]} size={22} className="mt-0.5 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {x.source === 'opd' ? t('signals.trend', { dept: t(`depts.${x.dept}.name`), pct: x.pct }) : signalName(x, t)}
                    <span className="font-normal text-ink-2"> · {dates(x, t)}</span>
                  </p>
                  {x.title && <p className="text-sm">{x.title}</p>}
                  <p className="text-sm text-ink-2">
                    {t('signals.expect', { effect: effectText(effectFor(x, learned), t) })} · {t(`signals.source.${x.source}`, { who: x.createdBy || '' })}
                  </p>
                  {x.source === 'opd' && <p className="mt-1 text-sm">{t('signals.trendAsk')}</p>}
                </div>
                {may && x.source !== 'opd' && (
                  <Button variant="ghost" size="sm" icon="close" disabled={busy} onClick={() => run(() => endSignal(x.id))}>
                    {t('signals.end')}
                  </Button>
                )}
                {may && x.source === 'opd' && !adding && (
                  <Button variant="secondary" size="sm" icon="plus" onClick={() => setAdding({ type: 'outbreak' })}>
                    {t('signals.addOutbreak')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-2 border-t border-line pt-3" aria-labelledby="news-h">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="news-h" className="flex flex-1 items-center gap-2 text-lg font-semibold">
            <Icon name="sms" size={22} />
            {t('signals.newsTitle', { place: [news?.place, news?.placeHi].filter(Boolean).join(' / ') })}
          </h3>
          {may && (
            <Button variant="secondary" size="sm" icon="refresh" disabled={busy} onClick={() => run(checkNews)}>
              {t('signals.checkNews')}
            </Button>
          )}
        </div>
        <p className="text-sm text-ink-2">
          {news?.off
            ? t('signals.newsOff')
            : !news?.at
              ? t('signals.newsNotYet')
              : news.ok
                ? t('signals.newsOk', { time: fmtTime(news.at), n: news.found })
                : t('signals.newsFailed', { time: fmtTime(news.at) })}{' '}
          {t('signals.newsPrivacy')}
        </p>
        {sig.suggestions.map((s) => (
          <div key={s.id} className="space-y-2 rounded-xl border border-line p-3">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <Icon name={TYPE_ICON[s.type]} size={20} className="text-brand" />
              {signalName(s, t)}
              <span className="font-normal text-ink-2">{plural(t, 'signals.reports', s.count)}</span>
            </p>
            <ul className="space-y-1 text-sm">
              {s.headlines.slice(0, 3).map((h) => (
                <li key={h.link}>
                  <a href={h.link} target="_blank" rel="noreferrer noopener" className="underline">
                    {h.title}
                  </a>
                  {h.publisher && <span className="text-ink-2"> · {h.publisher}</span>}
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-2">
              {t('signals.ifAdded', { effect: effectText(effectFor(s, learned), t), until: shortDate(addDays(todayKey, DEFAULT_DAYS[s.type] - 1), t) })}
            </p>
            {may && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon="check" disabled={busy} onClick={() => run(() => acceptSuggestion(s.id))}>
                  {t('signals.accept')}
                </Button>
                <Button variant="ghost" size="sm" icon="close" disabled={busy} onClick={() => run(() => dismissSuggestion(s.id))}>
                  {t('signals.ignore')}
                </Button>
              </div>
            )}
          </div>
        ))}
      </section>
      {err && (
        <Notice kind="danger" live>
          {err}
        </Notice>
      )}
    </Card>
  )
}
