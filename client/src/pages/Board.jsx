import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useHospital, useSimNow } from '../lib/store.js'
import { translate } from '../i18n/index.js'
import { departments } from '../data/departments.js'
import { waitingList, servingIn, roomState } from '../lib/queue.js'
import { fmtTime } from '../lib/clock.js'
import { speak, spokenToken } from '../lib/speech.js'
import { chime, unlockAudio } from '../lib/sound.js'
import { doctorStatusText } from '../lib/text.js'
import Icon from '../components/Icon.jsx'
import { QRCode } from '../components/Slip.jsx'
import { useCheckInCode, checkInUrl } from '../lib/checkin.js'
import { useSettings } from '../lib/settings.js'

// Waiting-room board for a TV. Switches between English and Hindi every
// 10 seconds and reads each called token aloud in both languages.
// /board?view=phone is the same board on a patient's phone, for anyone who
// cannot get into (or see) the waiting room: in their own language, quiet
// until they ask for sound, and without the join code (that is for the TV).
// Phones that booked join the line by scanning this (it changes every 2 minutes).
function CheckInPanel({ t }) {
  const v = useCheckInCode()
  if (!v) return null
  return (
    <section className="flex items-center gap-3 rounded-2xl bg-white p-2 pr-4 text-black" aria-label={t('board.checkinTitle')}>
      {v.code && <QRCode text={checkInUrl(v.code)} size={104} label={t('board.checkinTitle')} />}
      <div className="min-w-0">
        <p className="text-[clamp(1.1rem,1.6vw,1.8rem)] font-bold leading-tight">{t('board.checkinTitle')}</p>
        <p className="text-[clamp(0.9rem,1.1vw,1.25rem)]">{v.code ? t('board.checkinBody') : t('board.checkinCounter')}</p>
        {v.code && (
          <p className="font-mono text-[clamp(1.6rem,2.4vw,2.8rem)] font-extrabold leading-none tracking-widest" aria-label={v.code.split('').join(' ')}>
            {v.code.slice(0, 3)} {v.code.slice(3)}
          </p>
        )}
      </div>
    </section>
  )
}

// A TV can't scroll: on a wide landscape screen, shrink the board until it
// fits one screen. Phones and tablets scroll as usual. It fits again whenever
// the content changes size (the check-in code arriving, the language
// switching, a doctor's note), or the screen does.
function useFitScreen(ref) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.zoom = ''
      if (window.innerWidth < 1024 || window.innerWidth / window.innerHeight < 1.25) return
      // Shrinking lets the content reflow (lines wrap less), so measure again:
      // grow back towards the full screen, but never end taller than it.
      const target = window.innerHeight - 2
      const height = () => el.getBoundingClientRect().height
      const set = (v) => {
        z = Math.min(1, Math.max(0.5, v))
        el.style.zoom = String(z)
      }
      let z = 1
      for (let i = 0; i < 5; i++) {
        const h = height()
        if (h <= target && (z === 1 || target - h < 12)) break
        set((z * target) / h)
      }
      for (let i = 0; i < 3 && height() > window.innerHeight; i++) set((z * target) / height())
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [ref])
}

