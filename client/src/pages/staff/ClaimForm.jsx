import { useState } from 'react'
import { api } from '../../lib/auth.js'
import { isOpen, whoseTurn } from '../../lib/claims.js'
import { rupees } from '../../lib/billing.js'
import { patientName } from '../../lib/text.js'
import { PACKAGES, packageById, WARDS } from '../../data/pmjay.js'
import { departments } from '../../data/departments.js'
import { Button, Modal, Notice, Segmented } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'

export const input = 'w-full rounded-xl border border-line bg-card px-3 min-h-12 text-base'
export const label = 'mb-1 block text-sm font-semibold text-ink-2'

// Anyone at the hospital today (in the line, with the doctor, or seen) without
// an open claim can be admitted under PM-JAY. Not a booking still at home.
export const canAdmit = (p) => ['waiting', 'called', 'done', 'emergency'].includes(p.status) && !(p.claim && isOpen(p.claim))
// The counter already saw their PM-JAY card (for the free OPD visit).
export const cardChecked = (p) => p?.waiver?.card === 'pmjay' && p.waiver.status === 'approved'

export const claimError = (err, t) => (err.code ? t(`claims.err.${err.code}`) : err.message)
// A step as something that happened (the cancel button reads "Cancel this claim").
export const stepDone = (step, t) => (step === 'cancel' ? t('claims.stage.cancelled') : t(`claims.step.${step}`))

const STAGE_TONE = {
  paid: 'bg-ok-soft text-ok',
  preauthRejected: 'bg-danger-soft text-danger',
  claimRejected: 'bg-danger-soft text-danger',
  cancelled: 'bg-page text-ink-2',
}
const TURN_TONE = { us: 'bg-warn-soft', ward: 'bg-brand-soft text-brand', pmjay: 'bg-page' }

