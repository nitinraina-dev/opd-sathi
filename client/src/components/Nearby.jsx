import { useI18n } from '../i18n/index.js'
import { NEARBY } from '../data/nearby.js'
import { nearbyFor, loadShare } from '../lib/nearby.js'
import { waitText } from '../lib/text.js'
import { Card, Notice } from './ui.jsx'
import Icon from './Icon.jsx'

// Patients: when it is very busy here, a nearby hospital with a shorter wait
// for the same doctor (OPD only, never for an emergency).
export function NearbySuggestion({ state, dept, now }) {
  const { t } = useI18n()
  const share = loadShare(state, dept, now)
  if (!share) return null
  const { here, best } = share
  return (
    <Notice kind="info" icon="map" title={t('nearby.busyHere', { dept: t(`depts.${dept}.name`), wait: waitText(here, t) })}>
      <p>
        {t('nearby.option', { name: t(`nearby.${best.id}`), wait: waitText(best.wait, t), km: best.km, road: best.roadMins })}
      </p>
      <p className="mt-1 text-sm">{t('nearby.onlyOpd')}</p>
    </Notice>
  )
}

// Plan your visit: every nearby hospital with this doctor, and its wait now.
export function NearbyList({ dept, now }) {
  const { t } = useI18n()
  const list = nearbyFor(dept, now)
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t('nearby.title')}</h2>
      {!list.length ? (
        <p className="text-ink-2">{t('nearby.none', { dept: t(`depts.${dept}.name`) })}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {list.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-4 py-3">
              <Icon name="opd" size={22} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t(`nearby.${h.id}`)}</span>
                <span className="block text-sm text-ink-2">{t('nearby.distance', { km: h.km, road: h.roadMins })}</span>
              </span>
              <span className="text-right text-sm">{t('nearby.waitNow', { wait: waitText(h.wait, t) })}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-2">{t('nearby.sample')}</p>
    </section>
  )
}

// Staff: how busy the nearby hospitals are, and whether patients see them.
export function NearbyStaff({ state, now, t, canSet, onToggle }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 text-lg font-semibold">
          <Icon name="map" />
          {t('nearby.staffTitle')}
        </h2>
        {canSet && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-5 w-5" checked={state.shareLoad !== false} onChange={(e) => onToggle(e.target.checked)} />
            {t('nearby.share')}
          </label>
        )}
      </div>
      <p className="text-sm text-ink-2">{t('nearby.staffHint')}</p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {NEARBY.map((h) => {
          const wait = nearbyFor(h.depts[0], now).find((x) => x.id === h.id)?.wait
          return (
            <li key={h.id} className="rounded-xl border border-line p-3">
              <p className="font-semibold">{t(`nearby.${h.id}`)}</p>
              <p className="text-sm text-ink-2">{t('nearby.distance', { km: h.km, road: h.roadMins })}</p>
              <p className="text-sm">{wait == null ? t('nearby.closed') : t('nearby.waitNow', { wait: waitText(wait, t) })}</p>
              <p className="text-xs text-ink-2">{h.depts.map((d) => t(`depts.${d}.name`)).join(', ')}</p>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-ink-2">{t('nearby.sample')}</p>
    </Card>
  )
}
