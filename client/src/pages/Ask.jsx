import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/index.js'
import { useHospital, useMode } from '../lib/store.js'
import { useSettings } from '../lib/settings.js'
import { api } from '../lib/auth.js'
import { simpleAnswer } from '../lib/ask.js'
import { secretFor } from '../lib/mine.js'
import { listenOnce, canListen, speak, canSpeak } from '../lib/speech.js'
import { usePageSpeech } from '../components/pageSpeech.js'
import { Button, Card, LinkButton, Notice, PageTitle } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'

// Ask about places, waiting, timings or fees, by voice or typing, in Hindi or
// English. The answer is read aloud, with the way there. Urgent words always
// lead to Emergency. Server: Google Gemini (if set up) or word matching; offline:
// word matching in the browser.
export default function Ask() {
  const { t, lang } = useI18n()
  const state = useHospital()
  const { mode } = useMode()
  const [settings] = useSettings()
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const [ans, setAns] = useState(null)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [err, setErr] = useState('')
  const [ai, setAi] = useState(false)
  const me = settings.me ? state.patients[settings.me] || null : null

  useEffect(() => {
    if (mode === 'server')
      api('/ask/status')
        .then((j) => setAi(!!j.ai))
        .catch(() => {})
  }, [mode])
  usePageSpeech(ans ? ans.answer : `${t('ask.title')}. ${t('ask.intro')}`)

  const ask = async (question) => {
    question = question.trim()
    if (!question || busy) return
    setErr('')
    setBusy(true)
    setAsked(question)
    setAns(null)
    try {
      const out =
        mode === 'server'
          ? await api('/ask', { question, lang, pid: me?.id, secret: me ? secretFor(state, me) : undefined })
          : simpleAnswer(state, question, lang, me)
      setAns(out)
      setQ('')
      speak(out.answer, lang)
    } catch {
      setErr(t('ask.failed'))
    } finally {
      setBusy(false)
    }
  }

  const listen = async () => {
    setErr('')
    setListening(true)
    try {
      const heard = await listenOnce(lang)
      setListening(false)
      await ask(heard)
    } catch {
      setListening(false)
      setErr(t('ask.micFailed'))
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle sub={t('ask.intro')}>{t('ask.title')}</PageTitle>

      {canListen && (
        <button
          type="button"
          onClick={listen}
          disabled={listening || busy}
          aria-pressed={listening}
          className={`flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl text-xl font-bold ${
            listening ? 'bg-danger text-danger-ink' : 'bg-brand text-brand-ink hover:opacity-95'
          }`}
        >
          <Icon name="mic" size={34} />
          {listening ? t('ask.listening') : t('ask.speak')}
        </button>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          ask(q)
        }}
        className="space-y-2"
      >
        <label htmlFor="ask-q" className="block text-sm font-semibold text-ink-2">
          {t('ask.typeLabel')}
        </label>
        <div className="flex gap-2">
          <input
            id="ask-q"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-base"
            value={q}
            maxLength={300}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <Button type="submit" icon="next" disabled={busy || !q.trim()}>
            {t('ask.send')}
          </Button>
        </div>
      </form>

      {!ans && !busy && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-2">{t('ask.examples')}</p>
          <div className="flex flex-wrap gap-2">
            {['ex1', 'ex2', 'ex3', 'ex4'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => ask(t(`ask.${k}`))}
                className="min-h-11 rounded-full border border-line bg-card px-4 text-left hover:border-brand"
              >
                {t(`ask.${k}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {busy && (
        <p role="status" className="flex items-center gap-2 text-ink-2">
          <Icon name="clock" size={20} />
          {t('ask.thinking')}
        </p>
      )}
      {err && (
        <Notice kind="danger" live>
          {err}
        </Notice>
      )}

      {ans && (
        <Card className={`space-y-3 ${ans.emergency ? 'border-danger' : ''}`} aria-live="polite">
          <p className="text-sm text-ink-2">
            {t('ask.you')}: “{asked}”
          </p>
          <p className={`text-lg ${ans.emergency ? 'font-bold text-danger' : ''}`}>{ans.answer}</p>
          <div className="flex flex-wrap gap-2">
            {ans.emergency ? (
              <LinkButton to="/emergency" variant="danger" size="lg" icon="emergency" className="w-full">
                {t('ask.goEmergency')}
              </LinkButton>
            ) : (
              ans.placeId && (
                <LinkButton to={`/find?to=${ans.placeId}`} icon="map" className="flex-1">
                  {t('ask.showWay')}
                </LinkButton>
              )
            )}
            {canSpeak && (
              <Button variant="secondary" icon="speaker" onClick={() => speak(ans.answer, lang)}>
                {t('ask.hear')}
              </Button>
            )}
          </div>
        </Card>
      )}

      <p className="text-sm text-ink-2">{t('ask.notMedical')}</p>
      {ai && <p className="text-sm text-ink-2">{t('ask.aiNote')}</p>}
    </div>
  )
}
