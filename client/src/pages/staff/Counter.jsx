import { useState } from 'react'
import { useHospital, useSimNow } from '../../lib/store.js'
import { registerPatient, checkIn, reportsReady } from '../../lib/actions.js'
import { joinKind, reportsState } from '../../lib/queue.js'
import { useCheckInCode } from '../../lib/checkin.js'
import { patientName } from '../../lib/text.js'
import { billSummary } from '../../lib/billing.js'
import BillChip from '../../components/BillChip.jsx'
import PayButtons from './PayButtons.jsx'
import { translate, LANGS } from '../../i18n/index.js'
import { departments } from '../../data/departments.js'
import { digitsOnly } from '../../lib/speech.js'
import SlipCard, { slipInfo, saveSlip } from '../../components/Slip.jsx'
import { Button, Card } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import { useStaffI18n, useCan } from './StaffLayout.jsx'
import { ReceiptCard } from '../../components/Payment.jsx'
import { autoFreeReason, receiptsOf, rupees } from '../../lib/billing.js'
import { OPD_FEE, FREE_CARDS } from '../../data/fees.js'

const empty = { name: '', age: '', gender: '', dept: '', mobile: '', assisted: false, slipLang: 'hi', fee: 'cash', card: 'bpl' }

const pill = (on) =>
  `flex min-h-12 grow items-center justify-center gap-2 rounded-xl border px-3 text-lg font-semibold sm:whitespace-nowrap ${
    on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-card hover:border-brand'
  }`

