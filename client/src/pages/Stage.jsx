import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useHospital, useMode } from '../lib/store.js'
import { useStaffUser } from '../lib/auth.js'
import { api } from '../lib/auth.js'
import { setAutoRun, setSpeed, checkIn, giveFeedbackLocal } from '../lib/actions.js'
import { findByToken, followMoves, hasRated } from '../lib/queue.js'
import { setupDemo } from '../lib/demo.js'
import { parseSms, smsText } from '../lib/ask.js'
import { messageText } from '../lib/text.js'
import { impactToday } from '../lib/impact.js'
import { can } from '../lib/permissions.js'
import { useStaffI18n } from './staff/StaffLayout.jsx'
import Icon from '../components/Icon.jsx'

// A screen at its real size (w x h), shrunk to fit the column it sits in.
function ScaledFrame({ src, w, h, title }) {
  const box = useRef(null)
  const [scale, setScale] = useState(0.5)
  useLayoutEffect(() => {
    const el = box.current
    const fit = () => setScale(el.clientWidth / w)
    fit()
    // Next frame: resizing inside the observer's own callback loops.
    const ro = new ResizeObserver(() => requestAnimationFrame(fit))
    ro.observe(el)
    return () => ro.disconnect()
  }, [w])
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-xl bg-black/20" style={{ height: h * scale }}>
      {/* Out of the flow, so its real size never widens the column. */}
      <iframe title={title} src={src} className="absolute left-0 top-0" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }} />
    </div>
  )
}

