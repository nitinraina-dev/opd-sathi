import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { useI18n } from '../i18n/index.js'
import { useSettings, loadDraft, saveDraft, clearDraft } from '../lib/settings.js'
import { registerPatient } from '../lib/actions.js'
import { recentCode, forgetCode } from '../lib/checkin.js'
import { rememberMine } from '../lib/mine.js'
import { digitsOnly } from '../lib/speech.js'
import { departments } from '../data/departments.js'
import { usePageSpeech, usePageBack } from '../components/pageSpeech.js'
import { Button, LinkButton, PageTitle, Progress, Toggle, Choice, TermNote, Notice } from '../components/ui.jsx'
import MicButton from '../components/MicButton.jsx'
import Icon from '../components/Icon.jsx'
import { autoFreeReason, freeCheckKind, rupees } from '../lib/billing.js'
import { OPD_FEE, FREE_CARDS } from '../data/fees.js'

const TOTAL = 6

// Signs that need care right away. The app never judges them: it only says
// "go to Emergency now".
export const SIGNS = [
  ['chest', 'heart'],
  ['breath', 'lungs'],
  ['bleeding', 'blood'],
  ['faint', 'faint'],
  ['stroke', 'face'],
  ['injury', 'injury'],
  ['pregnant', 'pregnant'],
  ['child', 'child'],
]

const GENDERS = [
  ['f', 'woman'],
  ['m', 'man'],
  ['x', 'person'],
]

const inputCls =
  'w-full rounded-xl border border-line bg-card px-4 py-3 min-h-14 text-xl font-semibold placeholder:font-normal placeholder:text-ink-2/60 focus:border-brand'

function cleanName(s) {
  const n = String(s).replace(/[.,!?।]+$/u, '').trim().slice(0, 40)
  return n.charAt(0).toUpperCase() + n.slice(1)
}

