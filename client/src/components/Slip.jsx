import { useMemo } from 'react'
import Icon from './Icon.jsx'
import { qrPath, turnUrl } from '../lib/qr.js'
import { translate } from '../i18n/index.js'
import { deptById } from '../data/departments.js'
import { aheadOf, estimateWait } from '../lib/queue.js'
import { fmtTime } from '../lib/clock.js'
import { roomFloorText, waitText, doctorNames } from '../lib/text.js'
import { nameFor } from '../lib/mine.js'
import { billFor } from '../lib/billing.js'
import { billText } from './Payment.jsx'
import { saveSlipImage } from '../lib/slipImage.js'

export function QRCode({ text, size = 176, label }) {
  const { n, d } = useMemo(() => qrPath(text), [text])
  return (
    <svg
      viewBox={`-4 -4 ${n + 8} ${n + 8}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="block"
    >
      <rect x="-4" y="-4" width={n + 8} height={n + 8} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  )
}

// Everything the slip shows, already in the chosen language.
export function slipInfo(state, p, lang, now) {
  const t = (k, v) => translate(lang, k, v)
  const ahead = aheadOf(state, p)
  const wait = estimateWait(state, p.dept, ahead, now)
  return {
    t,
    token: p.token,
    name: nameFor(state, p, lang),
    dept: t(`depts.${p.dept}.name`),
    room: roomFloorText(p.dept, t),
    doctor: doctorNames(p.dept, lang),
    ahead,
    wait: waitText(wait, t),
    time: fmtTime(p.createdAt),
    status: p.status,
  }
}

export function saveSlip(info) {
  const { t } = info
  saveSlipImage(
    {
      hospital: `${t('app.hospital')} · ${t('app.name')}`,
      title: t('slip.title'),
      tokenLabel: t('slip.token'),
      token: info.token,
      rows: [
        [t('slip.name'), info.name],
        [t('slip.dept'), info.dept],
        [t('slip.room'), info.room],
        [t('slip.doctor'), info.doctor],
        [t('slip.ahead'), String(info.ahead)],
        [t('slip.wait'), info.wait],
      ],
      qrText: turnUrl(info.token),
      qrCaption: t('slip.qr'),
      note: t('slip.note'),
    },
    `opd-slip-${info.token}.png`,
  )
}

// The OPD slip. Personal details: first name only (no age, phone or ID).
export default function SlipCard({ state, p, lang, now, own }) {
  const info = slipInfo(state, p, lang, now)
  const fee = billText(billFor(p, own), info.t)
  const { t } = info
  const item = (label, value, wide) => (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-sm text-ink/70">{label}</dt>
      <dd className="font-semibold leading-snug break-words">{value}</dd>
    </div>
  )
  return (
    <section id="slip" lang={lang} className="ticket @container px-5 pb-5 pt-4" aria-label={t('slip.title')}>
      <p className="text-sm font-semibold text-ink/70">{t('app.hospital')}</p>
      <p className="text-sm text-ink/70">{t('slip.title')}</p>
      <p className="token-num my-2 whitespace-nowrap leading-none" style={{ fontSize: 'min(3.25rem, 19cqi)' }}>
        {p.token}
      </p>
      {info.name && <p className="text-lg font-semibold">{info.name}</p>}
      <dl className="ticket-cut mt-4 grid grid-cols-2 gap-x-4 gap-y-3 pt-4">
        {item(t('slip.dept'), info.dept, true)}
        {item(t('slip.room'), info.room, true)}
        {item(t('slip.doctor'), info.doctor, true)}
        {p.status === 'booked' && item(t('slip.place'), t('checkin.notYet'), true)}
        {p.status === 'waiting' && item(t('slip.ahead'), String(info.ahead))}
        {p.status === 'waiting' && item(t('slip.wait'), info.wait)}
        {fee && item(t('pay.fee'), fee, true)}
      </dl>
      <div className="mt-4 flex items-center gap-4">
        <div className="shrink-0 rounded-lg bg-white p-1">
          <QRCode text={turnUrl(p.token)} size={104} label={t('slip.qrLabel', { token: p.token })} />
        </div>
        <div className="space-y-1 text-sm text-ink/80">
          <p>{t('slip.qr')}</p>
          <p>{t('slip.registered', { time: info.time })}</p>
          <p>{t('slip.note')}</p>
        </div>
      </div>
    </section>
  )
}

// Large type for showing the slip to staff (patient's language and English).
export function StaffView({ p, lang, name }) {
  const t = (k, v) => translate(lang, k, v)
  const en = (k, v) => translate('en', k, v)
  return (
    <div className="space-y-4 text-center">
      <p className="whitespace-nowrap font-mono font-extrabold leading-none" style={{ fontSize: 'min(5rem, 15vw)' }}>
        {p.token}
      </p>
      {name && <p className="text-4xl font-bold">{name}</p>}
      <p className="text-3xl font-bold">{t(`depts.${p.dept}.name`)}</p>
      <p className="text-3xl">{roomFloorText(p.dept, t)}</p>
      {lang !== 'en' && (
        <div lang="en" className="border-t-2 border-line pt-3">
          <p className="text-2xl font-bold">{en(`depts.${p.dept}.name`)}</p>
          <p className="text-2xl">{roomFloorText(p.dept, en)}</p>
        </div>
      )}
    </div>
  )
}
