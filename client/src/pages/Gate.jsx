import { useEffect } from 'react'
import { Link } from 'react-router'
import { translate } from '../i18n/index.js'
import { useCheckInCode, checkInUrl } from '../lib/checkin.js'
import { QRCode } from '../components/Slip.jsx'
import Icon from '../components/Icon.jsx'

// The join-the-line code alone, for an old phone or tablet at the gate, the
// guard's desk or the help desk: people who booked on a phone can join the
// line without getting into the waiting room. English and Hindi together.
// Like the board, it shows the code only once staff have logged in on it.
export default function Gate() {
  const v = useCheckInCode()
  const both = (k) => ['en', 'hi'].map((l) => (
    <span key={l} lang={l} className="block">
      {translate(l, k)}
    </span>
  ))

  useEffect(() => {
    document.title = translate('en', 'gate.title')
    // Keep the screen on, where the browser allows it.
    let lock = null
    const ask = () => navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    ask()
    const again = () => document.visibilityState === 'visible' && ask()
    document.addEventListener('visibilitychange', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      lock?.release().catch(() => {})
    }
  }, [])

  return (
    <div className="board min-h-dvh bg-[#0c2a30] px-4 py-6 text-white">
      <main className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
        <p className="text-lg opacity-90">{both('app.hospital')}</p>
        <h1 className="text-[clamp(1.6rem,6vw,2.6rem)] font-bold leading-tight">{both('gate.title')}</h1>
        {v?.code ? (
          <>
            <div className="rounded-3xl bg-white p-3">
              <QRCode text={checkInUrl(v.code)} size={Math.min(320, typeof window === 'undefined' ? 320 : window.innerWidth - 80)} label={translate('en', 'gate.title')} />
            </div>
            <p className="font-mono text-[clamp(3rem,16vw,5.5rem)] font-extrabold leading-none tracking-widest text-[#ffe14d]" aria-label={v.code.split('').join(' ')}>
              {v.code.slice(0, 3)} {v.code.slice(3)}
            </p>
          </>
        ) : (
          v && (
            <div className="space-y-3 rounded-2xl bg-[#123a42] p-4 text-lg">
              <p>{both('gate.login')}</p>
              <Link
                to="/staff/login"
                state={{ from: '/gate' }}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#ffe14d] px-4 font-bold text-black no-underline"
              >
                <Icon name="badge" size={22} />
                {translate('en', 'gate.loginBtn')} / <span lang="hi">{translate('hi', 'gate.loginBtn')}</span>
              </Link>
            </div>
          )
        )}
        <ol className="w-full space-y-3 text-left text-[clamp(1.05rem,4vw,1.35rem)]">
          {['gate.step1', 'gate.step2'].map((k, i) => (
            <li key={k} className="flex gap-3 rounded-2xl bg-[#123a42] p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ffe14d] font-bold text-black">{i + 1}</span>
              <span className="space-y-1">{both(k)}</span>
            </li>
          ))}
        </ol>
        <p className="text-lg">{both('gate.noBooking')}</p>
        <p className="flex w-full items-start gap-3 rounded-2xl border-4 border-[#ff8a80] p-3 text-left text-lg font-semibold">
          <Icon name="emergency" size={30} className="shrink-0" />
          <span>{both('gate.emergency')}</span>
        </p>
      </main>
    </div>
  )
}
