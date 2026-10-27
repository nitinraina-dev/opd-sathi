import { useEffect, useState } from 'react'
import { useHospital, useMode } from '../../lib/store.js'
import { payCash, refundItem } from '../../lib/actions.js'
import { api } from '../../lib/auth.js'
import { billSummary, receiptsOf, rupees } from '../../lib/billing.js'
import { patientName } from '../../lib/text.js'
import { fmtTime } from '../../lib/clock.js'
import { Button, Card, Notice } from '../../components/ui.jsx'
import { itemName } from '../../components/Payment.jsx'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import { useStaffI18n, useCan } from './StaffLayout.jsx'
import PayButtons from './PayButtons.jsx'

// Totals for today from the queue (a demo reset starts a new day).
function summarise(state) {
  const live = Object.values(state.patients).filter((p) => p.status !== 'moved')
  const real = { cash: 0, upi: 0, online: 0 }
  let notReal = 0
  const free = {}
  for (const p of live) {
    for (const i of p.bill || []) {
      if (i.status === 'paid') {
        if (i.mode === 'demo' || i.mode === 'test') notReal += i.amount
        else real[i.method] = (real[i.method] || 0) + i.amount
      }
      if (i.status === 'waived' && i.kind === 'opd') free[i.reason] = (free[i.reason] || 0) + 1
    }
  }
  const owing = live.filter((p) => billSummary(p).due > 0 && p.waiver?.status !== 'requested')
  const cards = live.filter((p) => p.waiver?.status === 'requested')
  const receipts = live.flatMap((p) => receiptsOf(p).map((r) => ({ ...r, p }))).sort((a, b) => b.at - a.at || b.receipt.localeCompare(a.receipt))
  return { real, realTotal: real.cash + real.upi + real.online, notReal, free, owing, cards, receipts }
}

function downloadCsv(receipts, t) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [
    [t('pay.receipt'), t('slip.token'), t('pay.total'), t('pay.paidBy'), t('paymentsPage.modeCol'), t('audit.when'), t('paymentsPage.itemsCol')],
    ...receipts.map((r) => [
      r.receipt,
      r.p.token,
      r.total,
      t(`pay.method.${r.method}`),
      r.items[0]?.mode || 'cash',
      fmtTime(r.at),
      r.items.map((i) => `${itemName(i, t)} ${i.amount}${i.status === 'refunded' ? ` (${t('pay.refunded')})` : ''}`).join('; '),
    ]),
  ]
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'opd-saathi-receipts.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const input = 'w-full rounded-xl border border-line bg-card px-3 min-h-12 text-lg'

function KeyFields({ m, saved, f, set, t }) {
  return (
    <fieldset className="space-y-3 rounded-2xl border border-line p-3">
      <legend className="px-1 text-lg font-bold">{t(`paymentsPage.settings.${m}Keys`)}</legend>
      <div>
        <label htmlFor={`${m}-id`} className="block text-base font-semibold">
          {t('paymentsPage.settings.keyId')}
        </label>
        <input id={`${m}-id`} className={input} value={f.keyId} placeholder={`rzp_${m}_…`} onChange={(e) => set({ keyId: e.target.value })} autoComplete="off" spellCheck={false} />
      </div>
      {['keySecret', 'webhookSecret'].map((k) => (
        <div key={k}>
          <label htmlFor={`${m}-${k}`} className="block text-base font-semibold">
            {t(`paymentsPage.settings.${k}`)}
          </label>
          <input id={`${m}-${k}`} type="password" className={input} value={f[k]} onChange={(e) => set({ [k]: e.target.value })} autoComplete="new-password" aria-describedby={`${m}-${k}-hint`} />
          <p id={`${m}-${k}-hint`} className="text-base text-ink-2">
            {saved[k === 'keySecret' ? 'secret' : 'webhook']
              ? `${t('paymentsPage.settings.saved', { masked: saved[k === 'keySecret' ? 'secret' : 'webhook'] })} ${t('paymentsPage.settings.keepBlank')}`
              : t('paymentsPage.settings.notSaved')}
          </p>
        </div>
      ))}
    </fieldset>
  )
}

