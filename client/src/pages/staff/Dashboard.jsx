import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useHospital, useSimNow, useMode } from '../../lib/store.js'
import {
  callNext,
  markNoShow,
  sendToEnd,
  movePatient,
  setRoomStatus,
  markFlagSeen,
  addSamplePatients,
  setSpeed,
  setAutoRun,
  setArrival,
  setShareLoad,
  resetAll,
  simTick,
  reportsReady,
  checkIn,
} from '../../lib/actions.js'
import { deptSummary, roomState, servingIn, totalWaiting, crowdLevel, reportsState, slipState } from '../../lib/queue.js'
import { estimateAccuracy, feedbackSummary } from '../../lib/impact.js'
import { SCORES, SCORE_ICON } from '../../data/feedback.js'
import { hm, minutesOfDay } from '../../lib/clock.js'
import { chime, unlockAudio, audioReady } from '../../lib/sound.js'
import { departments } from '../../data/departments.js'
import { waitingAreas } from '../../data/hospital.js'
import { doctorOf, patientName, genderIcon } from '../../lib/text.js'
import { Button, Card, LevelChip, Meter, Toggle, Notice, Modal } from '../../components/ui.jsx'
import BillChip from '../../components/BillChip.jsx'
import ClaimForm, { StageChip, canAdmit } from './ClaimForm.jsx'
import PayButtons from './PayButtons.jsx'
import { BusyBanner } from './Alerts.jsx'
import { NearbyStaff } from '../../components/Nearby.jsx'
import { setupDemo } from '../../lib/demo.js'
import { addCharges } from '../../lib/actions.js'
import { billSummary, rupees } from '../../lib/billing.js'
import { TESTS } from '../../data/fees.js'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import { useStaffI18n, useCan } from './StaffLayout.jsx'

// Only one open dashboard runs the demo doctors (a browser lock picks it).
function useSimLeader() {
  useEffect(() => {
    let timer = null
    let release = null
    const ctl = new AbortController()
    const run = () => {
      timer = setInterval(simTick, 1000)
    }
    if (navigator.locks?.request) {
      navigator.locks
        .request('opd-saathi-sim', { signal: ctl.signal }, () => {
          run()
          return new Promise((r) => {
            release = r
          })
        })
        .catch(() => {})
    } else run()
    return () => {
      ctl.abort()
      release?.()
      clearInterval(timer)
    }
  }, [])
}

// Repeat an alarm while there are unseen urgent flags.
function useAlarm(count) {
  useEffect(() => {
    if (!count) return
    chime('alarm')
    const id = setInterval(() => chime('alarm'), 5000)
    return () => clearInterval(id)
  }, [count])
}

function ago(ms, t) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return t('staff.secondsAgo', { n: s })
  return t('staff.minutesAgo', { n: Math.round(s / 60) })
}