export default function Board() {
  const state = useHospital()
  const now = useSimNow(1000)
  const fitRef = useRef(null)
  const [params] = useSearchParams()
  // /board?autostart=1 skips the start screen (for a TV in kiosk mode; see README).
  const auto = params.get('autostart') === '1'
  const phone = params.get('view') === 'phone'
  const [settings] = useSettings()
  const [lang, setLang] = useState(phone ? settings.lang || 'en' : 'en')
  const [started, setStarted] = useState(auto || phone)
  const [sound, setSound] = useState(auto)
  const [flash, setFlash] = useState({})
  const lastId = useRef(null)
  const queue = useRef([])
  const busy = useRef(false)
  const t = (k, v) => translate(lang, k, v)

  useEffect(() => {
    if (phone) return
    const id = setInterval(() => setLang((l) => (l === 'en' ? 'hi' : 'en')), 10000)
    return () => clearInterval(id)
  }, [phone])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate(lang, 'board.title')
  }, [lang])

  // New calls: flash them and queue the announcements.
  useEffect(() => {
    const latest = state.calls[0]?.id ?? 0
    if (lastId.current === null) {
      lastId.current = latest
      return
    }
    const fresh = state.calls.filter((c) => c.id > lastId.current).reverse()
    if (!fresh.length) return
    lastId.current = latest
    setFlash((f) => {
      const n = { ...f }
      for (const c of fresh) n[c.token] = Date.now()
      return n
    })
    if (!sound) return
    for (const c of fresh) {
      const vars = { token: spokenToken(c.token), room: c.room }
      for (const l of phone ? [lang] : ['en', 'hi']) queue.current.push({ text: translate(l, 'board.announce', vars), lang: l })
    }
    if (busy.current) return
    busy.current = true
    ;(async () => {
      chime('ding')
      await new Promise((r) => setTimeout(r, 700))
      while (queue.current.length) {
        const item = queue.current.shift()
        await speak(item.text, item.lang, { interrupt: false })
      }
      busy.current = false
    })()
  }, [state.calls, sound])

  const flashing = (tok) => flash[tok] && Date.now() - flash[tok] < 10000
  const lastCall = state.calls[0]
  useFitScreen(fitRef)

  return (
    <div className="board min-h-dvh bg-[#0c2a30] text-white" lang={lang}>
      {!started && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6">
          <div className="max-w-xl space-y-4 text-center">
            <p className="text-3xl font-bold">{translate('en', 'board.startTitle')}</p>
            <p lang="hi" className="text-3xl font-bold">
              {translate('hi', 'board.startTitle')}
            </p>
            <button
              type="button"
              onClick={() => {
                unlockAudio()
                speak(' ', 'en')
                setSound(true)
                setStarted(true)
              }}
              className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#ffe14d] px-6 text-2xl font-bold text-black"
            >
              <Icon name="speaker" size={32} />
              {translate('en', 'board.startSound')} / <span lang="hi">{translate('hi', 'board.startSound')}</span>
            </button>
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border-2 border-white px-6 text-xl font-semibold"
            >
              <Icon name="tv" size={28} />
              {translate('en', 'board.startQuiet')} / <span lang="hi">{translate('hi', 'board.startQuiet')}</span>
            </button>
          </div>
        </div>
      )}

      <div ref={fitRef}>
        <header className="flex flex-wrap items-center gap-4 border-b-4 border-[#ffe14d] px-6 py-4">
          {phone && (
            <Link to="/" className="flex min-h-12 items-center gap-1 rounded-xl border-2 border-white px-3 text-lg font-semibold text-white no-underline">
              <Icon name="back" size={22} />
              {t('common.back')}
            </Link>
          )}
          <Icon name="tv" size={44} />
          <div className="min-w-[min(100%,16rem)] flex-1">
            <h1 className="text-[clamp(1.6rem,3vw,3rem)] font-bold leading-tight">{t('board.title')}</h1>
            <p className="text-[clamp(1rem,1.6vw,1.6rem)] opacity-90">{t('app.hospital')}</p>
          </div>
          {state.arrival !== false && !phone && <CheckInPanel t={t} />}
          <p className="font-mono text-[clamp(2rem,4vw,4rem)] font-bold">{fmtTime(now)}</p>
          {phone ? (
            <button
              type="button"
              aria-pressed={sound}
              onClick={() => {
                if (!sound) {
                  unlockAudio()
                  speak(' ', lang)
                }
                setSound(!sound)
              }}
              className="flex min-h-12 items-center gap-2 rounded-xl bg-[#ffe14d] px-3 text-lg font-bold text-black"
            >
              <Icon name={sound ? 'stop' : 'speaker'} size={22} />
              {sound ? t('board.soundOff') : t('board.soundOn')}
            </button>
          ) : (
            <p className="rounded-full border-2 border-white px-4 py-1 text-xl font-semibold">{t('lang.self')}</p>
          )}
          {phone && <p className="w-full text-lg">{t('board.phoneNote')}</p>}
        </header>

        <main className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
          {departments.map((d) => {
            const next = waitingList(state, d.id).slice(0, 3)
            return (
              <section key={d.id} className="flex flex-col gap-3 rounded-3xl bg-[#123a42] p-4" aria-label={t(`depts.${d.id}.name`)}>
                <h2 className="flex items-center gap-2 text-[clamp(1.3rem,2vw,2rem)] font-bold leading-tight">
                  <Icon name={d.icon} size={36} />
                  {t(`depts.${d.id}.name`)}
                </h2>
                {/* Two rooms side by side, so every card is about the same height. */}
                <div className={d.rooms.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>
                  {d.rooms.map((r) => {
                    const cur = servingIn(state, r.room)
                    const st = roomState(state, r.room, now)
                    return (
                      <div key={r.room} className={`@container min-w-0 rounded-2xl p-3 ${cur && flashing(cur.token) ? 'board-flash' : 'bg-[#0c2a30]'}`}>
                        <p className="text-[clamp(1rem,1.5vw,1.5rem)] font-semibold">
                          {t('common.room', { n: r.room })} · {t('board.now')}
                        </p>
                        {/* Never wider than its box (22cqi: a 7-letter token in the box's width). */}
                        <p className="whitespace-nowrap font-mono text-[min(clamp(2rem,3.4vw,4.2rem),22cqi)] font-extrabold leading-none text-[#ffe14d]">
                          {cur ? cur.token : '—'}
                        </p>
                        {st.status !== 'available' && (
                          <p className="mt-2 flex items-center gap-2 rounded-xl bg-[#ffe14d] px-2 py-1 text-[clamp(1rem,1.4vw,1.4rem)] font-bold text-black">
                            <Icon name={st.status === 'break' ? 'clock' : 'alert'} size={24} />
                            {doctorStatusText(st, t)}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div>
                  <p className="text-[clamp(1rem,1.4vw,1.4rem)] font-semibold opacity-90">{t('board.next')}</p>
                  {next.length ? (
                    <p className="flex flex-wrap gap-x-4 font-mono text-[clamp(1.3rem,1.9vw,2.2rem)] font-bold">
                      {next.map((p) => (
                        <span key={p.id} className="whitespace-nowrap">
                          {p.token}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="text-[clamp(1.1rem,1.5vw,1.6rem)]">{t('board.noOne')}</p>
                  )}
                </div>
              </section>
            )
          })}
          <section className="flex flex-col justify-center gap-3 rounded-3xl border-4 border-[#ff8a80] p-4">
            <p className="flex items-center gap-2 text-[clamp(1.3rem,2vw,2rem)] font-bold">
              <Icon name="emergency" size={36} />
              {t('board.emergencyTitle')}
            </p>
            <p className="text-[clamp(1rem,1.5vw,1.5rem)]">{t('board.emergencyBody')}</p>
          </section>
        </main>

        <footer className="border-t-4 border-[#ffe14d] px-6 py-4 text-[clamp(1.2rem,2.2vw,2.2rem)] font-semibold" aria-live="polite">
          {lastCall ? t('board.lastCalled', { token: lastCall.token, room: lastCall.room }) : t('board.waitingStart')}
        </footer>
      </div>
    </div>
  )
}
