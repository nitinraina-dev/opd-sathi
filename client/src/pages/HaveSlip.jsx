import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useI18n } from '../i18n/index.js'
import { useHospital } from '../lib/store.js'
import { useSettings } from '../lib/settings.js'
import { findByToken, followMoves, normalizeToken } from '../lib/queue.js'
import { usePageSpeech } from '../components/pageSpeech.js'
import { Button, LinkButton, PageTitle, TermNote, Notice, RowGroup, ActionRow } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

// The QR on the slip holds a link like https://…/turn/MED-042.
function tokenFromScan(text) {
  const m = String(text).match(/\/turn\/([A-Za-z]{3}-?\d{1,4})/)
  return normalizeToken(m ? m[1] : text)
}

function useBarcodeSupport() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return
    window.BarcodeDetector.getSupportedFormats?.()
      .then((f) => setOk(f.includes('qr_code')))
      .catch(() => setOk(false))
  }, [])
  return ok
}

export default function HaveSlip() {
  const { t } = useI18n()
  const nav = useNavigate()
  const state = useHospital()
  const [settings, setSettings] = useSettings()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const canScan = useBarcodeSupport()
  const videoRef = useRef(null)
  const me = settings.me && state.patients[settings.me] ? followMoves(state, state.patients[settings.me]) : null

  usePageSpeech([t('have.title'), t('have.label'), canScan ? t('have.scan') : ''].join('. '))

  const open = (tok) => {
    const p = findByToken(state, tok)
    if (!p) {
      setError(t('have.notFound'))
      return false
    }
    const cur = followMoves(state, p)
    setSettings({ me: cur.id })
    nav(`/turn/${cur.token}`)
    return true
  }

  useEffect(() => {
    if (!scanning) return
    let stream = null
    let timer = null
    let stopped = false
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((tr) => tr.stop())
          return
        }
        stream = s
        const v = videoRef.current
        v.srcObject = s
        v.play()
        timer = setInterval(async () => {
          try {
            const codes = await detector.detect(v)
            if (codes.length) {
              const raw = String(codes[0].rawValue)
              const checkin = raw.match(/\/checkin\?c=(\d{6})/)
              setScanning(false)
              if (checkin) return nav(`/checkin?c=${checkin[1]}`)
              const tok = tokenFromScan(raw)
              if (!tok || !open(tok)) setError(t('have.notFound'))
            }
          } catch {
            // keep trying
          }
        }, 300)
      })
      .catch(() => {
        setScanning(false)
        setError(t('have.cameraError'))
      })
    return () => {
      stopped = true
      clearInterval(timer)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [scanning]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle sub={t('have.hint')}>{t('have.title')}</PageTitle>

      {me && ['waiting', 'called'].includes(me.status) && (
        <RowGroup>
          <ActionRow onClick={() => open(me.token)} icon="slip" tone="primary" title={me.token} sub={t('have.useMine', { token: me.token })} />
        </RowGroup>
      )}

      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!normalizeToken(value)) return setError(t('have.format'))
          open(value)
        }}
      >
        <label htmlFor="token" className="block font-semibold">
          {t('have.label')}
        </label>
        <p id="token-hint" className="sr-only">
          {t('have.hint')}
        </p>
        <input
          id="token"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase())
            setError('')
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="token-hint token-error"
          aria-invalid={!!error}
          placeholder="MED-042"
          className="token-num w-full rounded-xl border border-line bg-card px-4 py-3 min-h-14 text-2xl uppercase focus:border-brand"
        />
        <p id="token-error" role="alert" className="min-h-6 font-semibold text-danger">
          {error && (
            <span className="flex items-center gap-2">
              <Icon name="alert" size={24} />
              {error}
            </span>
          )}
        </p>
        <Button type="submit" size="lg" icon="next" className="w-full">
          {t('have.open')}
        </Button>
      </form>

      {canScan && !scanning && (
        <Button variant="secondary" icon="camera" className="w-full" onClick={() => setScanning(true)}>
          {t('have.scan')}
        </Button>
      )}
      {scanning && (
        <div className="space-y-3">
          <video ref={videoRef} className="w-full rounded-2xl border-2 border-line bg-black" muted playsInline aria-label={t('have.cameraLabel')} />
          <Notice kind="info" icon="qr">
            {t('have.scanHint')}
          </Notice>
          <Button variant="secondary" icon="close" className="w-full" onClick={() => setScanning(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      )}

      <TermNote term="token" />
      <LinkButton to="/find?to=g_help" variant="ghost" icon="info" className="w-full">
        {t('common.wayToHelp')}
      </LinkButton>
    </div>
  )
}
