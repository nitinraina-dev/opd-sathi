import { useEffect, useState } from 'react'
import { Button, Modal, Notice } from './ui.jsx'
import Icon from './Icon.jsx'
import { QRCode } from './Slip.jsx'
import { useI18n } from '../i18n/index.js'
import { paymentConfig, startPayment, confirmPayment, razorpayCheckout } from '../lib/payments.js'
import { rupees, receiptsOf } from '../lib/billing.js'
import { fmtTime, dateKey } from '../lib/clock.js'
import { saveSlipImage } from '../lib/slipImage.js'
import { turnUrl } from '../lib/qr.js'

const markKey = { demo: 'pay.demoMark', test: 'pay.testMark' }

// Name of one bill line (OPD fee or a test).
export const itemName = (i, t) => (i.kind === 'opd' ? t('pay.items.opd') : i.kind === 'emergency' ? t('pay.items.emergency') : t(`fees.tests.${i.code}`))

// Short text for a bill: "Paid ₹10", "₹150 to pay", "Free (senior citizen)"…
export function billText(bill, t) {
  if (bill.state === 'none') return ''
  return t(`pay.state.${bill.state}`, {
    amount: rupees(bill.state === 'paid' ? bill.paid : bill.due),
    reason: bill.freeReason ? t(`pay.free.${bill.freeReason}`) : '',
  })
}