export default function Register() {
  const { t, lang } = useI18n()
  const [settings, setSettings] = useSettings()
  const nav = useNavigate()
  const [draft, setDraftState] = useState(loadDraft)
  const [error, setError] = useState('')
  const step = draft.step || 0
  const assisted = settings.assisted

  const setDraft = (patch) =>
    setDraftState((d) => {
      const n = { ...d, ...patch }
      saveDraft(n)
      return n
    })
  const go = (n) => {
    setError('')
    setDraft({ step: n })
    window.scrollTo(0, 0)
  }
  const q = (k) => t(`reg.${k}.${assisted ? 'qHelper' : 'q'}`)
  // The top bar's Back goes to the previous question, like the Back below.
  const stepBack = useCallback(() => go(step - 1), [step]) // eslint-disable-line react-hooks/exhaustive-deps
  usePageBack(step > 0 ? stepBack : null)

  // Free care that needs no card (age or pregnancy care).
  const free = autoFreeReason({ age: draft.age === '' || draft.age == null ? null : Number(draft.age), dept: draft.dept })

  const validate = () => {
    if (step === 1 && !String(draft.name || '').trim()) return t('reg.name.error')
    if (step === 2) {
      const a = Number(draft.age)
      if (draft.age === '' || draft.age == null || !Number.isInteger(a) || a < 0 || a > 120) return t('reg.age.error')
    }
    if (step === 3 && !draft.gender) return t('reg.gender.error')
    if (step === 4 && draft.mobile && !/^[6-9]\d{9}$/.test(draft.mobile)) return t('reg.mobile.error')
    if (step === 5 && !draft.dept) return t('reg.dept.error')
    if (step === 6 && !free) {
      if (!draft.payChoice) return t('reg.fee.error')
      if (draft.payChoice === 'card' && !draft.card) return t('reg.fee.cardError')
    }
    return ''
  }

  const [busy, setBusy] = useState(false)
  const next = async () => {
    const e = validate()
    if (e) return setError(e)
    if (step < TOTAL) return go(step + 1)
    if (busy) return
    setBusy(true)
    let p = null
    try {
      p = await registerPatient({
      name: cleanName(draft.name),
      age: Number(draft.age),
      gender: draft.gender,
      mobile: draft.mobile || '',
      dept: draft.dept,
      assisted,
      lang,
      payChoice: free ? 'counter' : draft.payChoice,
      card: draft.payChoice === 'card' ? draft.card : '',
      // Scanned the hospital's code just before: join the line now. (The
      // server checks the code; the offline demo trusts `here`.)
      checkInCode: recentCode(),
      here: !!recentCode(),
    })
    } catch (err) {
      setBusy(false)
      if (err.code === 'deviceLimit') return setError(t('reg.deviceLimit', { token: err.token || '' }))
      if (err.code === 'tooMany') return setError(t('reg.tooMany'))
      return setError(t('reg.failed'))
    }
    forgetCode()
    rememberMine(p)
    setSettings({ me: p.id })
    clearDraft()
    nav(`/slip/${p.token}${!free && draft.payChoice === 'upi' ? '?pay=1' : ''}`, { replace: true })
  }

  const keys = ['safety', 'name', 'age', 'gender', 'mobile', 'dept', 'fee']
  const k = keys[step]
  const speech =
    step === 0
      ? [t('reg.safety.title'), q('safety'), ...SIGNS.map(([s]) => t(`signs.${s}`)), t('reg.safety.goNow'), t('reg.safety.noToken')].join('. ')
      : [t('reg.stepOf', { n: step, total: TOTAL }), q(k), t(`reg.${k}.hint`), error].filter(Boolean).join('. ')
  usePageSpeech(speech)

  const helper = (
    <div className="mb-4 space-y-2">
      <Toggle
        icon="hand"
        label={t('reg.helper')}
        hint={assisted ? t('reg.helperOn') : t('reg.helperHint')}
        checked={assisted}
        onChange={(v) => setSettings((s) => ({ assisted: v, avoidStairs: v ? true : s.avoidStairs }))}
      />
    </div>
  )

  if (step === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageTitle key="s0" sub={q('safety')}>
          {t('reg.safety.title')}
        </PageTitle>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {SIGNS.map(([s, icon]) => (
            <li key={s} className="flex items-center gap-3 px-4 py-2.5">
              <Icon name={icon} size={24} className="shrink-0 text-danger" />
              <span className="leading-snug">{t(`signs.${s}`)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-3 rounded-2xl bg-danger p-4 text-danger-ink">
          <p className="text-xl font-bold leading-tight">{t('reg.safety.goNow')}</p>
          <p>{t('reg.safety.noToken')}</p>
          <LinkButton to="/emergency" variant="secondary" icon="emergency" className="w-full">
            {t('reg.safety.goButton')}
          </LinkButton>
        </div>
        {helper}
        <Button size="lg" icon="next" onClick={() => go(1)} className="w-full">
          {t('reg.safety.none')}
        </Button>
        <TermNote term="token" />
      </div>
    )
  }

  const errId = 'reg-error'
  return (
    <form
      className="mx-auto max-w-xl space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        next()
      }}
    >
      <Progress step={step} total={TOTAL} />
      <PageTitle key={`s${step}`} id="reg-q">
        {q(k)}
      </PageTitle>
      <p id="reg-hint" className="-mt-3 text-ink-2">
        {t(`reg.${k}.hint`)}
      </p>

      {step === 1 && (
        <>
          <input
            id="reg-name"
            className={inputCls}
            value={draft.name || ''}
            onChange={(e) => setDraft({ name: e.target.value })}
            autoComplete="given-name"
            maxLength={40}
            aria-labelledby="reg-q"
            aria-describedby={`reg-hint ${errId}`}
            aria-invalid={!!error}
            placeholder={t('reg.name.placeholder')}
          />
          <MicButton onText={(s) => setDraft({ name: cleanName(s) })} />
        </>
      )}

      {step === 2 && (
        <>
          <input
            id="reg-age"
            className={`${inputCls} text-center text-3xl`}
            value={draft.age ?? ''}
            onChange={(e) => setDraft({ age: digitsOnly(e.target.value).slice(0, 3) })}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            aria-labelledby="reg-q"
            aria-describedby={`reg-hint ${errId}`}
            aria-invalid={!!error}
            placeholder="62"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon="minus"
              onClick={() => setDraft({ age: String(Math.max(0, (Number(draft.age) || 0) - 1)) })}
            >
              {t('reg.age.less')}
            </Button>
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => setDraft({ age: String(Math.min(120, (Number(draft.age) || 0) + 1)) })}
            >
              {t('reg.age.more')}
            </Button>
          </div>
          <MicButton onText={(s) => setDraft({ age: digitsOnly(s).slice(0, 3) })} />
        </>
      )}

      {step === 3 && (
        <div role="radiogroup" aria-labelledby="reg-q" aria-describedby={errId} className="grid gap-3">
          {GENDERS.map(([g, icon]) => (
            <Choice
              key={g}
              icon={icon}
              title={t(`gender.${g}`)}
              selected={draft.gender === g}
              onSelect={() => {
                setError('')
                setDraft({ gender: g })
              }}
            />
          ))}
        </div>
      )}

      {step === 4 && (
        <>
          <input
            id="reg-mobile"
            type="tel"
            className={inputCls}
            value={draft.mobile || ''}
            onChange={(e) => setDraft({ mobile: digitsOnly(e.target.value).slice(0, 10) })}
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            aria-labelledby="reg-q"
            aria-describedby={`reg-hint ${errId}`}
            aria-invalid={!!error}
            placeholder={t('reg.mobile.placeholder')}
          />
          <MicButton onText={(s) => setDraft({ mobile: digitsOnly(s).slice(-10) })} />
          <Notice kind="info" icon="badge">
            {t('reg.mobile.noId')}
          </Notice>
        </>
      )}

      {step === 5 && (
        <>
          <div role="radiogroup" aria-labelledby="reg-q" aria-describedby={errId} className="grid gap-3">
            {departments.map((d) => (
              <Choice
                key={d.id}
                icon={d.icon}
                title={t(`depts.${d.id}.name`)}
                sub={t(`depts.${d.id}.words`)}
                selected={draft.dept === d.id}
                onSelect={() => {
                  setError('')
                  setDraft({ dept: d.id })
                }}
              />
            ))}
          </div>
          <LinkButton to="/find?to=g_help" variant="ghost" icon="question" className="w-full">
            {t('reg.dept.notSure')}
          </LinkButton>
        </>
      )}

      {step === 6 &&
        (free ? (
          <Notice kind="ok" icon="check" title={t('reg.fee.freeTitle', { reason: t(`pay.free.${free}`) })}>
            {t(`reg.fee.freeCheck.${freeCheckKind(free)}`, { amount: rupees(OPD_FEE) })}
          </Notice>
        ) : (
          <>
            <p className="flex items-center gap-2 text-xl font-bold">
              <Icon name="rupee" size={24} />
              {t('reg.fee.amount', { amount: rupees(OPD_FEE) })}
            </p>
            <div role="radiogroup" aria-labelledby="reg-q" aria-describedby={errId} className="grid gap-3">
              {[
                ['upi', 'phone'],
                ['counter', 'rupee'],
                ['card', 'badge'],
              ].map(([c, icon]) => (
                <Choice
                  key={c}
                  icon={icon}
                  title={t(`reg.fee.${c}`)}
                  sub={t(`reg.fee.${c}Sub`)}
                  selected={draft.payChoice === c}
                  onSelect={() => {
                    setError('')
                    setDraft({ payChoice: c })
                  }}
                />
              ))}
            </div>
            {draft.payChoice === 'card' && (
              <div className="space-y-2">
                <p id="reg-card" className="font-semibold">
                  {t('reg.fee.whichCard')}
                </p>
                <div role="radiogroup" aria-labelledby="reg-card" className="grid gap-2">
                  {FREE_CARDS.map((c) => (
                    <Choice
                      key={c}
                      icon="badge"
                      title={t(`cards.${c}`)}
                      selected={draft.card === c}
                      onSelect={() => {
                        setError('')
                        setDraft({ card: c })
                      }}
                    />
                  ))}
                </div>
                <p className="text-base text-ink-2">{t('reg.fee.cardNote')}</p>
              </div>
            )}
            <p className="flex items-start gap-2 text-sm text-ink-2">
              <Icon name="hand" size={18} className="mt-0.5 shrink-0" />
              {t('reg.fee.never')}
            </p>
          </>
        ))}

      <p id={errId} role="alert" className="min-h-6 font-semibold text-danger">
        {error && (
          <span className="flex items-center gap-2">
            <Icon name="alert" size={24} />
            {error}
          </span>
        )}
      </p>

      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Button variant="secondary" size="lg" icon="back" onClick={() => go(step - 1)}>
          {t('common.back')}
        </Button>
        {step === 4 && !draft.mobile ? (
          <Button type="submit" variant="primary" size="lg" icon="next">
            {t('reg.mobile.skip')}
          </Button>
        ) : (
          <Button type="submit" variant="primary" size="lg" icon={step === TOTAL ? 'check' : 'next'} disabled={busy}>
            {step === TOTAL ? t('reg.finish') : t('common.next')}
          </Button>
        )}
      </div>
    </form>
  )
}