function Flags({ flags, t }) {
  const unseen = flags.filter((f) => !f.seen)
  const seen = flags.filter((f) => f.seen).slice(0, 3)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (!flags.length) return null
  return (
    <section aria-labelledby="flags-h" className="space-y-2">
      <h2 id="flags-h" className="sr-only">
        {t('staff.flagsTitle')}
      </h2>
      <div role="alert" className={`space-y-2 ${unseen.length ? 'sticky top-0 z-20 bg-page py-1' : ''}`}>
        {unseen.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-2xl border-4 border-danger bg-danger p-4 text-danger-ink">
            <Icon name="hand" size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-extrabold">{t('staff.flagTitle')}</p>
              <p className="text-lg">
                {f.token ? `${f.token} · ${f.name}` : f.name || t('staff.flagUnknown')}
                {' · '}
                {f.where ? t(`places.${f.where}.name`) : t('staff.flagNoPlace')}
                {' · '}
                {ago(Date.now() - f.at, t)}
                {f.by === 'helper' && ` · ${t('staff.flagHelper')}`}
              </p>
            </div>
            <Button variant="secondary" icon="check" onClick={() => markFlagSeen(f.id)}>
              {t('staff.markSeen')}
            </Button>
          </div>
        ))}
      </div>
      {seen.length > 0 && (
        <ul className="space-y-1 text-base text-ink-2">
          {seen.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <Icon name="check" size={20} />
              {t('staff.flagSeenLine', {
                who: f.token || f.name || t('staff.flagUnknown'),
                place: f.where ? t(`places.${f.where}.name`) : t('staff.flagNoPlace'),
                ago: ago(Date.now() - f.seenAt, t),
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DoctorStatus({ room, st, now, t, disabled }) {
  const setStatus = (status) => {
    if (status === 'available') setRoomStatus(room, { status: 'available' })
    if (status === 'break') {
      const m = Math.ceil((minutesOfDay(now) + 30) / 5) * 5
      setRoomStatus(room, { status: 'break', until: st.status === 'break' && st.until ? st.until : hm(m) })
    }
    if (status === 'late') setRoomStatus(room, { status: 'late', lateBy: st.lateBy || 15 })
  }
  const on = (s) => (s === 'available' ? 'bg-brand-soft text-brand' : 'bg-warn-soft text-ink')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label={t('staff.doctorStatus', { room })} className="inline-flex rounded-xl border border-line bg-card p-0.5">
        {['available', 'break', 'late'].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={st.status === s}
            disabled={disabled}
            onClick={() => setStatus(s)}
            className={`flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold disabled:opacity-45 ${
              st.status === s ? on(s) : 'text-ink-2 hover:text-ink'
            }`}
          >
            <Icon name={s === 'available' ? 'check' : s === 'break' ? 'clock' : 'alert'} size={16} />
            {t(`staff.status.${s}`)}
          </button>
        ))}
      </div>
      {st.status === 'break' && (
        <label className="flex items-center gap-2 text-sm">
          <span>{t('staff.breakUntil')}</span>
          <input
            type="time"
            value={st.until}
            disabled={disabled}
            onChange={(e) => e.target.value && setRoomStatus(room, { status: 'break', until: e.target.value })}
            className="min-h-9 rounded-lg border border-line bg-card px-2 text-base"
          />
        </label>
      )}
      {st.status === 'late' && (
        <label className="flex items-center gap-2 text-sm">
          <span>{t('staff.lateBy')}</span>
          <select
            value={st.lateBy}
            disabled={disabled}
            onChange={(e) => setRoomStatus(room, { status: 'late', lateBy: Number(e.target.value) })}
            className="min-h-9 rounded-lg border border-line bg-card px-2 text-base"
          >
            {[5, 10, 15, 20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {t('common.minutes', { n })}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

// Take cash, or decide on a free-care card, for one patient.
function AddTests({ p, t, onClose }) {
  const [pick, setPick] = useState([])
  const b = billSummary(p)
  const free = b.freeReason || p.waiver?.status === 'approved'
  const total = TESTS.filter((x) => pick.includes(x.id)).reduce((a, x) => a + x.fee, 0)
  return (
    <Modal open onClose={onClose} title={t('staff.addTestsTitle', { token: p.token })}>
      <div className="space-y-3">
        <div className="grid gap-2">
          {TESTS.map((x) => {
            const on = pick.includes(x.id)
            return (
              <button
                key={x.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setPick(on ? pick.filter((y) => y !== x.id) : [...pick, x.id])}
                className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-lg ${on ? 'border-brand bg-brand-soft' : 'border-line bg-card'}`}
              >
                <Icon name={on ? 'check' : 'plus'} size={24} />
                <span className="flex-1">{t(`fees.tests.${x.id}`)}</span>
                <span className="tabular-nums">{rupees(x.fee)}</span>
              </button>
            )
          })}
        </div>
        <p className="text-lg font-semibold">{free ? t('staff.freePatient') : t('staff.testsTotal', { amount: rupees(total) })}</p>
        <Button
          icon="check"
          className="w-full"
          disabled={!pick.length}
          onClick={() => {
            addCharges(p.id, pick)
            onClose()
          }}
        >
          {t('staff.addToBill')}
        </Button>
      </div>
    </Modal>
  )
}

// Back from the tests with the reports (goes in near the front).
function BackChip({ p, t }) {
  if (reportsState(p) !== 'back') return null
  return (
    <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2 text-base text-brand">
      <Icon name="lab" size={18} />
      {t('staff.backWithReports')}
    </span>
  )
}

// Registered on a phone: where their paper slip is (the doctor writes on it).
function SlipChip({ p, t }) {
  const st = slipState(p)
  if (!st) return null
  const ok = st === 'atRoom' || st === 'given'
  return (
    <span className={`flex items-center gap-1 rounded-full border-2 px-2 text-base font-semibold ${ok ? 'border-line' : 'border-warn bg-warn-soft'}`}>
      <Icon name={ok ? 'check' : 'slip'} size={18} />
      {t(`slips.state.${st}`)}
    </span>
  )
}

function QueueRow({ p, i, now, t, lang, allowed }) {
  const [to, setTo] = useState('')
  const waited = Math.max(0, Math.round((now - (p.reports?.backAt || p.createdAt)) / 60000))
  return (
    <li className="rounded-2xl border border-line bg-card p-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-base text-ink-2">#{i + 1}</span>
        <span className="font-mono text-xl font-bold">{p.token}</span>
        <span className="flex items-center gap-1 text-lg">
          <Icon name={genderIcon[p.gender] || 'person'} size={20} />
          {patientName(p, lang)}
          {p.age != null && `, ${p.age}`}
        </span>
        {p.assisted && (
          <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2 text-base">
            <Icon name="hand" size={18} />
            {t('staff.assisted')}
          </span>
        )}
        <BackChip p={p} t={t} />
        <SlipChip p={p} t={t} />
        <BillChip bill={billSummary(p)} t={t} />
        <span className="ml-auto text-base text-ink-2">{t('staff.waited', { n: waited })}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <PayButtons p={p} t={t} allowed={allowed} />
        <Button variant="secondary" icon="back" disabled={!allowed('sendToEnd')} onClick={() => sendToEnd(p.id)}>
          {t('staff.toEnd')}
        </Button>
        <label className="sr-only" htmlFor={`move-${p.id}`}>
          {t('staff.moveTo', { token: p.token })}
        </label>
        <select
          id={`move-${p.id}`}
          value={to}
          disabled={!allowed('movePatient')}
          onChange={(e) => setTo(e.target.value)}
          className="min-h-11 min-w-40 flex-1 rounded-xl border border-line bg-card px-2 text-base"
        >
          <option value="">{t('staff.movePick')}</option>
          {departments
            .filter((d) => d.id !== p.dept)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {t(`depts.${d.id}.name`)}
              </option>
            ))}
        </select>
        <Button variant="secondary" icon="next" disabled={!to} onClick={() => to && movePatient(p.id, to)}>
          {t('staff.move')}
        </Button>
      </div>
    </li>
  )
}

function DeptCard({ s, state, now, t, lang, allowed }) {
  const d = s.dept
  const [open, setOpen] = useState(false)
  const [testsFor, setTestsFor] = useState(null)
  const [admitFor, setAdmitFor] = useState(null)
  const { mode } = useMode()
  const booked = Object.values(state.patients).filter((p) => p.dept === d.id && p.status === 'booked').length
  const atTests = Object.values(state.patients).filter((p) => p.dept === d.id && p.status === 'done' && ['pending', 'ready'].includes(reportsState(p)))
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name={d.icon} size={32} />
        <h3 className="text-lg font-semibold">{t(`depts.${d.id}.name`)}</h3>
        <span className="rounded-lg border border-line px-2 font-mono font-bold">{d.code}</span>
        <LevelChip
          className="ml-auto"
          level={s.crowd}
          label={`${t(`crowdLive.${s.crowd}`)} · ${t('staff.seats', { n: s.waiting.length, seats: d.seats })}`}
        />
      </div>
      {booked > 0 && (
        <p className="flex items-center gap-2 text-base text-ink-2">
          <Icon name="phone" size={18} />
          {t('staff.bookedNotHere', { n: booked })}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
        <div className="flex flex-col justify-between">
          <dt className="text-ink-2">{t('staff.waiting')}</dt>
          <dd className="text-2xl font-bold">{s.waiting.length}</dd>
        </div>
        <div className="flex flex-col justify-between">
          <dt className="text-ink-2">{t('staff.avgWait')}</dt>
          <dd className="text-2xl font-bold">{t('common.minutes', { n: s.avgWait })}</dd>
        </div>
        <div className="flex flex-col justify-between">
          <dt className="text-ink-2">{t('staff.newWait')}</dt>
          <dd className="text-2xl font-bold">{t('common.minutes', { n: s.newWait })}</dd>
        </div>
        <div className="flex flex-col justify-between">
          <dt className="text-ink-2">{t('staff.avgConsult')}</dt>
          <dd className="text-2xl font-bold">{t('common.minutes', { n: s.timing.avg.toFixed(1) })}</dd>
        </div>
      </dl>
      {d.rooms.map((r) => {
        const cur = servingIn(state, r.room)
        const st = roomState(state, r.room, now)
        return (
          <div key={r.room} className="space-y-2.5 rounded-2xl border border-line bg-page p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="mr-auto flex flex-wrap items-baseline gap-x-2">
                <span className="text-lg font-bold">{t('common.room', { n: r.room })}</span>
                <span className="text-sm text-ink-2">{doctorOf(r.room, lang)}</span>
              </p>
              <DoctorStatus room={r.room} st={st} now={now} t={t} disabled={!allowed('setRoomStatus')} />
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg">
              <span className="text-base text-ink-2">{t('staff.now')}</span>
              <span className="font-mono text-2xl font-bold">{cur ? cur.token : '—'}</span>
              {cur && (
                <span>
                  {patientName(cur, lang)}
                  {cur.age != null && `, ${cur.age}`}
                </span>
              )}
              {cur && <BackChip p={cur} t={t} />}
              {cur && <SlipChip p={cur} t={t} />}
              {cur && <BillChip bill={billSummary(cur)} t={t} />}
              {cur && mode === 'server' && cur.claim && (
                <Link to="/staff/claims" className="no-underline">
                  <StageChip stage={cur.claim.stage} t={t} className="gap-1" />
                </Link>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button icon="bell" onClick={() => callNext(r.room)} disabled={!allowed('callNext') || (!s.waiting.length && !cur)}>
                {t('staff.callNext')}
              </Button>
              <Button variant="secondary" icon="close" onClick={() => markNoShow(r.room)} disabled={!allowed('markNoShow') || !cur}>
                {t('staff.noShow')}
              </Button>
              {cur && <PayButtons p={cur} t={t} allowed={allowed} />}
              {cur && allowed('addCharges') && (
                <Button variant="secondary" icon="lab" onClick={() => setTestsFor(cur.id)}>
                  {t('staff.addTests')}
                </Button>
              )}
              {cur && mode === 'server' && canAdmit(cur) && allowed('claimEdit') && (
                <Button variant="secondary" icon="shield" onClick={() => setAdmitFor(cur.id)}>
                  {t('claims.admit')}
                </Button>
              )}
            </div>
          </div>
        )
      })}
      {atTests.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-line p-3">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="lab" size={20} />
            {t('staff.atTests', { n: atTests.length })}
          </p>
          <ul className="space-y-2">
            {atTests.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="font-mono text-lg font-bold">{p.token}</span>
                <span>{patientName(p, lang)}</span>
                <span className="text-base text-ink-2">
                  {(p.reports?.tests || []).map((x) => t(`fees.tests.${x}`)).join(', ')}
                  {reportsState(p) === 'ready' && ` · ${t('staff.readyNotBack')}`}
                </span>
                <span className="ml-auto flex flex-wrap gap-2">
                  {reportsState(p) === 'pending' && (
                    <Button variant="secondary" icon="check" disabled={!allowed('reportsReady')} onClick={() => reportsReady(p.id)}>
                      {t('staff.reportsReady')}
                    </Button>
                  )}
                  <Button variant="secondary" icon="users" disabled={!allowed('checkIn')} onClick={() => checkIn(p.id).catch(() => null)}>
                    {t('staff.backWithReports')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {testsFor && state.patients[testsFor] && <AddTests p={state.patients[testsFor]} t={t} onClose={() => setTestsFor(null)} />}
      {admitFor && state.patients[admitFor] && <ClaimForm patient={state.patients[admitFor]} t={t} lang={lang} onClose={() => setAdmitFor(null)} />}
      {s.waiting.length > 0 && (
        <div>
          <Button variant="ghost" icon={open ? 'minus' : 'plus'} onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? t('staff.hideQueue') : t('staff.showQueue', { n: s.waiting.length })}
          </Button>
          {open && (
            <ol className="mt-2 space-y-2">
              {s.waiting.map((p, i) => (
                <QueueRow key={p.id} p={p} i={i} now={now} t={t} lang={lang} allowed={allowed} />
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  )
}

// How the day is going for patients: were the waits we told them right, and
// what they said about the visit.
function TodayCard({ state, t }) {
  const est = estimateAccuracy(state)
  const fb = feedbackSummary(state)
  return (
    <Card className="grid gap-4 p-4 md:grid-cols-2">
      <h2 className="text-xl font-bold md:col-span-2">{t('today.title')}</h2>
      <div className="space-y-1">
        <p className="flex items-center gap-2 font-semibold">
          <Icon name="clock" size={20} />
          {t('today.estTitle')}
        </p>
        {est ? (
          <>
            <p className="text-lg">{t('today.est', { n: est.within5, total: est.total })}</p>
            <p className="text-base text-ink-2">{t('today.estOff', { m: est.avgOff })}</p>
          </>
        ) : (
          <p className="text-base text-ink-2">{t('today.estNone')}</p>
        )}
      </div>
      <div className="space-y-1">
        <p className="flex items-center gap-2 font-semibold">
          <Icon name="faceGood" size={20} />
          {t('today.fbTitle')}
        </p>
        {fb ? (
          <>
            <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label={t('today.fb', { good: fb.good, okay: fb.okay, bad: fb.bad })}>
              {SCORES.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <Icon name={SCORE_ICON[s]} size={26} className="text-brand" />
                  <span className="text-2xl font-bold">{fb[s]}</span>
                  <span className="text-base text-ink-2">{t(`feedback.score.${s}`)}</span>
                </li>
              ))}
            </ul>
            {fb.top && <p className="text-base text-ink-2">{t('today.fbTop', { reason: t(`feedback.reason.${fb.top}`) })}</p>}
          </>
        ) : (
          <p className="text-base text-ink-2">{t('today.fbNone')}</p>
        )}
      </div>
    </Card>
  )
}

// Open while the queue is empty (setting up a demo), folded away after.
function DemoControls({ state, t }) {
  const [confirm, setConfirm] = useState(false)
  const empty = Object.keys(state.patients).length === 0
  return (
    <details open={empty} className="group rounded-2xl border border-line bg-card p-4 [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center gap-2 text-lg font-semibold">
        <Icon name="bolt" />
        <span className="flex-1">{t('demo.title')}</span>
        <Icon name="next" size={18} className="transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-3 space-y-3">
      <p className="text-base text-ink-2">{t('demo.hint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button icon="bolt" onClick={() => setupDemo().catch(() => {})}>
          {t('demo.setup')}
        </Button>
        <Link to="/stage" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line px-4 font-semibold no-underline hover:border-brand">
          <Icon name="tv" size={20} />
          {t('demo.stage')}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon="users" onClick={() => addSamplePatients(20)}>
          {t('demo.add20')}
        </Button>
        <Button
          variant={state.clock.speed === 10 ? 'primary' : 'secondary'}
          icon="clock"
          aria-pressed={state.clock.speed === 10}
          onClick={() => setSpeed(state.clock.speed === 10 ? 1 : 10)}
        >
          {state.clock.speed === 10 ? t('demo.speedNormal') : t('demo.speed10')}
        </Button>
        {!confirm ? (
          <Button variant="dangerOutline" icon="refresh" onClick={() => setConfirm(true)}>
            {t('demo.reset')}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="danger"
              icon="check"
              onClick={() => {
                resetAll()
                setConfirm(false)
              }}
            >
              {t('demo.resetYes')}
            </Button>
            <Button variant="secondary" icon="close" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </div>
      <Toggle icon="doctor" label={t('demo.auto')} hint={t('demo.autoHint')} checked={state.autoRun} onChange={setAutoRun} />
      <Toggle icon="qr" label={t('demo.arrival')} hint={t('demo.arrivalHint')} checked={state.arrival !== false} onChange={setArrival} />
      </div>
    </details>
  )
}

export default function Dashboard() {
  const { t, lang } = useStaffI18n()
  const state = useHospital()
  const now = useSimNow(1000)
  const unseen = state.flags.filter((f) => !f.seen).length
  const allowed = useCan()
  useSimLeader()
  useAlarm(unseen)

  useEffect(() => {
    document.title = unseen ? `(!) ${t('staff.flagTitle')} – ${t('app.name')}` : `${t('nav.dashboard')} – ${t('app.name')}`
  }, [unseen, t])

  const summary = deptSummary(state, now)
  const hallWaiting = totalWaiting(state)
  const seats = waitingAreas[0].seats
  const hallLevel = crowdLevel(hallWaiting, seats)
  const called = Object.values(state.patients).filter((p) => p.status === 'called').length
  const done = Object.values(state.patients).filter((p) => p.status === 'done').length

  return (
    <div className="space-y-4">
      <Flags flags={state.flags} t={t} />
      {!audioReady() && (
        <Notice kind="warn" icon="speaker" title={t('staff.soundOff')}>
          <Button variant="secondary" icon="speaker" className="mt-2" onClick={unlockAudio}>
            {t('staff.soundOn')}
          </Button>
        </Notice>
      )}
      <h1 className="text-2xl font-bold">{t('staff.dashTitle')}</h1>
      <ScreenGuide id="dashboard" items={['call', 'noShow', 'doctor', 'tests', 'line', 'urgent']} t={t} />
      <BusyBanner now={now} t={t} />

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="space-y-2 p-4">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Icon name="chair" />
            {t('places.f1_waitA.name')}
          </h2>
          <LevelChip level={hallLevel} label={`${t(`crowdLive.${hallLevel}`)} · ${t('staff.seats', { n: hallWaiting, seats })}`} />
          <Meter value={hallWaiting} max={seats} level={hallLevel} label={t('staff.seats', { n: hallWaiting, seats })} />
          <p className="text-base text-ink-2">{t('staff.crowdKey')}</p>
        </Card>
        <Card className="grid grid-cols-3 gap-2 p-4 text-center">
          <div>
            <p className="text-base text-ink-2">{t('staff.waiting')}</p>
            <p className="text-3xl font-bold">{hallWaiting}</p>
          </div>
          <div>
            <p className="text-base text-ink-2">{t('staff.withDoctor')}</p>
            <p className="text-3xl font-bold">{called}</p>
          </div>
          <div>
            <p className="text-base text-ink-2">{t('staff.done')}</p>
            <p className="text-3xl font-bold">{done}</p>
          </div>
        </Card>
      </div>

      <TodayCard state={state} t={t} />
      <NearbyStaff state={state} now={now} t={t} canSet={allowed('setShareLoad')} onToggle={setShareLoad} />
      {allowed('demo') && <DemoControls state={state} t={t} />}
      {!allowed('callNext') && <Notice kind="info">{t('staff.roleNote')}</Notice>}

      <h2 className="text-lg font-semibold">{t('staff.queues')}</h2>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {summary.map((s) => (
          <DeptCard key={s.dept.id} s={s} state={state} now={now} t={t} lang={lang} allowed={allowed} />
        ))}
      </div>
    </div>
  )
}