function Settings({ t }) {
  const [saved, setSaved] = useState(null)
  const [mode, setMode] = useState('demo')
  const [keys, setKeys] = useState({ test: { keyId: '', keySecret: '', webhookSecret: '' }, live: { keyId: '', keySecret: '', webhookSecret: '' } })
  const [upi, setUpi] = useState({ vpa: '', name: '' })
  const [sure, setSure] = useState(false)
  const [msg, setMsg] = useState(null)

  const take = (s) => {
    setSaved(s)
    setMode(s.mode)
    setKeys({ test: { keyId: s.test.keyId, keySecret: '', webhookSecret: '' }, live: { keyId: s.live.keyId, keySecret: '', webhookSecret: '' } })
    setUpi(s.upi)
  }
  useEffect(() => {
    api('/pay/settings').then(take).catch((err) => setMsg({ kind: 'danger', text: err.message }))
  }, [])
  if (!saved) return msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null

  const save = async () => {
    if (mode === 'live' && saved.mode !== 'live' && !sure) return setMsg({ kind: 'warn', text: t('paymentsPage.settings.confirmLive') })
    try {
      take(await api('/pay/settings', { mode, test: keys.test, live: keys.live, upi }, 'PUT'))
      setSure(false)
      setMsg({ kind: 'ok', text: t('common.saved') })
    } catch (err) {
      setMsg({ kind: 'danger', text: err.message })
    }
  }
  const check = async (m) => {
    const r = await api('/pay/check', { mode: m }).catch((err) => ({ ok: false, error: err.message }))
    setMsg(r.ok ? { kind: 'ok', text: t('paymentsPage.settings.checkOk', { mode: t(`paymentsPage.settings.${m}`) }) } : { kind: 'danger', text: r.error })
  }
  const webhookUrl = `${window.location.origin}/api/pay/webhook`

  return (
    <Card className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="settings" />
        {t('paymentsPage.settings.title')}
      </h2>
      <p className="text-lg">{t('paymentsPage.settings.intro')}</p>
      {saved.mode === 'live' && <Notice kind="warn" title={t('paymentsPage.settings.liveWarn')} />}
      <fieldset>
        <legend className="mb-2 text-lg font-bold">{t('paymentsPage.settings.mode')}</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {['demo', 'test', 'live'].map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-2xl border-4 p-3 text-left ${mode === m ? 'border-brand bg-brand-soft' : 'border-line bg-card'}`}
            >
              <span className="flex items-center gap-2 text-lg font-bold">
                <Icon name={mode === m ? 'check' : m === 'live' ? 'rupee' : 'info'} size={22} />
                {t(`paymentsPage.settings.${m}`)}
              </span>
              <span className="block text-base text-ink-2">{t(`paymentsPage.settings.${m}Hint`)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {mode === 'live' && saved.mode !== 'live' && (
        <label className="flex items-center gap-3 text-lg font-semibold">
          <input type="checkbox" className="h-7 w-7" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          {t('paymentsPage.settings.confirmLive')}
        </label>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {['test', 'live'].map((m) => (
          <div key={m} className="space-y-2">
            <KeyFields m={m} saved={saved[m]} f={keys[m]} set={(patch) => setKeys({ ...keys, [m]: { ...keys[m], ...patch } })} t={t} />
            <Button variant="secondary" icon="check" onClick={() => check(m)} disabled={!saved[m].keyId}>
              {t('paymentsPage.settings.check', { mode: t(`paymentsPage.settings.${m}`) })}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-base text-ink-2">{t('paymentsPage.settings.where')}</p>
      <p className="text-base text-ink-2">{t('paymentsPage.settings.webhookUrl', { url: webhookUrl })}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="upi-vpa" className="block text-base font-semibold">
            {t('paymentsPage.settings.upi')}
          </label>
          <input id="upi-vpa" className={input} value={upi.vpa} onChange={(e) => setUpi({ ...upi, vpa: e.target.value })} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="upi-name" className="block text-base font-semibold">
            {t('paymentsPage.settings.upiName')}
          </label>
          <input id="upi-name" className={input} value={upi.name} onChange={(e) => setUpi({ ...upi, name: e.target.value })} />
        </div>
      </div>
      <Button icon="check" onClick={save}>
        {t('paymentsPage.settings.save')}
      </Button>
      {msg && (
        <Notice kind={msg.kind} live>
          {msg.text}
        </Notice>
      )}
    </Card>
  )
}

export default function Payments() {
  const { t, lang } = useStaffI18n()
  const state = useHospital()
  const allowed = useCan()
  const { mode } = useMode()
  const s = summarise(state)
  const row = 'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-card p-3'
  // A refund asks first: the receipt waiting for "Yes, refund".
  const [sure, setSure] = useState(null)

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Icon name="rupee" size={34} />
        {t('paymentsPage.title')}
      </h1>
      <p className="text-lg text-ink-2">{t('paymentsPage.intro')}</p>
      <ScreenGuide id="payments" items={['owing', 'cards', 'refund', 'never']} t={t} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-base text-ink-2">{t('paymentsPage.collected')}</p>
          <p className="text-3xl font-bold">{rupees(s.realTotal)}</p>
          <p className="text-base">{t('paymentsPage.byMethod', { cash: rupees(s.real.cash), upi: rupees(s.real.upi), online: rupees(s.real.online) })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-base text-ink-2">{t('paymentsPage.notReal')}</p>
          <p className="text-3xl font-bold">{rupees(s.notReal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-base text-ink-2">{t('paymentsPage.toPay')}</p>
          <p className="text-3xl font-bold">{rupees(s.owing.reduce((a, p) => a + billSummary(p).due, 0))}</p>
          <p className="text-base">{t('paymentsPage.patients', { n: s.owing.length })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-base text-ink-2">{t('paymentsPage.free')}</p>
          <p className="text-3xl font-bold">{Object.values(s.free).reduce((a, b) => a + b, 0)}</p>
          <p className="text-base">
            {Object.entries(s.free)
              .map(([k, n]) => `${t(`pay.free.${k}`)}: ${n}`)
              .join(' · ')}
          </p>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('paymentsPage.cardsWaiting', { n: s.cards.length })}</h2>
        {!s.cards.length && <p className="text-lg text-ink-2">{t('paymentsPage.noneYet')}</p>}
        <ul className="space-y-2">
          {s.cards.map((p) => (
            <li key={p.id} className={row}>
              <span className="font-mono text-xl font-bold">{p.token}</span>
              <span className="text-lg">{patientName(p, lang)}</span>
              <span className="flex items-center gap-1 text-lg">
                <Icon name="badge" size={20} />
                {t(`cards.${p.waiver.card}`)}
              </span>
              <span className="ml-auto flex flex-wrap gap-2">
                <PayButtons p={p} t={t} allowed={allowed} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('paymentsPage.owing', { n: s.owing.length })}</h2>
        {!s.owing.length && <p className="text-lg text-ink-2">{t('paymentsPage.noneYet')}</p>}
        <ul className="space-y-2">
          {s.owing.map((p) => {
            const b = billSummary(p)
            return (
              <li key={p.id} className={row}>
                <span className="font-mono text-xl font-bold">{p.token}</span>
                <span className="text-lg">{patientName(p, lang)}</span>
                <span className="text-base text-ink-2">
                  {b.items
                    .filter((i) => i.status === 'due')
                    .map((i) => itemName(i, t))
                    .join(', ')}
                </span>
                <span className="ml-auto">
                  <Button variant="secondary" icon="rupee" disabled={!allowed('payBill')} onClick={() => payCash(p.id)}>
                    {t('staff.cashReceived', { amount: rupees(b.due) })}
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{t('paymentsPage.receiptsTitle', { n: s.receipts.length })}</h2>
          <Button variant="secondary" icon="download" className="ml-auto" disabled={!s.receipts.length} onClick={() => downloadCsv(s.receipts, t)}>
            {t('paymentsPage.download')}
          </Button>
        </div>
        {!s.receipts.length && <p className="text-lg text-ink-2">{t('paymentsPage.noneYet')}</p>}
        <ul className="space-y-2">
          {s.receipts.map((r) => (
            <li key={r.receipt} className={row}>
              <span className="font-mono text-lg font-bold">{r.receipt}</span>
              <span className="font-mono text-lg">{r.p.token}</span>
              <span className="text-lg font-semibold">{rupees(r.total)}</span>
              <span className="text-base">
                {t(`pay.method.${r.method}`)}
                {r.items[0]?.mode === 'demo' || r.items[0]?.mode === 'test' ? ` · ${t(`pay.${r.items[0].mode}Mark`)}` : ''}
              </span>
              <span className="text-base text-ink-2">{fmtTime(r.at)}</span>
              <span className="text-base text-ink-2">{r.items.map((i) => itemName(i, t)).join(', ')}</span>
              {allowed('refundItem') && r.total > 0 && sure !== r.receipt && (
                <Button variant="secondary" icon="refresh" className="ml-auto" onClick={() => setSure(r.receipt)}>
                  {t('paymentsPage.refund', { amount: rupees(r.total) })}
                </Button>
              )}
              {allowed('refundItem') && r.total > 0 && sure === r.receipt && (
                <span className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon="check"
                    onClick={() => {
                      r.items.filter((i) => i.status === 'paid').forEach((i) => refundItem(r.p.id, i.id))
                      setSure(null)
                    }}
                  >
                    {t('paymentsPage.refundYes', { amount: rupees(r.total) })}
                  </Button>
                  <Button variant="ghost" icon="close" onClick={() => setSure(null)}>
                    {t('common.cancel')}
                  </Button>
                </span>
              )}
              {r.total === 0 && <span className="ml-auto text-lg font-semibold">{t('pay.refunded')}</span>}
            </li>
          ))}
        </ul>
      </section>

      {mode !== 'server' ? (
        <Notice kind="info">{t('paymentsPage.needsServer')}</Notice>
      ) : allowed('paymentSettings') ? (
        <Settings t={t} />
      ) : (
        <Notice kind="info">{t('paymentsPage.adminOnly')}</Notice>
      )}
    </div>
  )
}