export function StageChip({ stage, t, className = '' }) {
  const tone = STAGE_TONE[stage] || TURN_TONE[whoseTurn({ stage })]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${tone} ${className}`}>{t(`claims.stage.${stage}`)}</span>
}

// Start a claim: the patient is admitted and pre-auth has been asked for.
// `patient` fixes who it is for (from the Dashboard); otherwise pick from
// `patients`, or type in someone who is not in the OPD queue.
export default function ClaimForm({ patient, patients = [], t, lang, onClose, onDone }) {
  const [who, setWho] = useState(patient || patients.length > 0 ? 'opd' : 'other')
  const [pid, setPid] = useState(patient?.id || patients[0]?.id || '')
  const [f, setF] = useState({ name: '', age: '', gender: '', dept: 'MED', cardSeen: false })
  const [pkg, setPkg] = useState('')
  const [ward, setWard] = useState('')
  const [emergency, setEmergency] = useState(false)
  const [tms, setTms] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = patient || patients.find((p) => p.id === pid) || null
  const dept = who === 'opd' ? chosen?.dept : f.dept
  // The patient's own department first.
  const groups = [...departments].sort((a, b) => (b.id === dept) - (a.id === dept))

  // The server checks all of this too; checking here saves a round trip.
  const missing = () => {
    if (who === 'other') {
      if (!f.name.trim()) return 'name'
      if (f.age === '' || Number(f.age) > 120) return 'age'
      if (!f.gender) return 'gender'
    }
    if ((who === 'other' || !cardChecked(chosen)) && !f.cardSeen) return 'cardSeen'
    return null
  }
  const submit = async (e) => {
    e.preventDefault()
    const gap = missing()
    if (gap) return setErr(t(`claims.err.${gap}`))
    setErr('')
    setBusy(true)
    try {
      const body =
        who === 'opd'
          ? { pid: chosen?.id, cardSeen: f.cardSeen }
          : { name: f.name, age: f.age === '' ? null : Number(f.age), gender: f.gender, dept: f.dept, cardSeen: f.cardSeen }
      const { claim } = await api('/claims', { ...body, pkg, ward: ward || packageById[pkg]?.ward, emergency, tms })
      onDone?.(claim)
      onClose()
    } catch (e2) {
      setErr(claimError(e2, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={patient ? t('claims.form.titleFor', { token: patient.token }) : t('claims.form.title')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-base">{t('claims.form.intro')}</p>
        {!patient && (
          <Segmented
            value={who}
            onChange={setWho}
            options={[
              { value: 'opd', label: t('claims.form.fromOpd') },
              { value: 'other', label: t('claims.form.other') },
            ]}
          />
        )}
        {patient && (
          <p className="text-lg font-semibold">
            <span className="font-mono">{patient.token}</span> · {patientName(patient, lang)}
            {patient.age != null && `, ${patient.age}`}
          </p>
        )}
        {!patient && who === 'opd' && (
          patients.length ? (
            <div>
              <label htmlFor="claim-pid" className={label}>
                {t('claims.form.pickPatient')}
              </label>
              <select id="claim-pid" className={input} value={pid} onChange={(e) => setPid(e.target.value)}>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.token} · {patientName(p, lang)}
                    {p.age != null && `, ${p.age}`}
                    {cardChecked(p) && ` · ${t('claims.form.cardChecked')}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Notice kind="info">{t('claims.form.noneEligible')}</Notice>
          )
        )}
        {!patient && who === 'other' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="claim-name" className={label}>
                {t('claims.form.name')}
              </label>
              <input id="claim-name" className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={40} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="claim-age" className={label}>
                {t('claims.form.age')}
              </label>
              <input id="claim-age" className={input} inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
            </div>
            <div>
              <label htmlFor="claim-gender" className={label}>
                {t('claims.form.gender')}
              </label>
              <select id="claim-gender" className={input} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
                <option value="" />
                {['f', 'm', 'x'].map((g) => (
                  <option key={g} value={g}>
                    {t(`gender.${g}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="claim-dept" className={label}>
                {t('claims.form.dept')}
              </label>
              <select id="claim-dept" className={input} value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {t(`depts.${d.id}.name`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {(who === 'other' || (chosen && !cardChecked(chosen))) && (
          <label className="flex items-start gap-3 font-semibold">
            <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0" checked={f.cardSeen} onChange={(e) => setF({ ...f, cardSeen: e.target.checked })} />
            {t('claims.form.cardSeen')}
          </label>
        )}
        {who === 'opd' && cardChecked(chosen) && (
          <p className="flex items-center gap-2 text-base text-ok">
            <Icon name="check" size={20} />
            {t('claims.form.cardChecked')}
          </p>
        )}

        <div>
          <label htmlFor="claim-pkg" className={label}>
            {t('claims.form.pkg')}
          </label>
          <select
            id="claim-pkg"
            className={input}
            value={pkg}
            onChange={(e) => {
              setPkg(e.target.value)
              setWard('')
            }}
            aria-describedby="claim-pkg-hint"
          >
            <option value="">{t('claims.form.pickPkg')}</option>
            {groups.map((d) => (
              <optgroup key={d.id} label={t(`depts.${d.id}.name`)}>
                {PACKAGES.filter((x) => x.dept === d.id).map((x) => (
                  <option key={x.id} value={x.id}>
                    {t(`pmjay.packages.${x.id}`)} · {rupees(x.rate)} ({x.code})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p id="claim-pkg-hint" className="mt-1 text-sm text-ink-2">
            {t('claims.form.samplePkgs')}
          </p>
        </div>
        <div>
          <label htmlFor="claim-ward" className={label}>
            {t('claims.form.ward')}
          </label>
          <select id="claim-ward" className={input} value={ward || packageById[pkg]?.ward || ''} onChange={(e) => setWard(e.target.value)}>
            {!pkg && <option value="" />}
            {WARDS.map((w) => (
              <option key={w} value={w}>
                {t(`places.${w}.name`)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-start gap-3 font-semibold">
          <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />
          {t('claims.form.emergency')}
        </label>
        <div>
          <label htmlFor="claim-tms" className={label}>
            {t('claims.form.tms')}
          </label>
          <input id="claim-tms" className={input} value={tms} onChange={(e) => setTms(e.target.value)} maxLength={40} autoComplete="off" spellCheck={false} />
        </div>
        <Notice kind="info" icon="emergency">
          {t('claims.form.careFirst')}
        </Notice>
        {err && (
          <Notice kind="danger" live>
            {err}
          </Notice>
        )}
        <Button type="submit" icon="shield" className="w-full" disabled={busy || !pkg || (who === 'opd' && !chosen)}>
          {t('claims.form.start')}
        </Button>
      </form>
    </Modal>
  )
}