// The pay sheet. Demo: a dummy UPI screen. Test/live: Razorpay checkout.
export function PayPanel({ open, onClose, p, secret, due, onPaid }) {
  const { t, lang } = useI18n()
  const [step, setStep] = useState('start')
  const [mode, setMode] = useState('demo')
  const [intent, setIntent] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep('start')
    setError('')
    paymentConfig().then((c) => setMode(c.mode))
  }, [open])

  const finish = (r) => {
    setResult(r)
    setStep('done')
    onPaid?.(r)
  }
  const fail = (err) => {
    setError(err.message)
    setStep('error')
  }

  const begin = async () => {
    setStep('working')
    try {
      const it = await startPayment(p, secret, due)
      setIntent(it)
      setMode(it.mode)
      if (it.mode === 'demo') return setStep('demo')
      const resp = await razorpayCheckout(it, { title: t('app.hospital'), description: t('pay.forToken', { token: p.token }), lang })
      if (!resp) return setStep('start')
      finish(await confirmPayment(p, secret, it, resp))
    } catch (err) {
      fail(err)
    }
  }

  const demoPaid = async () => {
    setStep('working')
    try {
      finish(await confirmPayment(p, secret, intent))
    } catch (err) {
      fail(err)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('pay.title')}>
      <div className="space-y-4">
        {mode !== 'live' && (
          <p className="flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-base font-semibold">
            <Icon name="info" size={22} />
            {t(mode === 'test' ? 'pay.modeTest' : 'pay.modeDemo')}
          </p>
        )}
        {(step === 'start' || step === 'working') && (
          <>
            <p className="text-lg">{t('pay.forToken', { token: p.token })}</p>
            <p className="text-5xl font-extrabold">{rupees(due)}</p>
            <Button icon="rupee" className="w-full text-xl" onClick={begin} disabled={step === 'working'}>
              {step === 'working' ? t('pay.working') : t('pay.payNow', { amount: rupees(due) })}
            </Button>
            <p className="text-base text-ink-2">{t('pay.orCounter')}</p>
          </>
        )}
        {step === 'demo' && intent && (
          <>
            <p className="text-lg">{t('pay.scan')}</p>
            <div className="flex justify-center">
              <QRCode text={intent.upi} size={200} label={t('pay.qrLabel', { amount: rupees(intent.amount) })} />
            </div>
            <p className="text-center text-base text-ink-2">
              {t('pay.payee', { name: intent.payee?.name || '', vpa: intent.payee?.vpa || '' })}
            </p>
            <a
              href={intent.upi}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-ink/60 bg-card px-4 text-lg font-semibold no-underline"
            >
              <Icon name="phone" />
              {t('pay.openApp')}
            </a>
            <Notice kind="warn">{t('pay.demoNote')}</Notice>
            <Button icon="check" className="w-full text-xl" onClick={demoPaid}>
              {t('pay.iPaid')}
            </Button>
          </>
        )}
        {step === 'done' && (
          <Notice kind="ok" title={result?.receipt ? t('pay.done', { amount: rupees(result.amount), receipt: result.receipt }) : t('pay.alreadyPaid')} live />
        )}
        {step === 'error' && (
          <>
            <Notice kind="danger" title={t('pay.failed')} live>
              {error}
            </Notice>
            <Button variant="secondary" icon="refresh" className="w-full" onClick={begin}>
              {t('pay.tryAgain')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

function printOne(id) {
  const el = document.getElementById(id)
  if (!el) return
  document.body.classList.add('print-receipt')
  el.setAttribute('data-printing', '')
  const done = () => {
    document.body.classList.remove('print-receipt')
    el.removeAttribute('data-printing')
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  window.print()
}

// One receipt, printable and savable as a picture.
export function ReceiptCard({ r, p, lang }) {
  const { t } = useI18n(lang)
  const id = `receipt-${r.receipt}`
  const mode = r.items[0]?.mode
  const when = `${dateKey(r.at)} ${fmtTime(r.at)}`
  const save = () =>
    saveSlipImage(
      {
        hospital: t('app.hospital'),
        title: `${t('pay.receipt')} ${r.receipt}${markKey[mode] ? ` · ${t(markKey[mode])}` : ''}`,
        tokenLabel: t('slip.token'),
        token: p.token,
        rows: [
          ...r.items.map((i) => [itemName(i, t), `${rupees(i.amount)}${i.status === 'refunded' ? ` (${t('pay.refunded')})` : ''}`]),
          [t('pay.total'), rupees(r.total)],
          [t('pay.paidBy'), `${t(`pay.method.${r.method}`)} · ${when}`],
        ],
        qrText: turnUrl(p.token),
        qrCaption: t('slip.qr'),
        note: t('pay.stampPaid'),
      },
      `receipt-${r.receipt}.png`,
    )
  return (
    <section id={id} lang={lang} className="relative rounded-3xl border-4 border-ink bg-card p-5" aria-label={t('pay.receiptNo', { receipt: r.receipt })}>
      <div className="pr-28">
        <p className="text-base font-semibold text-ink-2">{t('app.hospital')}</p>
        <h3 className="text-2xl font-bold">{t('pay.receiptNo', { receipt: r.receipt })}</h3>
      </div>
      <p className="text-lg">
        {t('slip.token')}: <span className="font-mono font-bold">{p.token}</span> · {when}
      </p>
      {markKey[mode] && <p className="mt-1 inline-block rounded-lg bg-warn px-2 font-bold text-warn-ink">{t(markKey[mode])}</p>}
      <ul className="mt-3 divide-y-2 divide-line border-y-2 border-line">
        {r.items.map((i) => (
          <li key={i.id} className={`flex justify-between gap-3 py-2 text-lg ${i.status === 'refunded' ? 'line-through' : ''}`}>
            <span>{itemName(i, t)}</span>
            <span className="tabular-nums">{rupees(i.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between text-xl font-bold">
        <span>{t('pay.total')}</span>
        <span className="tabular-nums">{rupees(r.total)}</span>
      </p>
      <p className="text-base text-ink-2">
        {t('pay.paidBy')}: {t(`pay.method.${r.method}`)}
        {r.ref ? ` · ${r.ref}` : ''}
      </p>
      <p aria-hidden="true" className="absolute right-4 top-4 rotate-12 rounded-lg border-4 border-ok px-2 text-2xl font-extrabold text-ok">
        {t('pay.stampPaid')}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 print:hidden">
        <Button variant="secondary" icon="print" onClick={() => printOne(id)}>
          {t('pay.printReceipt')}
        </Button>
        <Button variant="secondary" icon="download" onClick={save}>
          {t('pay.saveReceipt')}
        </Button>
      </div>
    </section>
  )
}

export function Receipts({ p, own, lang }) {
  const { t } = useI18n(lang)
  const list = receiptsOf(own)
  if (!list.length) return null
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold">{t('pay.receipts')}</h2>
      {list.map((r) => (
        <ReceiptCard key={r.receipt} r={r} p={p} lang={lang} />
      ))}
    </section>
  )
}
