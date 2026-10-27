import { useState } from 'react'
import { useI18n } from '../i18n/index.js'
import { checkInWithCode, cleanCode } from '../lib/checkin.js'
import { joinKind } from '../lib/queue.js'
import { Button, Card, LinkButton, Notice } from './ui.jsx'
import Icon from './Icon.jsx'

// A booking, a missed turn, or someone back with test reports: how to join
// the line at the hospital.
export default function CheckInCard({ state, p }) {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const kind = joinKind(p)
  const title = { missed: t('checkin.missedTitle'), reports: t('reports.joinTitle') }[kind] || t('checkin.title')
  const body = { missed: t('checkin.missedBody'), reports: t('reports.joinBody') }[kind] || t('checkin.body')

  const submit = async (e) => {
    e.preventDefault()
    if (code.length !== 6) return setErr(t('checkin.err.badCode'))
    setErr('')
    setBusy(true)
    try {
      await checkInWithCode(state, p, code)
    } catch (e2) {
      setErr(t(`checkin.err.${e2.code}`, { token: p.token }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 border-l-4 border-l-warn">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="qr" size={22} />
        {title}
      </h2>
      <p>{body}</p>
      <form onSubmit={submit} className="space-y-2" noValidate>
        <label htmlFor={`code-${p.id}`} className="block text-sm font-semibold text-ink-2">
          {t('checkin.typeCode')}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={`code-${p.id}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="min-h-12 w-full rounded-xl border border-line bg-card px-3 text-center font-mono text-xl tracking-widest min-[420px]:w-36"
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            aria-describedby={err ? `code-err-${p.id}` : undefined}
          />
          <Button type="submit" icon="check" disabled={busy} className="flex-1 whitespace-nowrap">
            {t('checkin.join')}
          </Button>
        </div>
      </form>
      {err && (
        <Notice kind="danger" live>
          <span id={`code-err-${p.id}`}>{err}</span>
        </Notice>
      )}
      <p className="text-sm text-ink-2">{t('checkin.counter')}</p>
      <LinkButton to="/find?to=f1_waitA" variant="soft" icon="map" className="w-full">
        {t('checkin.wayToScreen')}
      </LinkButton>
    </Card>
  )
}
