import { useState } from 'react'
import { useHospital } from '../../lib/store.js'
import { recordEmergency, setEmergencyFee } from '../../lib/actions.js'
import { autoFreeReason, billSummary, receiptsOf, rupees } from '../../lib/billing.js'
import { patientName } from '../../lib/text.js'
import { fmtTime } from '../../lib/clock.js'
import { FREE_CARDS } from '../../data/fees.js'
import { Button, Card, Notice } from '../../components/ui.jsx'
import { ReceiptCard } from '../../components/Payment.jsx'
import BillChip from '../../components/BillChip.jsx'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import PayButtons from './PayButtons.jsx'
import { useStaffI18n, useCan } from './StaffLayout.jsx'

const pill = (on) =>
  `flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 font-semibold ${
    on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-card hover:border-brand'
  }`
const input = 'w-full rounded-xl border border-line bg-card px-3 min-h-12 text-base'
const empty = { name: '', age: '', gender: '', fee: 'later', card: 'bpl' }

// Admin: what this hospital charges for an Emergency visit (0 = free).
export function EmergencyFee({ state, t }) {
  const [v, setV] = useState(String(state.emergencyFee || 0))
  const [msg, setMsg] = useState('')
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="emergency" />
        {t('emr.feeTitle')}
      </h2>
      <p className="text-base text-ink-2">{t('emr.feeHint')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="emr-fee" className="mb-1 block text-sm font-semibold text-ink-2">
            {t('emr.feeLabel')}
          </label>
          <input id="emr-fee" inputMode="numeric" className={`${input} w-32`} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </div>
        <Button
          icon="check"
          onClick={async () => {
            await setEmergencyFee(Math.min(5000, Number(v) || 0))
            setMsg(t('common.saved'))
          }}
        >
          {t('common.save')}
        </Button>
      </div>
      {msg && (
        <p role="status" className="font-semibold">
          {msg}
        </p>
      )}
    </Card>
  )
}

// The Emergency (Casualty) desk: record a visit once care has started, and
// settle its bill afterwards. Care never waits for any of this.
export default function EmergencyDesk() {
  const { t, lang } = useStaffI18n()
  const state = useHospital()
  const allowed = useCan()
  const [f, setF] = useState(empty)
  const [last, setLast] = useState(null)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const fee = state.emergencyFee || 0
  const age = f.age === '' ? null : Number(f.age)
  const free = fee ? autoFreeReason({ age }) : null
  const visits = Object.values(state.patients)
    .filter((p) => p.kind === 'emergency')
    .sort((a, b) => b.createdAt - a.createdAt)
  const lastP = last && state.patients[last]

  const submit = async (e) => {
    e.preventDefault()
    const p = await recordEmergency({
      name: f.name.trim(),
      age: f.age === '' ? null : age,
      gender: f.gender,
      lang,
      paidCash: !free && f.fee === 'cash',
      card: f.fee === 'card' ? f.card : '',
      cardOk: f.fee === 'card',
    }).catch(() => null)
    if (p) {
      setLast(p.id)
      setF(empty)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Icon name="emergency" size={32} className="text-danger" />
        {t('emr.title')}
      </h1>
      <Notice kind="danger" icon="emergency" title={t('emr.careFirst')}>
        {t('emr.careFirstBody')}
      </Notice>
      <ScreenGuide id="emergency" items={['record', 'fee']} t={t} />

      {lastP && (
        <Notice kind="ok" icon="check" title={t('emr.recorded', { token: lastP.token })}>
          <BillChip bill={billSummary(lastP)} t={t} />
        </Notice>
      )}
      {lastP && receiptsOf(lastP).map((r) => <ReceiptCard key={r.receipt} r={r} p={lastP} lang={lang} />)}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{t('emr.recordTitle')}</h2>
          <p className="text-base text-ink-2">{t('emr.recordHint')}</p>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label htmlFor="emr-name" className="mb-1 block text-sm font-semibold text-ink-2">
                {t('emr.name')}
              </label>
              <input id="emr-name" className={input} value={f.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="emr-age" className="mb-1 block text-sm font-semibold text-ink-2">
                {t('emr.age')}
              </label>
              <input id="emr-age" inputMode="numeric" className={input} value={f.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['f', 'm', 'x'].map((g) => (
              <button key={g} type="button" aria-pressed={f.gender === g} onClick={() => set({ gender: f.gender === g ? '' : g })} className={pill(f.gender === g)}>
                {t(`gender.${g}`)}
              </button>
            ))}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 font-semibold">{fee ? t('emr.feeIs', { amount: rupees(fee) }) : t('emr.noFee')}</legend>
            {fee > 0 &&
              (free ? (
                <p className="flex items-center gap-2">
                  <Icon name="check" />
                  {t('counter.free', { reason: t(`pay.free.${free}`) })}
                </p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      ['later', 'clock'],
                      ['cash', 'rupee'],
                      ['card', 'badge'],
                    ].map(([k, icon]) => (
                      <button key={k} type="button" aria-pressed={f.fee === k} onClick={() => set({ fee: k })} className={pill(f.fee === k)}>
                        <Icon name={icon} />
                        {t(`counter.fee.${k}`)}
                      </button>
                    ))}
                  </div>
                  {f.fee === 'card' && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {FREE_CARDS.map((c) => (
                        <button key={c} type="button" aria-pressed={f.card === c} onClick={() => set({ card: c })} className={pill(f.card === c)}>
                          <Icon name="badge" />
                          {t(`cards.${c}`)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ))}
          </fieldset>
          <Button type="submit" icon="check" className="w-full" disabled={!allowed('recordEmergency')}>
            {t('emr.record')}
          </Button>
        </Card>
      </form>

      <section className="space-y-2" aria-labelledby="emr-today">
        <h2 id="emr-today" className="text-lg font-semibold">
          {t('emr.today', { n: visits.length })}
        </h2>
        {!visits.length && <p className="text-ink-2">{t('emr.none')}</p>}
        <ul className="space-y-2">
          {visits.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-card p-3">
              <span className="font-mono text-lg font-bold">{p.token}</span>
              <span>
                {patientName(p, lang) || t('emr.unknown')}
                {p.age != null && `, ${p.age}`}
              </span>
              <span className="text-sm text-ink-2">{fmtTime(p.createdAt)}</span>
              <BillChip bill={billSummary(p)} t={t} />
              <span className="ml-auto flex flex-wrap gap-2">
                <PayButtons p={p} t={t} allowed={allowed} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {allowed('setEmergencyFee') && <EmergencyFee state={state} t={t} />}
    </div>
  )
}
