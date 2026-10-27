import { useCallback, useEffect, useState } from 'react'
import { useHospital, useMode } from '../../lib/store.js'
import { api } from '../../lib/auth.js'
import { rupees } from '../../lib/billing.js'
import { patientName } from '../../lib/text.js'
import { DECISIONS, nextSteps, whoseTurn, claimTotals, daysSince, isOpen } from '../../lib/claims.js'
import { DOCS, packageById } from '../../data/pmjay.js'
import { Button, Card, Notice } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import { useStaffI18n, useCan } from './StaffLayout.jsx'
import ClaimForm, { StageChip, canAdmit, cardChecked, claimError, stepDone, input, label } from './ClaimForm.jsx'

const TURNS = ['us', 'ward', 'pmjay', 'closed']
// What each step asks for before it is recorded.
const NEEDS_NOTE = ['preauthQuery', 'claimQuery', 'preauthReject', 'claimReject', 'reply', 'cancel', 'claimApprove']
const NEEDS_AMOUNT = { preauthApprove: 'rate', claimApprove: 'claimed', paid: 'settled' }

const dateFmt = (lang, withTime) =>
  new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })

function StepForm({ c, step, t, onRun, onBack }) {
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState(NEEDS_AMOUNT[step] ? String(c[NEEDS_AMOUNT[step]]) : '')
  const [ref, setRef] = useState('')
  const submit = (e) => {
    e.preventDefault()
    onRun(step, { note, ...(NEEDS_AMOUNT[step] ? { amount: Number(amount) } : {}), ...(step === 'paid' ? { ref } : {}) })
  }
  const id = `${c.id}-${step}`
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-page p-3" noValidate>
      <p className="font-semibold">{t(`claims.step.${step}`)}</p>
      {NEEDS_AMOUNT[step] && (
        <div className="max-w-xs">
          <label htmlFor={`${id}-amount`} className={label}>
            {t('claims.fields.amount')}
          </label>
          <input id={`${id}-amount`} className={input} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        </div>
      )}
      {step === 'paid' && (
        <div className="max-w-sm">
          <label htmlFor={`${id}-ref`} className={label}>
            {t('claims.refLabel')}
          </label>
          <input id={`${id}-ref`} className={input} value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} autoComplete="off" spellCheck={false} />
        </div>
      )}
      {NEEDS_NOTE.includes(step) && (
        <div>
          <label htmlFor={`${id}-note`} className={label}>
            {t(`claims.note.${step}`)}
          </label>
          <textarea id={`${id}-note`} className={`${input} py-2`} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon="check" variant={step === 'cancel' || step.endsWith('Reject') ? 'danger' : 'primary'}>
          {t('claims.record')}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {t('claims.back')}
        </Button>
      </div>
    </form>
  )
}

