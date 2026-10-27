import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useI18n } from '../i18n/index.js'
import { useHospital, useMode } from '../lib/store.js'
import { useSettings } from '../lib/settings.js'
import { myPatients } from '../lib/mine.js'
import { checkInWithCode, cleanCode, rememberCode } from '../lib/checkin.js'
import { joinKind } from '../lib/queue.js'
import { usePageSpeech } from '../components/pageSpeech.js'
import { Button, LinkButton, Notice, PageTitle } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

// Opened by scanning the code on the waiting-room screen (/checkin?c=123456),
// or by typing the code. Joins this phone's booking to the line (or a missed
// turn, or someone back with test reports).
export default function CheckIn() {
  const { t } = useI18n()
  const state = useHospital()
  const [, setSettings] = useSettings()
  const [params] = useSearchParams()
  const [code, setCode] = useState(cleanCode(params.get('c')))
  const [done, setDone] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const tried = useRef(false)
  const { mode } = useMode()
  const mine = myPatients(state)
  const bookings = mine.filter((p) => joinKind(p))
  const inLine = mine.filter((p) => ['waiting', 'called'].includes(p.status))

  const go = async (p, c = code) => {
    setErr('')
    setBusy(true)
    try {
      const token = await checkInWithCode(state, p, c)
      setSettings({ me: p.id })
      setDone(token)
    } catch (e) {
      setErr(t(`checkin.err.${e.code}`, { token: p.token }))
    } finally {
      setBusy(false)
    }
  }

  // Scanned with one booking on this phone: join at once.
  useEffect(() => {
    if (tried.current || code.length !== 6 || mode === 'connecting') return
    tried.current = true
    if (bookings.length === 1) go(bookings[0])
    // No booking yet: registering in the next few minutes joins the line at once.
    else if (!bookings.length) rememberCode(code)
  }, [mode, code]) // eslint-disable-line react-hooks/exhaustive-deps

  usePageSpeech(done ? t('checkin.doneTitle', { token: done }) : t('checkin.pageTitle'))

  if (done)
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Notice kind="ok" icon="check" title={t('checkin.doneTitle', { token: done })}>
          {t('checkin.doneBody')}
        </Notice>
        <LinkButton to={`/turn/${done}`} size="lg" icon="users" className="w-full">
          {t('home.seeTurn')}
        </LinkButton>
      </div>
    )

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle sub={t('checkin.pageSub')}>{t('checkin.pageTitle')}</PageTitle>

      {code.length !== 6 && (
        <div>
          <label htmlFor="checkin-code" className="mb-1 block text-sm font-semibold text-ink-2">
            {t('checkin.typeCode')}
          </label>
          <input
            id="checkin-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="min-h-12 w-40 rounded-xl border border-line bg-card px-3 text-center font-mono text-xl tracking-widest"
            value={code}
            onChange={(e) => {
              setCode(cleanCode(e.target.value))
              tried.current = false
            }}
          />
        </div>
      )}

      {bookings.map((p) => (
        <Button key={p.id} size="lg" icon="check" className="w-full" disabled={busy || code.length !== 6} onClick={() => go(p)}>
          {joinKind(p) === 'reports' ? t('reports.joinToken', { token: p.token }) : t('checkin.joinToken', { token: p.token })}
        </Button>
      ))}
      {err && (
        <Notice kind="danger" live>
          {err}
        </Notice>
      )}

      {inLine.map((p) => (
        <Notice key={p.id} kind="info" icon="users" title={t('checkin.already', { token: p.token })}>
          <LinkButton to={`/turn/${p.token}`} variant="secondary" icon="users" className="mt-2 w-full">
            {t('home.seeTurn')}
          </LinkButton>
        </Notice>
      ))}

      {!bookings.length && (
        <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="register" size={22} className="text-brand" />
            {t('checkin.noBooking')}
          </p>
          <p>{t('checkin.registerHere')}</p>
          <LinkButton to="/register" size="lg" icon="register" className="w-full" onClick={() => code.length === 6 && rememberCode(code)}>
            {t('home.register')}
          </LinkButton>
        </section>
      )}
    </div>
  )
}
