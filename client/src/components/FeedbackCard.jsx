import { useState } from 'react'
import { useI18n } from '../i18n/index.js'
import { SCORES, SCORE_ICON, REASONS } from '../data/feedback.js'
import { sendFeedback } from '../lib/feedback.js'
import { Button, Card, Notice } from './ui.jsx'
import Icon from './Icon.jsx'

// "How was your visit?" after the doctor. "Good" is one tap; "okay" and
// "bad" may say what went wrong (optional) before sending. Once per visit.
export default function FeedbackCard({ p, secret }) {
  const { t } = useI18n()
  const [score, setScore] = useState(null)
  const [reasons, setReasons] = useState([])
  const [step, setStep] = useState('ask') // 'ask' | 'busy' | 'sent' | 'failed'

  const send = async (s, rs) => {
    setStep('busy')
    try {
      await sendFeedback(p, secret, s, rs)
      setStep('sent')
    } catch {
      setStep('failed')
    }
  }

  if (step === 'sent')
    return (
      <Notice kind="ok" title={t('feedback.thanks')} live>
        {t('feedback.thanksSub')}
      </Notice>
    )

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{t('feedback.title')}</h2>
        <p className="text-ink-2">{t('feedback.sub')}</p>
      </div>
      <div role="radiogroup" aria-label={t('feedback.title')} className="grid grid-cols-3 gap-2">
        {SCORES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={score === s}
            disabled={step === 'busy'}
            onClick={() => {
              setScore(s)
              if (s === 'good') send(s, [])
            }}
            className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border text-base font-semibold ${
              score === s ? 'border-brand bg-brand-soft' : 'border-line bg-card hover:border-brand'
            }`}
          >
            <Icon name={SCORE_ICON[s]} size={36} className="text-brand" />
            {t(`feedback.score.${s}`)}
          </button>
        ))}
      </div>
      {score && score !== 'good' && (
        <div className="space-y-2">
          <p className="font-semibold">{t('feedback.whatWrong')}</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => {
              const on = reasons.includes(r)
              return (
                <button
                  key={r}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setReasons(on ? reasons.filter((x) => x !== r) : [...reasons, r])}
                  className={`flex min-h-12 items-center gap-2 rounded-full border px-3 text-base ${on ? 'border-brand bg-brand-soft' : 'border-line bg-card'}`}
                >
                  <Icon name={on ? 'check' : 'plus'} size={18} />
                  {t(`feedback.reason.${r}`)}
                </button>
              )
            })}
          </div>
          <Button icon="check" className="w-full" disabled={step === 'busy'} onClick={() => send(score, reasons)}>
            {t('feedback.send')}
          </Button>
        </div>
      )}
      {step === 'failed' && (
        <Notice kind="danger" live>
          {t('feedback.failed')}
        </Notice>
      )}
    </Card>
  )
}
