import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { translate } from '../i18n/index.js'
import { fmtTime, dateKey } from '../lib/clock.js'
import { roomFloorText, doctorNames, patientName } from '../lib/text.js'
import { billSummary, receiptsOf } from '../lib/billing.js'
import { printSlips } from '../lib/actions.js'
import { billText } from './Payment.jsx'

// The paper OPD slip the doctor writes on, for someone who registered on a
// phone: black on white, one per page, with room for the prescription. In
// the patient's language, like the slip the counter prints.
export function PaperSlip({ p, at }) {
  const t = (k, v) => translate(p.lang, k, v)
  const fee = billText(billSummary(p), t)
  const receipt = receiptsOf(p).at(-1)?.receipt
  const copy = (p.slip?.copies || 0) + 1
  const row = (label, value) => (
    <div className="flex gap-2 border-b border-black/40 py-1.5">
      <dt className="w-32 shrink-0">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  )
  return (
    <section className="paper-slip bg-white p-6 text-black" lang={p.lang}>
      <header className="flex items-start justify-between gap-4 border-b-4 border-black pb-2">
        <div>
          <p className="text-xl font-bold">{t('app.hospital')}</p>
          <p>{t('slip.title')}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-4xl font-extrabold leading-none">{p.token}</p>
          <p className="mt-1">
            {t('paper.date')}: {dateKey(at)} {fmtTime(at)}
          </p>
        </div>
      </header>
      <dl className="mt-2 text-lg">
        {row(t('slip.name'), patientName(p, p.lang))}
        {row(t('paper.ageSex'), `${p.age ?? '—'} / ${p.gender ? t(`gender.${p.gender}`) : '—'}`)}
        {row(t('paper.dept'), t(`depts.${p.dept}.name`))}
        {row(t('paper.room'), `${roomFloorText(p.dept, t)} · ${doctorNames(p.dept, p.lang)}`)}
        {fee && row(t('pay.fee'), receipt ? `${fee} · ${t('pay.receipt')} ${receipt}` : fee)}
      </dl>
      <p className="mt-2 text-sm">
        {t('paper.viaPhone', { time: fmtTime(p.arrivedAt || p.createdAt) })}
        {copy > 1 && ` ${t('paper.copy', { n: copy })}`}
      </p>
      <p className="mt-6 text-lg font-bold">{t('paper.notes')}</p>
      <div className="mt-1" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[9mm] border-b border-black/40" />
        ))}
      </div>
      <footer className="mt-6 grid grid-cols-2 gap-6 text-lg">
        <p className="border-t border-black pt-1">{t('paper.nextVisit')}</p>
        <p className="border-t border-black pt-1">{t('paper.sign')}</p>
      </footer>
    </section>
  )
}

// Prints a batch of paper slips (one per page), then records them as
// printed. They print from outside the app, so nothing else is on the paper.
export function useSlipPrinter(now) {
  const [job, setJob] = useState(null)
  useEffect(() => {
    if (!job) return
    const done = () => {
      document.body.classList.remove('print-batch')
      window.removeEventListener('afterprint', done)
      setJob((j) => (j === job ? null : j))
    }
    document.body.classList.add('print-batch')
    window.addEventListener('afterprint', done)
    window.print()
    printSlips(job.list.map((p) => p.id))
    return () => window.removeEventListener('afterprint', done)
  }, [job])
  const print = (list) => list.length && setJob({ list, at: now })
  const sheet =
    job &&
    createPortal(
      <div id="print-batch">
        {job.list.map((p) => (
          <PaperSlip key={p.id} p={p} at={job.at} />
        ))}
      </div>,
      document.body,
    )
  return [print, sheet]
}