// A basic phone that only sends and receives SMS: ask for your place, where
// a room is, or join the line, get "your turn is close" texts, and reply 1, 2
// or 3 after the visit.
function FeaturePhone({ t }) {
  const state = useHospital()
  const { mode } = useMode()
  const [thread, setThread] = useState([{ dir: 'in', text: t('stage.smsHello') }])
  const [text, setText] = useState('')
  const [follow, setFollow] = useState(null) // { token, lastId }
  const screen = useRef(null)

  // Alerts for the token this phone asked about arrive as texts.
  useEffect(() => {
    if (!follow) return
    const fresh = state.messages.filter((m) => m.token === follow.token && m.id > follow.lastId).sort((a, b) => a.id - b.id)
    if (!fresh.length) return
    setThread((th) => [...th, ...fresh.map((m) => ({ dir: 'in', text: `${t('app.name')}: ${messageText(m, t).replace(/^OPD (Saathi|साथी): /, '')}` }))])
    setFollow({ ...follow, lastId: fresh.at(-1).id })
  }, [state.messages]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    screen.current?.scrollTo(0, screen.current.scrollHeight)
  }, [thread])

  const send = async (body) => {
    body = body.trim()
    if (!body) return
    setText('')
    setThread((th) => [...th, { dir: 'out', text: body }])
    const msg = parseSms(body)
    let reply
    if (mode === 'server') {
      // The token this phone follows, for a 1/2/3 reply without one.
      reply = (await api('/sms/inbound', { from: 'stage', text: body, token: follow?.token }).catch(() => null))?.reply
    } else {
      const p = msg.token && Object.values(state.patients).find((x) => x.token === msg.token)
      if (msg.cmd === 'in' && p) await checkIn(p.id).catch(() => null)
      let rated = false
      if (msg.cmd === 'rate') {
        const v = followMoves(state, findByToken(state, msg.token || follow?.token))
        rated = !!(v && (await giveFeedbackLocal(v.id, msg.score, []).catch(() => null)))
      }
      reply = smsText(state, msg, { rated })
    }
    setThread((th) => [...th, { dir: 'in', text: reply || t('stage.smsFailed') }])
    if (msg.token) setFollow({ token: msg.token, lastId: Math.max(0, ...state.messages.map((m) => m.id)) })
  }
  const waitingToken = Object.values(state.patients).find((p) => p.status === 'waiting')?.token
  const followed = follow && followMoves(state, findByToken(state, follow.token))
  const canRate = followed?.status === 'done' && !hasRated(followed)

  return (
    <div className="mx-auto w-full max-w-64 rounded-[2.2rem] border-4 border-[#2b2f33] bg-[#3a3f44] p-4 shadow-xl">
      <p className="mb-2 text-center text-xs font-semibold tracking-wide text-white/70">{t('stage.featurePhone')}</p>
      <div ref={screen} className="h-72 space-y-2 overflow-y-auto rounded-md bg-[#c9d7b1] p-2 font-mono text-[12px] leading-snug text-[#1d2617]" aria-live="polite">
        {thread.map((m, i) => (
          <p key={i} className={m.dir === 'out' ? 'ml-6 rounded bg-[#e6eedb] px-1.5 py-1 text-right' : 'mr-4'}>
            {m.text}
          </p>
        ))}
      </div>
      <form
        className="mt-3 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
        }}
      >
        <label htmlFor="fp-text" className="sr-only">
          {t('stage.smsLabel')}
        </label>
        <input id="fp-text" value={text} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 rounded bg-[#e9ecef] px-2 py-1.5 font-mono text-sm" autoComplete="off" />
        <button type="submit" className="rounded bg-[#5c946e] px-2 font-semibold text-white">
          {t('stage.send')}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1">
        {[waitingToken, 'KAHAN XRAY', 'HELP', canRate && '1'].filter(Boolean).map((q) => (
          <button key={q} type="button" onClick={() => send(q)} className="rounded bg-[#555b61] px-2 py-1 font-mono text-xs text-white">
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function Impact({ state, t }) {
  const x = impactToday(state)
  const tiles = [
    ['phone', t('stage.impact.phone', { n: x.phone, total: x.total })],
    ['qr', t('stage.impact.arrived', { n: x.arrived })],
    ['refresh', t('stage.impact.rejoined', { n: x.rejoined })],
    ['badge', t('stage.impact.free', { n: x.freeConfirmed })],
    ['alert', x.urgentSecs == null ? t('stage.impact.urgentNone') : t('stage.impact.urgent', { n: x.urgentSecs })],
    ['rupee', t('stage.impact.payment')],
    ['lab', t('stage.impact.reports', { n: x.backWithReports })],
    [
      'clock',
      x.estimate ? t('stage.impact.estimate', { n: x.estimate.within5, total: x.estimate.total }) : t('stage.impact.estimateNone'),
    ],
    [
      'faceGood',
      x.feedback ? t('stage.impact.feedback', { pct: Math.round((100 * x.feedback.good) / x.feedback.n), n: x.feedback.n }) : t('stage.impact.feedbackNone'),
    ],
  ]
  return (
    <section aria-labelledby="impact-h" className="rounded-2xl bg-white/5 p-3">
      <h2 id="impact-h" className="mb-2 text-sm font-semibold text-white/80">
        {t('stage.impact.title')}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9">
        {tiles.map(([icon, label]) => (
          <li key={icon} className="flex items-start gap-2 rounded-xl bg-white/10 p-2 text-sm text-white">
            <Icon name={icon} size={18} className="mt-0.5 shrink-0" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  )
}

const PHONE_PAGES = [
  ['/', 'home'],
  ['/register', 'register'],
  ['/ask', 'mic'],
  ['/plan', 'calendar'],
]

// The demo stage: the patient's phone, a basic phone, the waiting-room board
// and the staff dashboard, side by side, live. For a projector.
export default function Stage() {
  const { t } = useStaffI18n()
  const state = useHospital()
  const { mode } = useMode()
  const user = useStaffUser()
  const [phonePath, setPhonePath] = useState('/')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const admin = mode === 'local' || can(user, 'demo')

  useEffect(() => {
    document.title = `${t('stage.title')} – ${t('app.name')}`
  }, [t])

  if (mode === 'server' && user === null)
    return (
      <div className="grid min-h-dvh place-items-center bg-[#0f2a2f] p-6 text-white">
        <p className="space-y-3 text-center">
          <span className="block text-xl">{t('stage.loginFirst')}</span>
          <Link to="/staff/login" className="font-semibold underline">
            {t('stage.goLogin')}
          </Link>
        </p>
      </div>
    )

  return (
    <div className="min-h-dvh space-y-3 bg-[#0f2a2f] p-3 text-white">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto flex items-center gap-2 text-xl font-bold">
          <Icon name="tv" />
          {t('stage.title')}
        </h1>
        {admin && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setMsg('')
                try {
                  await setupDemo()
                  setPhonePath('/?r=' + Date.now())
                  setMsg(t('stage.ready'))
                } catch (e) {
                  setMsg(e.message)
                } finally {
                  setBusy(false)
                }
              }}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-[#ffe14d] px-4 font-bold text-black"
            >
              <Icon name="bolt" size={20} />
              {busy ? t('common.loading') : t('stage.setup')}
            </button>
            <button type="button" aria-pressed={!!state.autoRun} onClick={() => setAutoRun(!state.autoRun)} className="min-h-11 rounded-xl border border-white/40 px-3 font-semibold">
              {state.autoRun ? t('stage.doctorsOn') : t('stage.doctorsOff')}
            </button>
            <button
              type="button"
              aria-pressed={state.clock.speed === 10}
              onClick={() => setSpeed(state.clock.speed === 10 ? 1 : 10)}
              className="min-h-11 rounded-xl border border-white/40 px-3 font-semibold"
            >
              {state.clock.speed === 10 ? t('demo.speedNormal') : t('demo.speed10')}
            </button>
          </>
        )}
        <Link to="/staff" className="min-h-11 rounded-xl px-3 py-2.5 font-semibold text-white/80 no-underline hover:text-white">
          {t('stage.backToStaff')}
        </Link>
      </header>
      {msg && (
        <p role="status" className="text-sm font-semibold text-[#ffe14d]">
          {msg}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[300px_270px_minmax(0,1fr)]">
        <section aria-label={t('stage.patientPhone')} className="mx-auto w-full max-w-[300px] space-y-2">
          <div className="flex gap-1">
            {PHONE_PAGES.map(([path, icon]) => (
              <button
                key={path}
                type="button"
                onClick={() => setPhonePath(`${path}${path.includes('?') ? '&' : '?'}r=${Date.now()}`)}
                className="grid h-9 flex-1 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
                aria-label={t(`stage.page.${icon}`)}
              >
                <Icon name={icon} size={18} />
              </button>
            ))}
          </div>
          <div className="rounded-[2.4rem] border-[6px] border-[#1d1f21] bg-[#1d1f21] p-1">
            <ScaledFrame src={phonePath} w={390} h={800} title={t('stage.patientPhone')} />
          </div>
          <p className="text-center text-xs text-white/60">{t('stage.patientPhone')}</p>
        </section>

        <section aria-label={t('stage.featurePhone')} className="space-y-3">
          <FeaturePhone t={t} />
          <p className="text-center text-xs text-white/60">{t('stage.featureHint')}</p>
        </section>

        <section className="space-y-3">
          <ScaledFrame src="/board?autostart=1" w={1600} h={900} title={t('nav.board')} />
          <ScaledFrame src="/staff" w={1280} h={820} title={t('nav.dashboard')} />
        </section>
      </div>

      <Impact state={state} t={t} />
    </div>
  )
}
