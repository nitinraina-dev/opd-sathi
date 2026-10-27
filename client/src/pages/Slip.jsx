import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import Icon from '../components/Icon.jsx'
import { useI18n } from '../i18n/index.js'
import { useHospital, useSimNow } from '../lib/store.js'
import { useSettings } from '../lib/settings.js'
import { findByToken, followMoves } from '../lib/queue.js'
import { speak, spokenToken } from '../lib/speech.js'
import { deptById } from '../data/departments.js'
import { roomsText } from '../lib/text.js'
import SlipCard, { slipInfo, saveSlip, StaffView } from '../components/Slip.jsx'
import { usePageSpeech } from '../components/pageSpeech.js'
import { Button, LinkButton, PageTitle, TermNote, Notice, Modal } from '../components/ui.jsx'
import { PayPanel, Receipts } from '../components/Payment.jsx'
import { useMyRecord, secretFor } from '../lib/mine.js'
import ClaimCard from '../components/ClaimCard.jsx'
import CheckInCard from '../components/CheckInCard.jsx'
import ShareTurn from '../components/ShareTurn.jsx'
import { billFor, freeCheckKind, rupees } from '../lib/billing.js'

export function NotFound({ token }) {
  const { t } = useI18n()
  usePageSpeech(t('slip.notFound', { token: token || '' }))
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle sub={t('slip.notFoundHelp')}>{t('slip.notFound', { token: token || '' })}</PageTitle>
      <LinkButton to="/have-slip" icon="slip" className="w-full">
        {t('home.haveSlip')}
      </LinkButton>
      <LinkButton to="/find?to=g_help" variant="soft" icon="info" className="w-full">
        {t('common.wayToHelp')}
      </LinkButton>
    </div>
  )
}

export function slipSpeech(info) {
  const { t } = info
  return [
    t('slip.title'),
    `${t('slip.token')}: ${spokenToken(info.token)}`,
    `${t('slip.dept')}: ${info.dept}`,
    `${t('slip.room')}: ${info.room}`,
    `${t('slip.doctor')}: ${info.doctor}`,
    info.status === 'waiting' ? `${t('slip.ahead')}: ${info.ahead}. ${t('slip.wait')}: ${info.wait}` : '',
  ]
    .filter(Boolean)
    .join('. ')
}

export default function SlipPage() {
  const { token } = useParams()
  const { t, lang } = useI18n()
  const state = useHospital()
  const now = useSimNow(5000)
  const [settings, setSettings] = useSettings()
  const [big, setBig] = useState(false)
  const [params, setParams] = useSearchParams()
  const found = findByToken(state, token)
  // Emergency visits have no slip or line to follow.
  const raw = found?.kind === 'emergency' ? null : found
  const p = raw ? followMoves(state, raw) : null
  const own = useMyRecord(state, p)
  const bill = billFor(p, own)
  const canPay = !!p && bill.due > 0 && bill.state === 'due' && (!!own || !!secretFor(state, p))
  const [paying, setPaying] = useState(false)
  useEffect(() => {
    if (params.get('pay') === '1' && canPay) setPaying(true)
  }, [canPay]) // eslint-disable-line react-hooks/exhaustive-deps
  const info = p ? slipInfo(state, p, lang, now) : null
  const speech = info ? slipSpeech(info) : ''
  usePageSpeech(speech)

  useEffect(() => {
    if (p && settings.me !== p.id) setSettings({ me: p.id })
  }, [p, settings.me, setSettings])

  if (!p) return <NotFound token={token} />
  const rooms = deptById[p.dept].rooms.map((r) => r.placeId).join(',')

  return (
    <div className="space-y-4">
      <PageTitle>{t('slip.heading')}</PageTitle>
      {raw.id !== p.id && (
        <Notice kind="warn" title={t('slip.changed', { token: p.token })}>
          {t('slip.changedWhy', { dept: t(`depts.${p.dept}.name`) })}
        </Notice>
      )}
      <div className="space-y-4 md:grid md:grid-cols-[minmax(0,26rem)_minmax(0,30rem)] md:items-start md:gap-8 md:space-y-0">
      <SlipCard state={state} p={p} lang={lang} now={now} own={own} />
      <div className="space-y-4">
      {['booked', 'noshow'].includes(p.status) && (
        <div className="print:hidden">
          <CheckInCard state={state} p={p} />
        </div>
      )}
      {canPay && (
        <div className="space-y-2 print:hidden">
          <Button icon="rupee" className="w-full text-xl" onClick={() => setPaying(true)}>
            {t('pay.payNow', { amount: rupees(bill.due) })}
          </Button>
          <p className="text-base text-ink-2">{t('pay.orCounter')}</p>
        </div>
      )}
      {bill.state === 'cardCheck' && (
        <Notice kind="info" icon="badge" title={t('pay.state.cardCheck')}>
          {t(`pay.confirmHow.${own?.waiver ? freeCheckKind(own.waiver.card) : 'any'}`)}
        </Notice>
      )}
      <div className="print:hidden">
        <ClaimCard claim={own?.claim} />
      </div>

      <div className="space-y-3 print:hidden">
        <LinkButton to={`/turn/${p.token}`} size="lg" icon="users" className="w-full">
          {t('slip.follow')}
        </LinkButton>
        {['booked', 'waiting'].includes(p.status) && <ShareTurn p={p} />}
        <div className="grid grid-cols-5 gap-1 rounded-2xl border border-line bg-card p-1">
          {[
            ['map', t('slip.actWay'), null, `/find?to=${rooms}`],
            ['speaker', t('slip.actListen'), () => speak(speech, lang)],
            ['eye', t('slip.actStaff'), () => setBig(true)],
            ['download', t('slip.actSave'), () => saveSlip(info)],
            ['print', t('slip.actPrint'), () => window.print()],
          ].map(([icon, label, onClick, to]) => {
            const cls = 'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-xs font-semibold leading-tight text-ink no-underline hover:bg-page'
            return to ? (
              <Link key={icon} to={to} className={cls}>
                <Icon name={icon} size={22} className="text-brand" />
                {label}
              </Link>
            ) : (
              <button key={icon} type="button" onClick={onClick} className={cls}>
                <Icon name={icon} size={22} className="text-brand" />
                {label}
              </button>
            )
          })}
        </div>
        <TermNote term="slip" />
        <TermNote term="token" />
      </div>

      {own && (
        <div className="print:hidden">
          <Receipts p={p} own={own} lang={lang} />
        </div>
      )}
      </div>
      </div>
      {p && (
        <PayPanel
          open={paying}
          onClose={() => {
            setPaying(false)
            if (params.get('pay')) setParams({}, { replace: true })
          }}
          p={p}
          secret={secretFor(state, p)}
          due={bill.due}
        />
      )}

      <Modal open={big} onClose={() => setBig(false)} title={t('slip.showStaff')} wide>
        <StaffView p={p} lang={lang} name={info.name} />
      </Modal>
    </div>
  )
}
