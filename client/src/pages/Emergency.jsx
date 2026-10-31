import { useI18n } from '../i18n/index.js'
import { useSettings } from '../lib/settings.js'
import { EMERGENCY, placeById, startPlaces } from '../data/hospital.js'
import { usePageSpeech, useOpenHelp } from '../components/pageSpeech.js'
import { Button, PageTitle, TermNote, Toggle } from '../components/ui.jsx'
import RouteView, { PlacePicker, useRoute } from '../components/Route.jsx'
import { renderStep } from '../lib/directions.js'
import Icon from '../components/Icon.jsx'
import { useHospital } from '../lib/store.js'
import { rupees } from '../lib/billing.js'

// Emergency comes first: no token, no registration, no questions. Where the
// hospital takes a fee for the Emergency slip before the doctor, say so
// plainly, so nobody is caught without it.
export default function Emergency() {
  const state = useHospital()
  const { t } = useI18n()
  const [settings, setSettings] = useSettings()
  const openHelp = useOpenHelp()
  const from = placeById[settings.here] ? settings.here : 'g_entrance'
  const res = useRoute(from, EMERGENCY, settings.avoidStairs)
  const fee = state.emergencyFee || 0
  const before = fee > 0 && state.emergencyPay === 'before'
  const money = before
    ? `${t('emergency.slipBefore')} ${t('emergency.feeBefore', { amount: rupees(fee) })}`
    : `${t('emergency.noToken')} ${t('emergency.noPay')}${fee > 0 ? ` ${t('emergency.feeLater', { amount: rupees(fee) })}` : ''}`

  usePageSpeech(
    [t('emergency.title'), t('emergency.where'), t('emergency.tellStaff'), money, ...(before ? [t('emergency.veryIll')] : []), t('emergency.calls'), ...(res ? res.steps.map((s) => renderStep(s, t)) : [])].join(
      '. ',
    ),
  )

  return (
    <div className="space-y-4">
      <div className="space-y-4 md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start md:gap-6 md:space-y-0">
      <section className="space-y-3 rounded-2xl bg-danger p-5 text-danger-ink">
        <PageTitle>{t('emergency.title')}</PageTitle>
        <p className="-mt-2 font-semibold">{t('emergency.where')}</p>
        <p>{t('emergency.tellStaff')}</p>
        <p className="text-sm">{money}</p>
        {before && <p className="font-semibold">{t('emergency.veryIll')}</p>}
        <Button variant="secondary" size="lg" icon="hand" className="w-full text-danger" onClick={openHelp}>
          {t('urgent.send')}
        </Button>
      </section>

      <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
        <a href="tel:112" className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-danger/50 bg-card px-3 font-bold text-danger no-underline">
          <Icon name="phone" size={22} />
          {t('emergency.call112')}
        </a>
        <a href="tel:108" className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-danger/50 bg-card px-3 font-bold text-danger no-underline">
          <Icon name="ambulance" size={22} />
          {t('emergency.call108')}
        </a>
      </div>
      <p className="text-sm text-ink-2">{t('emergency.calls')}</p>
      </div>
      </div>

      <h2 className="pt-2 text-lg font-semibold">{t('emergency.way')}</h2>
      <div className="space-y-3 rounded-2xl border border-line bg-card p-3 md:grid md:grid-cols-2 md:items-end md:gap-4 md:space-y-0">
        <PlacePicker id="em-from" label={t('find.youAreAt')} value={from} onChange={(v) => setSettings({ here: v })} places={startPlaces} />
        <Toggle bare icon="wheelchair" label={t('settings.avoidStairs')} checked={settings.avoidStairs} onChange={(v) => setSettings({ avoidStairs: v })} />
      </div>
      <RouteView from={from} to={EMERGENCY} avoidStairs={settings.avoidStairs} />
      <TermNote term="casualty" />
    </div>
  )
}
