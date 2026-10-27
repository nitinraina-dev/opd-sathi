import { useEffect, useState } from 'react'
import { api } from '../../lib/auth.js'
import { AUDIT_GROUPS } from '../../lib/permissions.js'
import { Button, Card, Notice } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import { useStaffI18n } from './StaffLayout.jsx'
import { stepDone } from './ClaimForm.jsx'
import { signalName } from '../../lib/text.js'

// One activity-log entry in plain words, in the current language.
export function describe(e, t) {
  const d = e.detail || {}
  const where = d.where ? t(`places.${d.where}.name`) : t('staff.flagNoPlace')
  switch (e.action) {
    case 'registerPatient':
      return t('audit.registerPatient', { token: d.token, via: t(`audit.via.${d.via === 'counter' ? 'counter' : 'app'}`) })
    case 'callNext':
      return t(d.token ? 'audit.callNext' : 'audit.callNextNone', d)
    case 'setRoomStatus':
      return t(`audit.setRoomStatus_${d.status || 'available'}`, d)
    case 'setAutoRun':
      return t(d.on ? 'audit.setAutoRun_on' : 'audit.setAutoRun_off')
    case 'setArrival':
      return t(d.on ? 'audit.setArrival_on' : 'audit.setArrival_off')
    case 'setShareLoad':
      return t(d.on ? 'audit.setShareLoad_on' : 'audit.setShareLoad_off')
    case 'recordEmergency':
      return t(d.free ? 'audit.recordEmergencyFree' : d.amount ? 'audit.recordEmergency' : 'audit.recordEmergencyNoFee', { token: d.token, amount: `₹${d.amount}` })
    case 'setEmergencyFee':
      return t('audit.setEmergencyFee', { amount: `₹${d.amount}` })
    case 'checkIn':
      return t(d.via === 'code' ? 'audit.checkInCode' : d.via === 'sms' ? 'audit.checkInSms' : 'audit.checkInCounter', d)
    case 'movePatient':
      return t('audit.movePatient', { ...d, dept: t(`depts.${d.dept}.name`) })
    case 'raiseFlag':
    case 'markFlagSeen':
      return t(`audit.${e.action}`, { where })
    case 'accountCreated':
      return t('audit.accountCreated', { username: d.username, role: t(`roles.${d.role}`) })
    case 'accountUpdated':
      return t('audit.accountUpdated', { username: d.username, fields: (d.fields || []).map((f) => t(`audit.field.${f}`)).join(', ') })
    case 'configChanged':
      return t('audit.configChanged', { fields: (d.fields || []).join(', ') })
    case 'payBill':
      return t('audit.payBill', {
        token: d.token,
        amount: `₹${d.amount}`,
        method: `${t(`pay.method.${d.method || 'cash'}`)}${d.mode && d.mode !== 'live' ? ` · ${d.mode}` : ''}`,
        receipt: d.receipt,
      })
    case 'decideWaiver':
      return t(d.approve ? 'audit.decideWaiver_ok' : 'audit.decideWaiver_no', { token: d.token, card: d.card ? t(`cards.${d.card}`) : '' })
    case 'addCharges':
      return t('audit.addCharges', { token: d.token, tests: (d.tests || []).map((x) => t(`fees.tests.${x}`)).join(', '), amount: `₹${d.amount}` })
    case 'refundItem':
      return t('audit.refundItem', { token: d.token, amount: `₹${d.amount}` })
    case 'paymentSettings':
      return t('audit.paymentSettings', { changed: (d.changed || []).join(', ') })
    case 'claimCreated':
      return t(d.emergency ? 'audit.claimCreatedEmergency' : 'audit.claimCreated', {
        claim: d.claim,
        token: d.token || t('claims.notOpd'),
        pkg: t(`pmjay.packages.${d.pkg}`),
      })
    case 'claimStep':
      return t(d.amount != null ? 'audit.claimStepAmount' : 'audit.claimStep', { claim: d.claim, step: stepDone(d.step, t), amount: `₹${d.amount}` })
    case 'signalAdded':
      return t('audit.signalAdded', { what: signalName(d, t), from: d.from, to: d.to, source: t(`audit.signalFrom.${d.source}`) })
    case 'signalRemoved':
    case 'signalDismissed':
      return t(`audit.${e.action}`, { what: signalName(d, t) })
    case 'claimSamples':
      return t(d.n ? 'audit.claimSamplesAdded' : 'audit.claimSamplesRemoved', d)
    default:
      return t(`audit.${e.action}`, d)
  }
}

const when = (at) => {
  const d = new Date(at)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function downloadCsv(entries, t) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [
    [t('audit.when'), t('audit.who'), t('accounts.role'), t('audit.what')],
    ...entries.map((e) => [when(e.at), e.actor === 'public' ? t('audit.public') : e.actor, e.role, describe(e, t)]),
  ]
  // The BOM lets spreadsheet apps read Hindi text correctly.
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'opd-saathi-activity.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export default function Activity() {
  const { t } = useStaffI18n()
  const [group, setGroup] = useState('')
  const [actor, setActor] = useState('')
  const [data, setData] = useState({ entries: [], actors: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const load = () =>
      api(`/audit?limit=300${group ? `&group=${group}` : ''}${actor ? `&actor=${encodeURIComponent(actor)}` : ''}`)
        .then((d) => alive && (setData(d), setError('')))
        .catch((err) => alive && setError(err.message))
    load()
    const id = setInterval(load, 10000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [group, actor])

  const select = 'min-h-11 rounded-xl border border-line bg-card px-3 text-base'
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Icon name="flag" size={34} />
        {t('audit.title')}
      </h1>
      <p className="text-lg text-ink-2">{t('audit.intro')}</p>
      <ScreenGuide id="activity" items={['read']} t={t} />
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="audit-group" className="block text-lg font-semibold">
            {t('audit.group')}
          </label>
          <select id="audit-group" value={group} onChange={(e) => setGroup(e.target.value)} className={select}>
            <option value="">{t('audit.groups.all')}</option>
            {Object.keys(AUDIT_GROUPS).map((g) => (
              <option key={g} value={g}>
                {t(`audit.groups.${g}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-actor" className="block text-lg font-semibold">
            {t('audit.person')}
          </label>
          <select id="audit-actor" value={actor} onChange={(e) => setActor(e.target.value)} className={select}>
            <option value="">{t('audit.everyone')}</option>
            {data.actors.map((a) => (
              <option key={a} value={a}>
                {a === 'public' ? t('audit.public') : a}
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" icon="download" className="ml-auto" onClick={() => downloadCsv(data.entries, t)} disabled={!data.entries.length}>
          {t('audit.download')}
        </Button>
      </Card>
      {error && <Notice kind="danger">{error}</Notice>}
      {!data.entries.length ? (
        <p className="text-lg">{t('audit.empty')}</p>
      ) : (
        <ol className="space-y-2">
          {data.entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl border border-line bg-card p-3">
              <span className="font-mono text-base tabular-nums text-ink-2">{when(e.at)}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
                <Icon name={e.actor === 'public' ? 'person' : 'badge'} size={20} />
                <span className="break-all">{e.actor === 'public' ? t('audit.public') : e.actor}</span>
                {e.actor !== 'public' && e.role && <span className="rounded-full bg-brand-soft px-2 text-base font-normal">{t(`roles.${e.role}`)}</span>}
              </span>
              <span className="min-w-[min(100%,14rem)] flex-1 break-words text-lg">{describe(e, t)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
