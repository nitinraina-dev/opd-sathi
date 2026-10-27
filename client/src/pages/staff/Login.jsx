import { useState } from 'react'
import { Navigate, useLocation, useNavigate, Link } from 'react-router'
import { translate, LANGS } from '../../i18n/index.js'
import { useSettings } from '../../lib/settings.js'
import { useMode } from '../../lib/store.js'
import { login, useStaffUser } from '../../lib/auth.js'
import { Button, Card } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import { useStaffI18n } from './StaffLayout.jsx'

export default function Login() {
  const { t, lang } = useStaffI18n()
  const [, set] = useSettings()
  const { mode } = useMode()
  const user = useStaffUser()
  const nav = useNavigate()
  const loc = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const back = loc.state?.from && loc.state.from !== '/staff/login' ? loc.state.from : '/staff'

  if (mode === 'local' || user) return <Navigate to={back} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username.trim().toLowerCase(), password)
      nav(back, { replace: true })
    } catch (err) {
      setError(err.status === 429 ? t('login.tooMany') : err.status === 401 ? t('login.wrong') : t('login.failed'))
    }
    setBusy(false)
  }

  return (
    <div className="min-h-dvh px-4 py-8" lang={lang}>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xl font-bold text-brand">
            {t('app.name')} · {t('staff.title')}
          </p>
          <div role="group" aria-label={t('settings.language')} className="flex gap-1">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => set({ staffLang: l })}
                className={`inline-flex min-h-14 items-center gap-1 rounded-xl border px-3 font-semibold ${lang === l ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-card'}`}
              >
                <Icon name="globe" size={22} />
                {translate(l, 'lang.self')}
              </button>
            ))}
          </div>
        </div>
        <Card>
          <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
            <Icon name="badge" size={34} />
            {t('login.title')}
          </h1>
          <form className="space-y-4" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="login-user" className="mb-1 block text-lg font-semibold">
                {t('login.username')}
              </label>
              <input
                id="login-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full rounded-2xl border border-line bg-card px-4 min-h-14 text-xl"
              />
            </div>
            <div>
              <label htmlFor="login-pass" className="mb-1 block text-lg font-semibold">
                {t('login.password')}
              </label>
              <input
                id="login-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-describedby="login-error"
                className="w-full rounded-2xl border border-line bg-card px-4 min-h-14 text-xl"
              />
            </div>
            <p id="login-error" role="alert" className="min-h-7 text-lg font-bold text-danger">
              {error}
            </p>
            <Button type="submit" icon="next" className="w-full" disabled={busy || !username || !password}>
              {t('login.submit')}
            </Button>
          </form>
        </Card>
        <p className="text-base text-ink-2">{t('login.firstTime')}</p>
        <Link
          to="/emergency"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-danger px-4 text-lg font-bold text-danger-ink no-underline"
        >
          <Icon name="emergency" />
          {t('staff.emergency')}
        </Link>
        <p className="text-base">
          <Link to="/" className="underline">
            {t('nav.patientApp')}
          </Link>
          {' · '}
          <Link to="/board" className="underline">
            {t('nav.board')}
          </Link>
        </p>
      </div>
    </div>
  )
}