// Registration counter: staff register someone in a few taps (for a patient
// with no phone) and print the slip.
// People who booked on a phone (or missed their turn) join the end of the line
// here, if they cannot scan the code on the waiting-room screen. Free care they
// claimed on the phone can be confirmed at the same time. People back with test
// reports join near the front.
function CheckInDesk({ state, t, lang }) {
  const allowed = useCan()
  const v = useCheckInCode()
  const [q, setQ] = useState('')
  const [done, setDone] = useState('')
  const all = Object.values(state.patients)
    .filter((p) => joinKind(p))
    .sort((a, b) => a.token.localeCompare(b.token))
  const s = q.trim().toLowerCase()
  const shown = (s ? all.filter((p) => p.token.toLowerCase().includes(s) || patientName(p, lang).toLowerCase().includes(s)) : all).slice(0, 8)
  if (state.arrival === false && !all.length) return null
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="qr" size={24} />
        {t('counter.checkinTitle')}
      </h2>
      <p className="text-base text-ink-2">{t('counter.checkinHint')}</p>
      {v?.code && <p className="text-base">{t('counter.codeNow', { code: `${v.code.slice(0, 3)} ${v.code.slice(3)}` })}</p>}
      <div>
        <label htmlFor="ci-find" className="mb-1 block font-semibold">
          {t('counter.checkinFind')}
        </label>
        <input
          id="ci-find"
          className="min-h-12 w-full rounded-xl border border-line bg-card px-3 text-lg sm:max-w-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {done && (
        <p role="status" className="flex items-center gap-2 font-semibold text-ok">
          <Icon name="check" size={20} />
          {t('counter.checkedIn', { token: done })}
        </p>
      )}
      {!all.length ? (
        <p className="text-base text-ink-2">{t('counter.noBookings')}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line p-2">
              <span className="font-mono text-lg font-bold">{p.token}</span>
              <span>
                {patientName(p, lang)}
                {p.age != null && `, ${p.age}`}
              </span>
              <span className="text-sm text-ink-2">
                {{ missed: t('counter.missed'), reports: t('counter.reports') }[joinKind(p)] || t('counter.booked')}
                {reportsState(p) === 'ready' && ` · ${t('staff.readyNotBack')}`}
              </span>
              <BillChip bill={billSummary(p)} t={t} />
              <span className="ml-auto flex flex-wrap gap-2">
                <PayButtons p={p} t={t} allowed={allowed} />
                {reportsState(p) === 'pending' && (
                  <Button variant="secondary" icon="lab" className="text-base" disabled={!allowed('reportsReady')} onClick={() => reportsReady(p.id)}>
                    {t('staff.reportsReady')}
                  </Button>
                )}
                <Button
                  icon="check"
                  className="text-base"
                  disabled={!allowed('checkIn')}
                  onClick={async () => {
                    const token = await checkIn(p.id).catch(() => null)
                    if (token) {
                      setDone(token)
                      setQ('')
                    }
                  }}
                >
                  {t('counter.checkIn')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function Counter() {
  const { t, lang } = useStaffI18n()
  const state = useHospital()
  const now = useSimNow(5000)
  const [f, setF] = useState(empty)
  const [error, setError] = useState('')
  const [lastId, setLastId] = useState(null)
  const set = (patch) => {
    setError('')
    setF((x) => ({ ...x, ...patch }))
  }
  const last = lastId && state.patients[lastId]

  const submit = async (e) => {
    e.preventDefault()
    const age = Number(f.age)
    if (!f.name.trim()) return setError(t('reg.name.error'))
    if (f.age === '' || !Number.isInteger(age) || age > 120) return setError(t('reg.age.error'))
    if (!f.gender) return setError(t('reg.gender.error'))
    if (!f.dept) return setError(t('reg.dept.error'))
    if (f.mobile && !/^[6-9]\d{9}$/.test(f.mobile)) return setError(t('reg.mobile.error'))
    let p
    try {
      p = await registerPatient({
      name: f.name.trim(),
      age,
      gender: f.gender,
      dept: f.dept,
      mobile: f.mobile,
      assisted: f.assisted,
      lang: f.slipLang,
      via: 'counter',
      payChoice: f.fee === 'card' ? 'card' : 'counter',
      card: f.fee === 'card' ? f.card : '',
      paidCash: f.fee === 'cash',
      cardOk: f.fee === 'card',
    })
    } catch {
      return setError(t('reg.failed'))
    }
    setLastId(p.id)
    setF({ ...empty, slipLang: f.slipLang })
  }

  if (last) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">{t('counter.done', { token: last.token })}</h1>
        <SlipCard state={state} p={last} lang={last.lang} now={now} />
        {receiptsOf(last).map((r) => (
          <ReceiptCard key={r.receipt} r={r} p={last} lang={last.lang} />
        ))}
        <div className="grid grid-cols-2 gap-3 print:hidden">
          <Button icon="print" onClick={() => window.print()}>
            {t('common.print')}
          </Button>
          <Button variant="secondary" icon="download" onClick={() => saveSlip(slipInfo(state, last, last.lang, now))}>
            {t('slip.save')}
          </Button>
        </div>
        <Button variant="secondary" icon="plus" className="w-full print:hidden" onClick={() => setLastId(null)}>
          {t('counter.next')}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">{t('counter.title')}</h1>
      <ScreenGuide id="counter" items={['newP', 'booked', 'reports', 'free']} t={t} />
      <CheckInDesk state={state} t={t} lang={lang} />
    <form className="space-y-5" onSubmit={submit} noValidate>
      <h2 className="text-xl font-semibold">{t('counter.registerTitle')}</h2>
      <p className="text-lg text-ink-2">{t('counter.hint')}</p>

      <Card className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className="mb-1 block text-lg font-semibold">
            {t('counter.name')}
          </label>
          <input
            id="c-name"
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={40}
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-card px-4 min-h-12 text-xl"
          />
        </div>
        <div>
          <label htmlFor="c-age" className="mb-1 block text-lg font-semibold">
            {t('counter.age')}
          </label>
          <input
            id="c-age"
            value={f.age}
            onChange={(e) => set({ age: digitsOnly(e.target.value).slice(0, 3) })}
            inputMode="numeric"
            className="w-full rounded-xl border border-line bg-card px-4 min-h-12 text-xl"
          />
        </div>
      </Card>

      <fieldset>
        <legend className="mb-2 text-lg font-semibold">{t('counter.gender')}</legend>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['f', 'woman'],
            ['m', 'man'],
            ['x', 'person'],
          ].map(([g, icon]) => (
            <button key={g} type="button" aria-pressed={f.gender === g} onClick={() => set({ gender: g })} className={pill(f.gender === g)}>
              <Icon name={icon} />
              {t(`gender.${g}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-lg font-semibold">{t('counter.dept')}</legend>
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <button key={d.id} type="button" aria-pressed={f.dept === d.id} onClick={() => set({ dept: d.id })} className={pill(f.dept === d.id)}>
              <Icon name={d.icon} />
              {t(`depts.${d.id}.name`)}
            </button>
          ))}
        </div>
      </fieldset>

      <Card className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-mobile" className="mb-1 block text-lg font-semibold">
            {t('counter.mobile')}
          </label>
          <input
            id="c-mobile"
            type="tel"
            value={f.mobile}
            onChange={(e) => set({ mobile: digitsOnly(e.target.value).slice(0, 10) })}
            inputMode="numeric"
            className="w-full rounded-xl border border-line bg-card px-4 min-h-12 text-xl"
          />
        </div>
        <fieldset>
          <legend className="mb-1 text-lg font-semibold">{t('counter.slipLang')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {LANGS.map((l) => (
              <button key={l} type="button" lang={l} aria-pressed={f.slipLang === l} onClick={() => set({ slipLang: l })} className={pill(f.slipLang === l)}>
                <Icon name="globe" />
                {translate(l, 'lang.self')}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-3 text-lg sm:col-span-2">
          <input type="checkbox" checked={f.assisted} onChange={(e) => set({ assisted: e.target.checked })} className="h-7 w-7" />
          <Icon name="hand" />
          {t('counter.assisted')}
        </label>
      </Card>

      <fieldset>
        <legend className="mb-2 text-lg font-semibold">{t('counter.feeTitle', { amount: rupees(OPD_FEE) })}</legend>
        {autoFreeReason({ age: f.age === '' ? null : Number(f.age), dept: f.dept }) ? (
          <p className="flex items-center gap-2 text-lg">
            <Icon name="check" />
            {t('counter.free', { reason: t(`pay.free.${autoFreeReason({ age: f.age === '' ? null : Number(f.age), dept: f.dept })}`) })}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {[
                ['cash', 'rupee'],
                ['later', 'clock'],
                ['card', 'badge'],
              ].map(([k, icon]) => (
                <button key={k} type="button" aria-pressed={f.fee === k} onClick={() => set({ fee: k })} className={pill(f.fee === k)}>
                  <Icon name={icon} />
                  {t(`counter.fee.${k}`)}
                </button>
              ))}
            </div>
            {f.fee === 'card' && (
              <div className="flex flex-wrap gap-2">
                {FREE_CARDS.map((c) => (
                  <button key={c} type="button" aria-pressed={f.card === c} onClick={() => set({ card: c })} className={pill(f.card === c)}>
                    <Icon name="badge" />
                    {t(`cards.${c}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </fieldset>

      <p role="alert" className="min-h-7 text-lg font-bold text-danger">
        {error}
      </p>
      <Button type="submit" icon="print" className="w-full text-xl">
        {t('counter.submit')}
      </Button>
    </form>
    </div>
  )
}
