import { useI18n, translate, LANGS, plural } from '../i18n/index.js'
import { useSettings } from '../lib/settings.js'
import { useHospital, useSimNow } from '../lib/store.js'
import { followMoves, aheadOf, estimateWait } from '../lib/queue.js'
import { waitText } from '../lib/text.js'
import { usePageSpeech } from '../components/pageSpeech.js'
import { LinkButton, TermNote, PageTitle, RowGroup, ActionRow } from '../components/ui.jsx'
import { NearbySuggestion } from '../components/Nearby.jsx'
import TokenTicket from '../components/TokenTicket.jsx'
import Icon from '../components/Icon.jsx'

function LanguagePick() {
  const [, set] = useSettings()
  usePageSpeech(`${translate('en', 'lang.title')}. ${translate('hi', 'lang.title')}.`)
  return (
    <div className="mx-auto max-w-md space-y-6 pt-4">
      <div className="text-center">
        <span aria-hidden="true" className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-brand-ink">
          <Icon name="globe" size={30} />
        </span>
        <h1 className="text-2xl font-bold leading-tight">
          <span lang="en" className="block">
            {translate('en', 'lang.title')}
          </span>
          <span lang="hi" className="block">
            {translate('hi', 'lang.title')}
          </span>
        </h1>
      </div>
      <RowGroup>
        {LANGS.map((l) => (
          <ActionRow key={l} onClick={() => set({ lang: l })} icon="globe" lang={l} title={translate(l, 'lang.self')} sub={translate(l, 'lang.continue')} />
        ))}
      </RowGroup>
      <p className="text-center text-sm text-ink-2">
        <span lang="en" className="block">
          {translate('en', 'lang.later')}
        </span>
        <span lang="hi" className="block">
          {translate('hi', 'lang.later')}
        </span>
      </p>
    </div>
  )
}

export default function Home() {
  const { t, lang } = useI18n()
  const [settings] = useSettings()
  const state = useHospital()
  const now = useSimNow(5000)
  const raw = settings.me && state.patients[settings.me]
  const me = raw ? followMoves(state, raw) : null
  const active = me && ['booked', 'waiting', 'called'].includes(me.status)
  const ahead = active ? aheadOf(state, me) : 0

  usePageSpeech(
    settings.lang
      ? [t('home.greeting'), t('home.subtitle'), t('home.register'), t('home.haveSlip'), t('home.find'), t('home.plan'), t('home.emergency')].join('. ')
      : '',
  )

  if (!settings.lang) return <LanguagePick />

  // Phones: one column (greeting, token, actions, Emergency). Laptops: actions
  // on the left; the token, Emergency and "how it works" on the right.
  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start md:gap-x-10" lang={lang}>
      <div className="md:col-start-1 md:row-start-1">
        <p className="text-sm font-semibold text-ink-2">{t('app.hospital')}</p>
        <PageTitle sub={t('home.subtitle')}>{t('home.greeting')}</PageTitle>
      </div>

      <aside className="contents md:col-start-2 md:row-span-2 md:row-start-1 md:block md:space-y-4">
      {active && (
        <div className="order-1 md:order-none">
        <TokenTicket
          token={me.token}
          top={t('home.yourToken')}
          title={
            me.status === 'called' ? (
              t('home.calledNow')
            ) : me.status === 'booked' ? (
              <>
                <span className="block">{t('checkin.notYet')}</span>
                <span className="block text-base font-normal text-ink/70">{t('checkin.notYetSub')}</span>
              </>
            ) : (
              <>
                <span className="block">{plural(t, 'turn.ahead', ahead)}</span>
                <span className="block text-base font-normal text-ink/70">{waitText(estimateWait(state, me.dept, ahead, now), t)}</span>
              </>
            )
          }
        >
          <LinkButton to={`/turn/${me.token}`} size="lg" icon="users" className="w-full">
            {t('home.seeTurn')}
          </LinkButton>
        </TokenTicket>
        </div>
      )}
      {active && me.status === 'booked' && (
        <div className="order-1 md:order-none">
          <NearbySuggestion state={state} dept={me.dept} now={now} />
        </div>
      )}
      {!active && (
        <section className="hidden rounded-2xl border border-line bg-card p-5 md:block" aria-labelledby="home-how">
          <h2 id="home-how" className="mb-3 text-lg font-semibold">
            {t('home.howTitle')}
          </h2>
          <ol className="space-y-3">
            {(state.arrival !== false ? ['how1Arrive', 'how2Arrive', 'how3'] : ['how1', 'how2', 'how3']).map((k, i) => (
              <li key={k} className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span>
                <span className="pt-0.5">{t(`home.${k}`)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="order-3 md:order-none">
        <RowGroup>
          <ActionRow to="/emergency" icon="emergency" tone="danger" title={t('home.emergency')} sub={t('home.emergencySub')} />
        </RowGroup>
      </div>
      <div className="order-4 md:order-none">
        <TermNote term="opd" />
      </div>
      </aside>

      <section aria-labelledby="home-need" className="order-2 md:order-none md:col-start-1 md:row-start-2">
        <h2 id="home-need" className="mb-2 text-lg font-semibold">
          {t('home.whatNeed')}
        </h2>
        <RowGroup>
          <ActionRow to="/register" icon="register" tone="primary" title={t('home.register')} sub={t('home.registerSub')} />
          <ActionRow to="/have-slip" icon="slip" title={t('home.haveSlip')} sub={t('home.haveSlipSub')} />
          <ActionRow to="/find" icon="map" title={t('home.find')} sub={t('home.findSub')} />
          <ActionRow to="/plan" icon="calendar" title={t('home.plan')} sub={t('home.planSub')} />
          <ActionRow to="/ask" icon="mic" title={t('home.ask')} sub={t('home.askSub')} />
          <ActionRow to="/board?view=phone" icon="tv" title={t('home.board')} sub={t('home.boardSub')} />
        </RowGroup>
      </section>
    </div>
  )
}