function ClaimRow({ c, t, lang, allowed, now, onChanged }) {
  const [open, setOpen] = useState(false)
  const [doing, setDoing] = useState(null)
  const [tms, setTms] = useState(c.tms)
  const [err, setErr] = useState('')
  useEffect(() => setTms(c.tms), [c.tms])
  const turn = whoseTurn(c)
  const pkg = packageById[c.pkg]
  const day = dateFmt(lang)
  const dayTime = dateFmt(lang, true)
  const edit = allowed('claimEdit')
  const mayStep = (s) => (s === 'paid' ? allowed('claimPaid') : edit)
  const steps = nextSteps(c)
  const ours = steps.filter((s) => !DECISIONS.includes(s) && s !== 'cancel')
  const theirs = steps.filter((s) => DECISIONS.includes(s))
  const docsDone = DOCS.every((d) => c.docs[d])
  const since = daysSince(c.stageAt, now)

  const run = async (step, args = {}) => {
    setErr('')
    try {
      const { claim } = await api(`/claims/${c.id}/step`, { step, ...args })
      onChanged(claim)
      setDoing(null)
    } catch (e) {
      setErr(claimError(e, t))
    }
  }
  const pick = (s) => (NEEDS_NOTE.includes(s) || NEEDS_AMOUNT[s] ? setDoing(s) : run(s))

  const money = [
    ['preauth', c.approved],
    ['claimed', c.claimed],
    ['settled', c.settled],
    ['received', c.paid],
  ].filter(([, v]) => v != null)

  return (
    <li className="rounded-2xl border border-line bg-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left">
        <span className="font-mono font-bold">{c.id}</span>
        {c.token && <span className="font-mono text-ink-2">{c.token}</span>}
        <span className="font-semibold">
          {patientName(c, lang)}
          {c.age != null && `, ${c.age}`}
        </span>
        <span className="text-ink-2">
          {t(`pmjay.packages.${c.pkg}`)} · {rupees(c.paid ?? c.settled ?? c.claimed ?? c.approved ?? c.rate)}
        </span>
        {c.emergency && <span className="rounded-full bg-danger-soft px-2 text-sm font-semibold text-danger">{t('claims.emergency')}</span>}
        {c.sample && <span className="rounded-full bg-page px-2 text-sm text-ink-2">{t('claims.sample')}</span>}
        <span className="ml-auto flex items-center gap-2">
          <StageChip stage={c.stage} t={t} />
          {isOpen(c) && <span className="text-sm text-ink-2">{since ? t('claims.forDays', { n: since }) : t('claims.today')}</span>}
          <Icon name={open ? 'minus' : 'plus'} size={18} className="text-ink-2" />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-line p-3">
          {isOpen(c) && <Notice kind={turn === 'us' ? 'warn' : 'info'}>{t(`claims.hint.${c.stage}`)}</Notice>}

          <dl className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-sm text-ink-2">{t('claims.fields.pkg')}</dt>
              <dd>
                {t(`pmjay.packages.${c.pkg}`)} <span className="text-ink-2">({pkg?.code}, {rupees(c.rate)})</span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-2">{t('claims.fields.patient')}</dt>
              <dd>
                {c.token ? <span className="font-mono">{c.token}</span> : t('claims.notOpd')} · {t(`depts.${c.dept}.name`)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-2">{t('claims.fields.ward')}</dt>
              <dd>{t(`places.${c.ward}.name`)}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-2">{t('claims.fields.admitted')}</dt>
              <dd>{day.format(c.createdAt)}</dd>
            </div>
            {c.dischargedAt && (
              <div>
                <dt className="text-sm text-ink-2">{t('claims.fields.discharged')}</dt>
                <dd>{day.format(c.dischargedAt)}</dd>
              </div>
            )}
            {money.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-ink-2">{t(`claims.fields.${k}`)}</dt>
                <dd className="font-semibold tabular-nums">
                  {rupees(v)}
                  {k === 'received' && c.payRef && <span className="font-normal text-ink-2"> · {c.payRef}</span>}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <label htmlFor={`${c.id}-tms`} className={label}>
                {t('claims.fields.tms')}
              </label>
              <input
                id={`${c.id}-tms`}
                className={input}
                value={tms}
                onChange={(e) => setTms(e.target.value)}
                disabled={!edit || !isOpen(c)}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {edit && isOpen(c) && tms !== c.tms && (
              <Button variant="secondary" icon="check" onClick={() => run('update', { tms })}>
                {t('claims.save')}
              </Button>
            )}
          </div>

          {c.stage !== 'preauthSent' && c.stage !== 'preauthQuery' && c.stage !== 'preauthRejected' && (
            <fieldset className="space-y-2">
              <legend className="font-semibold">{t('claims.docsTitle')}</legend>
              <p className="text-sm text-ink-2">{t('claims.docsHint')}</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {DOCS.map((d) => (
                  <label key={d} className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={c.docs[d]}
                      disabled={!edit || !isOpen(c)}
                      onChange={(e) => run('update', { docs: { [d]: e.target.checked } })}
                    />
                    {t(`claims.docs.${d}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {doing ? (
            <StepForm c={c} step={doing} t={t} onRun={run} onBack={() => setDoing(null)} />
          ) : (
            isOpen(c) && (
              <div className="space-y-3">
                {ours.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-ink-2">{t('claims.yourStep')}</p>
                    <div className="flex flex-wrap gap-2">
                      {ours.map((s) => (
                        <Button key={s} icon="next" disabled={!mayStep(s) || (s === 'submit' && !docsDone)} onClick={() => pick(s)}>
                          {t(`claims.step.${s}`)}
                        </Button>
                      ))}
                    </div>
                    {ours.includes('submit') && !docsDone && <p className="text-sm text-ink-2">{t('claims.docsFirst')}</p>}
                  </div>
                )}
                {theirs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-ink-2">{t('claims.decided')}</p>
                    <div className="flex flex-wrap gap-2">
                      {theirs.map((s) => (
                        <Button
                          key={s}
                          variant={s.endsWith('Reject') ? 'dangerOutline' : s.endsWith('Query') ? 'secondary' : 'primary'}
                          icon={s.endsWith('Reject') ? 'close' : s.endsWith('Query') ? 'question' : 'check'}
                          disabled={!mayStep(s)}
                          onClick={() => pick(s)}
                        >
                          {t(`claims.step.${s}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {edit && (
                  <Button variant="ghost" icon="close" className="text-danger" onClick={() => setDoing('cancel')}>
                    {t('claims.step.cancel')}
                  </Button>
                )}
              </div>
            )
          )}
          {err && (
            <Notice kind="danger" live>
              {err}
            </Notice>
          )}

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-ink-2">{t('claims.history')}</h3>
            <ol className="space-y-1.5 border-l-2 border-line pl-3">
              {[...c.history].reverse().map((h, i) => (
                <li key={i} className="text-base">
                  <span className="text-ink-2 tabular-nums">{dayTime.format(h.at)}</span> · <span className="font-semibold">{stepDone(h.step, t)}</span>
                  {h.amount != null && <span className="tabular-nums"> · {rupees(h.amount)}</span>}
                  <span className="text-ink-2"> · {h.by}</span>
                  {h.note && <span className="block text-ink-2">“{h.note}”</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </li>
  )
}

function downloadCsv(claims, t, lang) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const day = (at) => (at ? new Date(at).toISOString().slice(0, 10) : '')
  const rows = [
    ['claim', 'token', 'name', 'package', 'code', 'ward', 'emergency', 'stage', 'admitted', 'discharged', 'preauth', 'claimed', 'approved', 'received', 'paymentRef', 'caseNo'].map((k) =>
      t(`claims.csv.${k}`),
    ),
    ...claims.map((c) => [
      c.id,
      c.token || '',
      patientName(c, lang),
      t(`pmjay.packages.${c.pkg}`),
      packageById[c.pkg]?.code,
      t(`places.${c.ward}.short`),
      c.emergency ? t('claims.emergency') : '',
      t(`claims.stage.${c.stage}`),
      day(c.createdAt),
      day(c.dischargedAt),
      c.approved,
      c.claimed,
      c.settled,
      c.paid,
      c.payRef,
      c.tms,
    ]),
  ]
  // The BOM lets spreadsheet apps read Hindi text correctly.
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'opd-saathi-pmjay-claims.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function Claims() {
  const { t, lang } = useStaffI18n()
  const allowed = useCan()
  const { mode } = useMode()
  const state = useHospital()
  const [claims, setClaims] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState('')
  const now = Date.now()

  const load = useCallback(
    () =>
      api('/claims')
        .then((d) => {
          setClaims(d.claims)
          setError('')
        })
        .catch((err) => setError(err.message)),
    [],
  )
  useEffect(() => {
    if (mode !== 'server') return
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [mode, load])

  if (mode !== 'server') return <Notice kind="info">{t('claims.needsServer')}</Notice>

  const list = claims || []
  const totals = claimTotals(list)
  const changed = (c) => setClaims((l) => [c, ...(l || []).filter((x) => x.id !== c.id)])
  // Claims that need the hospital first, then the newest.
  const shown = list
    .filter((c) => filter === 'all' || whoseTurn(c) === filter)
    .sort((a, b) => TURNS.indexOf(whoseTurn(a)) - TURNS.indexOf(whoseTurn(b)) || b.id.localeCompare(a.id))
  const eligible = Object.values(state.patients)
    .filter(canAdmit)
    .sort((a, b) => cardChecked(b) - cardChecked(a) || a.token.localeCompare(b.token))
  const samples = async (add) => {
    try {
      const r = await api('/claims/sample', {}, add ? 'POST' : 'DELETE')
      setMsg(add ? t('claims.samples.added', { n: r.n }) : t('claims.samples.removed'))
      load()
    } catch (err) {
      setMsg(err.message)
    }
  }
  const counts = { us: totals.us, ward: totals.ward, pmjay: totals.pmjay, closed: list.length - totals.open, all: list.length }

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Icon name="shield" size={34} />
        {t('claims.title')}
      </h1>
      <p className="text-lg text-ink-2">{t('claims.intro')}</p>
      <ScreenGuide id="claims" items={['admit', 'step', 'turn']} t={t} />
      <Notice kind="info" title={t('claims.noLinkTitle')}>
        {t('claims.noLink')}
      </Notice>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-base text-ink-2">{t('claims.tiles.us')}</p>
          <p className="text-3xl font-bold">{totals.us}</p>
          <p className="text-base">{t('claims.tiles.usSub')}</p>
        </Card>
        <Card className="p-4">
          <p className="text-base text-ink-2">{t('claims.tiles.ward')}</p>
          <p className="text-3xl font-bold">{totals.ward}</p>
        </Card>
        <Card className="p-4">
          <p className="text-base text-ink-2">{t('claims.tiles.pmjay')}</p>
          <p className="text-3xl font-bold">{totals.pmjay}</p>
          <p className="text-base">{t('claims.tiles.claimedSub', { amount: rupees(totals.waiting) })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-base text-ink-2">{t('claims.tiles.received')}</p>
          <p className="text-3xl font-bold">{rupees(totals.received)}</p>
          <p className="text-base">{t('claims.tiles.approvedSub', { amount: rupees(totals.approved) })}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t('claims.show')} className="flex flex-wrap gap-2">
          {['all', ...TURNS].map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`min-h-11 rounded-full border px-4 font-semibold ${filter === k ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-card text-ink hover:border-brand'}`}
            >
              {t(`claims.turn.${k}`)} ({counts[k]})
            </button>
          ))}
        </div>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" icon="download" disabled={!list.length} onClick={() => downloadCsv(shown, t, lang)}>
            {t('claims.download')}
          </Button>
          {allowed('claimEdit') && (
            <Button icon="plus" onClick={() => setAdding(true)}>
              {t('claims.newClaim')}
            </Button>
          )}
        </span>
      </div>

      {error && <Notice kind="danger">{error}</Notice>}
      {claims && !shown.length && <p className="text-lg text-ink-2">{t('claims.empty')}</p>}
      <ul className="space-y-2">
        {shown.map((c) => (
          <ClaimRow key={c.id} c={c} t={t} lang={lang} allowed={allowed} now={now} onChanged={changed} />
        ))}
      </ul>

      {allowed('claimSamples') && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">{t('claims.samples.title')}</h2>
          <p className="text-base text-ink-2">{t('claims.samples.intro')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="plus" onClick={() => samples(true)}>
              {t('claims.samples.add')}
            </Button>
            <Button variant="ghost" icon="close" onClick={() => samples(false)}>
              {t('claims.samples.remove')}
            </Button>
          </div>
          {msg && (
            <Notice kind="ok" live>
              {msg}
            </Notice>
          )}
        </Card>
      )}

      {adding && <ClaimForm patients={eligible} t={t} lang={lang} onClose={() => setAdding(false)} onDone={changed} />}
    </div>
  )
}
