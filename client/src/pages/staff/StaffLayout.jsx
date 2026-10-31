import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { useI18n, translate, LANGS } from '../../i18n/index.js'
import { useSettings } from '../../lib/settings.js'
import { useHospital, useSimNow, useMode } from '../../lib/store.js'
import { useStaffUser, logout } from '../../lib/auth.js'
import { can } from '../../lib/permissions.js'
import { fmtTime } from '../../lib/clock.js'
import Icon from '../../components/Icon.jsx'
import { DenseButtons } from '../../components/ui.jsx'

// Staff screens have their own language switch, separate from the patient app.
export function useStaffI18n() {
  const [s] = useSettings()
  return useI18n(s.staffLang || 'en')
}

// What this person may do. Offline mode has no server and no login, so the
// one browser running the demo may do everything.
export function useCan() {
  const user = useStaffUser()
  const { mode } = useMode()
  return (what) => mode === 'local' || can(user, what)
}

const item = ({ isActive }) =>
  `flex min-h-11 items-center gap-3 rounded-lg px-3 font-semibold no-underline ${isActive ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-page'}`

// Staff frame: a sidebar on laptops (a menu on phones) with the screens
// grouped by job, and the hospital clock, language and user at hand.
export default function StaffLayout() {
  const { t, lang } = useStaffI18n()
  const [, set] = useSettings()
  const state = useHospital()
  const now = useSimNow(1000)
  const { mode, storage } = useMode()
  const user = useStaffUser()
  const loc = useLocation()
  const allowed = useCan()
  const [toast, setToast] = useState('')
  const [menu, setMenu] = useState(false)
  const unseen = state.flags.filter((f) => !f.seen).length

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => setMenu(false), [loc.pathname])

  useEffect(() => {
    const on = (e) => setToast(e.detail.status === 401 ? t('login.expired') : e.detail.status === 403 ? t('login.notAllowed') : e.detail.message)
    window.addEventListener('opd-action-error', on)
    return () => window.removeEventListener('opd-action-error', on)
  }, [t])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 6000)
    return () => clearTimeout(id)
  }, [toast])

  if (mode === 'connecting' || (mode === 'server' && user === undefined)) {
    return <p className="p-6">{t('common.loading')}</p>
  }
  if (mode === 'server' && !user) return <Navigate to="/staff/login" state={{ from: loc.pathname }} replace />

  const clock = (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
      <Icon name="clock" size={18} />
      {t('staff.time', { time: fmtTime(now) })}
      {state.clock.speed !== 1 && <span className="rounded-full bg-warn px-2 text-warn-ink">{state.clock.speed}x</span>}
    </span>
  )

  const group = (label, links) =>
    links.some(Boolean) && (
      <div className="space-y-0.5">
        <p className="px-3 pb-1 pt-3 text-sm text-ink-2">{label}</p>
        {links}
      </div>
    )

  return (
    <div className="min-h-dvh lg:flex">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-card px-3 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-expanded={menu}
          aria-controls="staff-menu"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold hover:bg-page"
        >
          <Icon name="menu" size={22} />
          {t('staff.menu')}
        </button>
        <span className="font-bold text-brand">{t('app.name')}</span>
        <span className="flex-1" />
        {clock}
      </header>

      {menu && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenu(false)} aria-hidden="true" />}
      <aside
        id="staff-menu"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-card transition-[translate,visibility] lg:visible lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:translate-x-0 print:hidden ${
          menu ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-ink">
            <Icon name="plus" size={22} />
          </span>
          <div className="leading-tight">
            <p className="font-bold">{t('app.name')}</p>
            <p className="text-sm text-ink-2">{t('app.hospital')}</p>
          </div>
        </div>
        <nav aria-label={t('staff.nav')} className="flex-1 overflow-y-auto px-2 pb-3">
          {group(t('staff.groups.today'), [
            <NavLink key="d" to="/staff" end className={item}>
              <Icon name="users" size={20} />
              <span className="flex-1">{t('nav.dashboard')}</span>
              {unseen > 0 && <span className="rounded-full bg-danger px-2 text-sm text-danger-ink">{unseen}</span>}
            </NavLink>,
            allowed('counter') && (
              <NavLink key="c" to="/staff/counter" className={item}>
                <Icon name="register" size={20} />
                {t('nav.counter')}
              </NavLink>
            ),
            allowed('slips') && (
              <NavLink key="s" to="/staff/slips" className={item}>
                <Icon name="print" size={20} />
                {t('nav.slips')}
              </NavLink>
            ),
            allowed('payments') && (
              <NavLink key="p" to="/staff/payments" className={item}>
                <Icon name="rupee" size={20} />
                {t('nav.payments')}
              </NavLink>
            ),
            allowed('recordEmergency') && (
              <NavLink key="em" to="/staff/emergency" className={item}>
                <Icon name="emergency" size={20} />
                {t('nav.emergencyDesk')}
              </NavLink>
            ),
            allowed('claims') && (
              <NavLink key="cl" to="/staff/claims" className={item}>
                <Icon name="shield" size={20} />
                {t('nav.claims')}
              </NavLink>
            ),
          ])}
          {group(t('staff.groups.insights'), [
            allowed('forecast') && (
              <NavLink key="f" to="/staff/forecast" className={item}>
                <Icon name="chart" size={20} />
                {t('nav.forecast')}
              </NavLink>
            ),
            user && can(user, 'audit') && (
              <NavLink key="a" to="/staff/activity" className={item}>
                <Icon name="flag" size={20} />
                {t('nav.activity')}
              </NavLink>
            ),
          ])}
          {group(t('staff.groups.admin'), [
            user && (
              <NavLink key="u" to="/staff/accounts" className={item}>
                <Icon name="badge" size={20} />
                {can(user, 'accounts') ? t('nav.accounts') : t('nav.myAccount')}
              </NavLink>
            ),
          ])}
          {group(t('staff.groups.links'), [
            <a key="b" href="/board" target="_blank" rel="noreferrer" className={item({ isActive: false })}>
              <Icon name="tv" size={20} />
              <span className="flex-1">{t('nav.board')}</span>
              <Icon name="external" size={16} className="text-ink-2" />
            </a>,
            <a key="g" href="/gate" target="_blank" rel="noreferrer" className={item({ isActive: false })}>
              <Icon name="qr" size={20} />
              <span className="flex-1">{t('nav.gate')}</span>
              <Icon name="external" size={16} className="text-ink-2" />
            </a>,
            <NavLink key="st" to="/stage" className={item}>
              <Icon name="bolt" size={20} />
              <span className="flex-1">{t('nav.stage')}</span>
            </NavLink>,
            <a key="h" href="/" target="_blank" rel="noreferrer" className={item({ isActive: false })}>
              <Icon name="home" size={20} />
              <span className="flex-1">{t('nav.patientApp')}</span>
              <Icon name="external" size={16} className="text-ink-2" />
            </a>,
            <a
              key="e"
              href="/emergency"
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex min-h-11 items-center gap-3 rounded-lg bg-danger px-3 font-semibold text-danger-ink no-underline"
            >
              <Icon name="emergency" size={20} />
              {t('header.emergency')}
            </a>,
          ])}
        </nav>
        <div className="space-y-3 border-t border-line p-3">
          <div role="group" aria-label={t('settings.language')} className="flex rounded-lg bg-page p-1">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => set({ staffLang: l })}
                className={`flex min-h-9 flex-1 items-center justify-center gap-1 rounded-md text-sm font-semibold ${
                  lang === l ? 'bg-card text-ink shadow-sm ring-1 ring-line' : 'text-ink-2'
                }`}
              >
                <Icon name="globe" size={16} />
                {translate(l, 'lang.self')}
              </button>
            ))}
          </div>
          {user ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              {/* Log out moves to its own line when the name needs the room. */}
              <div className="min-w-[8rem] flex-1 leading-tight">
                <p className="break-words font-semibold">{user.name}</p>
                <p className="text-sm text-ink-2">{t(`roles.${user.role}`)}</p>
              </div>
              <button type="button" onClick={logout} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-2 hover:bg-page hover:text-ink">
                <Icon name="door" size={18} />
                {t('login.logout')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-2">{t('staff.mode.local')}</p>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="hidden items-center justify-between gap-4 border-b border-line bg-card px-8 py-2.5 lg:flex print:hidden">
          <p className="flex items-center gap-1.5 text-sm text-ink-2" role="status">
            <Icon name={mode === 'server' ? 'check' : 'info'} size={16} />
            {mode === 'server' ? t('staff.liveNote', { storage }) : t('staff.mode.local')}
          </p>
          {clock}
        </div>
        {toast && (
          <div role="alert" className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-[90vw] rounded-xl border border-danger bg-card px-4 py-3 font-semibold shadow-xl">
            <span className="flex items-center gap-2">
              <Icon name="alert" className="text-danger" />
              {toast}
            </span>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-5 lg:px-8" lang={lang}>
          <DenseButtons>
            <Outlet />
          </DenseButtons>
        </main>
      </div>
    </div>
  )
}
