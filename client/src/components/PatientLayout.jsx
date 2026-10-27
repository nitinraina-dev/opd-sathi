import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import Icon from './Icon.jsx'
import UrgentHelp from './UrgentHelp.jsx'
import { SpeechCtx } from './pageSpeech.js'
import { useI18n, translate } from '../i18n/index.js'
import { useSettings } from '../lib/settings.js'
import { useHospital } from '../lib/store.js'
import { followMoves, aheadOf } from '../lib/queue.js'
import { speak, stopSpeaking, canSpeak } from '../lib/speech.js'

const barBase = 'min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold no-underline'
const barBtn = `inline-flex ${barBase}`
// Only on tablets and laptops (phones have these in the bottom tabs).
const barWide = `hidden md:inline-flex ${barBase}`

// Frame for every patient screen: a slim top bar (Back, Listen, Emergency)
// and tabs at the bottom (Home, My token, Find, Help, Settings).
export default function PatientLayout() {
  const { t, lang } = useI18n()
  const [settings] = useSettings()
  const state = useHospital()
  const loc = useLocation()
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pageBack, setBack] = useState(null)
  const auto = settings.assisted || settings.readAloud
  const home = loc.pathname === '/'
  // Before a language is chosen, show Emergency in both languages.
  const both = (k) => (settings.lang ? t(k) : `${translate('en', k)} / ${translate('hi', k)}`)

  const raw = settings.me && state.patients[settings.me]
  const me = raw ? followMoves(state, raw) : null
  const active = me && ['waiting', 'called'].includes(me.status)
  const tokenTo = active ? `/turn/${me.token}` : '/have-slip'
  const tokenActive = /^\/(turn|slip|have-slip)/.test(loc.pathname)

  useEffect(() => {
    stopSpeaking()
    setSpeaking(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  useEffect(() => {
    if (!auto || !text) return
    const id = setTimeout(() => {
      setSpeaking(true)
      speak(text, lang).then(() => setSpeaking(false))
    }, 700)
    return () => clearTimeout(id)
  }, [text, auto, lang])

  const listen = () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    speak(text, lang).then(() => setSpeaking(false))
  }

  const back = () => {
    if (pageBack) return pageBack()
    return window.history.state?.idx > 0 ? nav(-1) : nav('/')
  }
  const openHelp = useCallback(() => setHelpOpen(true), [])
  const ctx = useMemo(() => ({ setText, openHelp, setBack }), [openHelp])

  const tab = (isActive) =>
    `relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold no-underline ${isActive ? 'text-brand' : 'text-ink-2 hover:text-ink'}`
  const mark = (isActive) => isActive && <span aria-hidden="true" className="absolute top-0 h-1 w-10 rounded-b-full bg-brand" />

  return (
    <SpeechCtx.Provider value={ctx}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-card focus:p-3">
        {t('app.skip')}
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-2 md:h-16 md:gap-2 md:px-6">
          {/* Phones: Back on inner screens. Tablets and laptops: the logo, always. */}
          <Link
            to="/"
            className={`${home ? 'flex' : 'hidden md:flex'} min-w-0 items-center gap-2 px-1.5 text-base font-bold text-brand no-underline md:px-0`}
          >
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-brand-ink">
              <Icon name="plus" size={20} />
            </span>
            <span className="truncate max-[339px]:sr-only">{t('app.name')}</span>
          </Link>
          {!home && (
            <button type="button" onClick={back} className={`${barBtn} text-ink hover:bg-page md:hidden`}>
              <Icon name="back" size={22} />
              {t('common.back')}
            </button>
          )}
          <span className="min-w-1 flex-1" />
          {canSpeak && (
            <button type="button" onClick={listen} aria-pressed={speaking} className={`${barBtn} text-ink hover:bg-page`}>
              <Icon name={speaking ? 'stop' : 'speaker'} size={22} />
              {/* Small phones: the icon alone, so the name and Emergency fit. */}
              <span className="max-[399px]:sr-only">{speaking ? t('common.stop') : t('common.listen')}</span>
            </button>
          )}
          {settings.lang && (
            <>
              <button type="button" onClick={openHelp} className={`${barWide} text-danger hover:bg-danger-soft`}>
                <Icon name="hand" size={20} />
                {t('tabs.help')}
              </button>
              <Link
                to="/settings"
                aria-current={loc.pathname === '/settings' ? 'page' : undefined}
                className={`${barWide} ${loc.pathname === '/settings' ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-page'}`}
              >
                <Icon name="settings" size={20} />
                {t('tabs.settings')}
              </Link>
            </>
          )}
          <Link to="/emergency" className={`${barBtn} bg-danger text-danger-ink`}>
            <Icon name="emergency" size={20} />
            {both('header.emergency')}
          </Link>
        </div>
        {/* Tablets and laptops: the main sections as a row of links. */}
        {settings.lang && (
          <nav aria-label={t('tabs.label')} className="hidden border-t border-line md:block">
            <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3">
              {[
                ['/', t('tabs.home'), 'home', loc.pathname === '/'],
                [tokenTo, t('tabs.token'), 'slip', tokenActive],
                ['/find', t('home.find'), 'map', loc.pathname.startsWith('/find')],
                ['/plan', t('home.plan'), 'calendar', loc.pathname.startsWith('/plan')],
              ].map(([to, label, icon, isActive]) => (
                <Link
                  key={label}
                  to={to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative inline-flex min-h-12 shrink-0 items-center gap-1.5 px-3 text-sm font-semibold no-underline ${
                    isActive ? 'text-brand' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  <Icon name={icon} size={18} />
                  {label}
                  {icon === 'slip' && active && (
                    <span className={`rounded-full px-1.5 text-xs font-bold ${me.status === 'called' ? 'bg-danger text-danger-ink' : 'bg-brand text-brand-ink'}`}>
                      {me.status === 'called' ? '!' : aheadOf(state, me) || '•'}
                    </span>
                  )}
                  {isActive && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-4 pb-28 pt-5 outline-none md:max-w-6xl md:px-6 md:pb-12 md:pt-8">
        <Outlet />
        <footer className="mt-10 space-y-1 text-sm text-ink-2 print:hidden">
          <p>{t('app.sample')}</p>
          <p>
            <Link to="/staff" className="underline">
              {t('footer.staffLink')}
            </Link>
          </p>
        </footer>
      </main>

      {settings.lang && (
        <nav aria-label={t('tabs.label')} className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card md:hidden print:hidden">
          <div className="mx-auto grid max-w-xl grid-cols-5">
            <NavLink to="/" end className={({ isActive }) => tab(isActive)}>
              {({ isActive }) => (
                <>
                  {mark(isActive)}
                  <Icon name="home" size={24} />
                  {t('tabs.home')}
                </>
              )}
            </NavLink>
            <Link to={tokenTo} className={tab(tokenActive)} aria-current={tokenActive ? 'page' : undefined}>
              {mark(tokenActive)}
              <span className="relative">
                <Icon name="slip" size={24} />
                {active && (
                  <span
                    className={`absolute -right-3 -top-2 min-w-5 rounded-full px-1 text-center text-[0.6875rem] font-bold leading-5 ${
                      me.status === 'called' ? 'bg-danger text-danger-ink' : 'bg-brand text-brand-ink'
                    }`}
                    aria-label={me.status === 'called' ? t('turn.calledTitle') : t(aheadOf(state, me) === 1 ? 'turn.ahead_one' : 'turn.ahead_other', { n: aheadOf(state, me) })}
                  >
                    {me.status === 'called' ? '!' : aheadOf(state, me) || '•'}
                  </span>
                )}
              </span>
              {t('tabs.token')}
            </Link>
            <NavLink to="/find" className={({ isActive }) => tab(isActive)}>
              {({ isActive }) => (
                <>
                  {mark(isActive)}
                  <Icon name="map" size={24} />
                  {t('tabs.find')}
                </>
              )}
            </NavLink>
            <button type="button" onClick={openHelp} className={tab(false)}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-danger-soft text-danger">
                <Icon name="hand" size={20} />
              </span>
              {t('tabs.help')}
            </button>
            <NavLink to="/settings" className={({ isActive }) => tab(isActive)}>
              {({ isActive }) => (
                <>
                  {mark(isActive)}
                  <Icon name="settings" size={24} />
                  {t('tabs.settings')}
                </>
              )}
            </NavLink>
          </div>
        </nav>
      )}
      <UrgentHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </SpeechCtx.Provider>
  )
}
