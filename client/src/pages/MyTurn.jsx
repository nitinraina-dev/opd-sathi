import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useI18n, plural } from '../i18n/index.js'
import { useHospital, useSimNow } from '../lib/store.js'
import { useSettings } from '../lib/settings.js'
import { findByToken, followMoves, aheadOf, estimateWait, roomState, servingIn, reportsState, hasRated } from '../lib/queue.js'
import { RETURN_AFTER } from '../lib/engine.js'
import { chime, vibrate } from '../lib/sound.js'
import { speak, spokenToken } from '../lib/speech.js'
import { useConditions } from '../lib/conditions.js'
import { showAlert, enableAlerts, pushIsOn, pushSupported, notificationsSupported } from '../lib/notify.js'
import { isServer } from '../lib/store.js'
import { trafficAt, trafficLabel, travelFactor } from '../lib/model.js'
import { dateKey, minutesOfDay, fmtTime } from '../lib/clock.js'
import { deptById } from '../data/departments.js'
import { roomsText, roomFloorText, deptFloor, waitText, doctorStatusText, messageText } from '../lib/text.js'
import { usePageSpeech } from '../components/pageSpeech.js'
import { Button, LinkButton, PageTitle, Notice, Card, TermNote, RowGroup, ActionRow } from '../components/ui.jsx'
import TokenTicket from '../components/TokenTicket.jsx'
import RouteView from '../components/Route.jsx'
import Icon from '../components/Icon.jsx'
import { NotFound } from './Slip.jsx'
import { PayPanel, itemName } from '../components/Payment.jsx'
import { useMyRecord, secretFor } from '../lib/mine.js'
import ClaimCard from '../components/ClaimCard.jsx'
import CheckInCard from '../components/CheckInCard.jsx'
import FeedbackCard from '../components/FeedbackCard.jsx'
import ShareTurn from '../components/ShareTurn.jsx'
import { billFor, freeCheckKind, rupees } from '../lib/billing.js'
import { testById } from '../data/fees.js'

const ALERTED = 'opd-saathi-alerted'

function readAlerted() {
  try {
    return JSON.parse(localStorage.getItem(ALERTED) || '{}')
  } catch {
    return {}
  }
}
function markAlerted(key) {
  const a = readAlerted()
  a[key] = true
  try {
    localStorage.setItem(ALERTED, JSON.stringify(a))
  } catch {
    // ignore
  }
}

const statusIcon = { available: 'check', break: 'clock', late: 'alert' }

export default function MyTurn() {
  const { token } = useParams()
  const { t, lang } = useI18n()
  const state = useHospital()
  const now = useSimNow(2000)
  const [settings, setSettings] = useSettings()
  const [banner, setBanner] = useState(null)
  // 'push': alerts even when closed; 'local': while open; 'off', 'denied', 'unsupported'
  const [alerts, setAlerts] = useState('off')
  const [asking, setAsking] = useState(false)
  const { cond } = useConditions(now)
  const [paying, setPaying] = useState(false)

  const found = findByToken(state, token)
  // Emergency visits have no slip or line to follow.
  const raw = found?.kind === 'emergency' ? null : found
  const p = raw ? followMoves(state, raw) : null
  const own = useMyRecord(state, p)
  const bill = billFor(p, own)
  const tests = (own?.bill || []).filter((i) => i.kind === 'test')
  const dept = p ? deptById[p.dept] : null
  const ahead = p ? aheadOf(state, p) : 0
  const wait = p ? estimateWait(state, p.dept, ahead, now) : 0
  const near = p?.status === 'waiting' && ahead <= 3
  const called = p?.status === 'called'
  const roomPlaceId = called ? dept.rooms.find((r) => r.room === p.room)?.placeId : null
  const floorRef = p ? t(`floors.${deptFloor(p.dept)}.ref`) : ''
  // Seen by the doctor, with tests to do before coming back with the reports.
  const reports = reportsState(p)
  const atTests = p?.status === 'done' && ['pending', 'ready'].includes(reports)
  // Only the phone that registered (it has the key) joins the line or gives feedback.
  const secret = p ? secretFor(state, p) : ''
  const mine = !isServer() || !!secret

  useEffect(() => {
    if (p && settings.me !== p.id) setSettings({ me: p.id })
  }, [p, settings.me, setSettings])

  useEffect(() => {
    if (!notificationsSupported()) return setAlerts('unsupported')
    if (Notification.permission === 'denied') return setAlerts('denied')
    if (p && pushIsOn(p.id)) return setAlerts('push')
    setAlerts(Notification.permission === 'granted' ? 'local' : 'off')
  }, [p?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const turnOnAlerts = async () => {
    setAsking(true)
    setAlerts(await enableAlerts(p, lang))
    setAsking(false)
  }

  // Alerts: once when 3 or fewer people are ahead, once when called.
  useEffect(() => {
    if (!p) return
    const fire = (kind) => {
      const key = `${p.id}:${kind}`
      if (readAlerted()[key]) return
      markAlerted(key)
      const title = kind === 'called' ? t('turn.calledTitle') : t('turn.nearTitle')
      const body =
        kind === 'called'
          ? t('turn.calledGo', { room: p.room, floor: floorRef })
          : t('turn.nearBody', { rooms: roomsText(p.dept, t), floor: floorRef })
      vibrate(kind === 'called' ? [500, 200, 500, 200, 500] : [300, 150, 300])
      chime(kind === 'called' ? 'called' : 'near')
      setBanner(kind)
      // Same tag as the server's push alert, so the phone shows only one.
      showAlert(title, { body, tag: `${p.token}-${kind}`, renotify: true, data: { url: `/turn/${p.token}` } })
      speak(`${title}. ${kind === 'called' ? spokenToken(p.token) + '. ' : ''}${body}`, lang)
    }
    if (near) fire('near')
    if (called) fire('called')
  }, [p?.id, near, called]) // eslint-disable-line react-hooks/exhaustive-deps

  const chain = []
  for (let x = raw; x; x = x.movedTo ? state.patients[x.movedTo] : null) {
    chain.push(x.id)
    if (chain.length > 10) break
  }
  const msgs = state.messages.filter((m) => chain.includes(m.pid)).slice(0, 5)

  let speech = ''
  if (p) {
    if (called) speech = `${t('turn.calledTitle')}. ${t('turn.calledGo', { room: p.room, floor: floorRef })}`
    else if (p.status === 'waiting')
      speech = ahead === 0 ? t('turn.youAreNext') : `${plural(t, 'turn.ahead', ahead)}. ${waitText(wait, t)}.`
    else speech = atTests ? t('turn.status.tests') : t(`turn.status.${p.status}`)
  }
  usePageSpeech(speech)

  if (!p) return <NotFound token={token} />

  const minute = minutesOfDay(now)
  const traffic = cond ? trafficAt(cond, dateKey(now), minute) : null

  const sectionTitle = 'mb-2 text-lg font-semibold'

  return (
    <div className="space-y-5">
      <PageTitle>{t('turn.title')}</PageTitle>

      {raw.id !== p.id && <Notice kind="warn" title={t('slip.changed', { token: p.token })} />}

      <div className="space-y-5 md:grid md:grid-cols-2 md:items-start md:gap-8 md:space-y-0">
      <div className="space-y-5">
      {called && (
        <section role="alert" className="space-y-2 rounded-2xl bg-ok p-5 text-ok-ink">
          <p className="text-3xl font-extrabold leading-tight">{t('turn.calledTitle')}</p>
          <p className="token-num text-4xl">{p.token}</p>
          <p className="text-xl font-bold leading-snug">{t('turn.calledGo', { room: p.room, floor: floorRef })}</p>
          <p>{t('turn.calledDoor')}</p>
        </section>
      )}

      {banner === 'near' && p.status === 'waiting' && (
        <div role="alert" className="rounded-2xl border-l-4 border-warn bg-warn-soft p-4">
          <p className="flex items-center gap-2 text-lg font-bold leading-tight">
            <Icon name="bell" size={24} />
            {t('turn.nearTitle')}
          </p>
          <p className="mt-1">{t('turn.nearBody', { rooms: roomsText(p.dept, t), floor: floorRef })}</p>
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" size="sm" icon="close" onClick={() => setBanner(null)}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}

      {!called && (
        <TokenTicket token={p.token} top={t(`depts.${p.dept}.name`)} title={roomFloorText(p.dept, t)} size="sm">
          {p.status === 'waiting' &&
            (ahead === 0 ? (
              <p className="text-2xl font-bold">{t('turn.youAreNext')}</p>
            ) : (
              <>
                <p className="text-2xl font-bold leading-tight">{plural(t, 'turn.ahead', ahead)}</p>
                <p className="text-lg">{waitText(wait, t)}</p>
              </>
            ))}
          {p.status === 'waiting' && <p className="mt-2 text-sm text-ink/70">{t('turn.estimateNote')}</p>}
          {p.status === 'booked' && (
            <>
              <p className="text-2xl font-bold leading-tight">{t('checkin.notYet')}</p>
              <p className="text-lg">{t('checkin.notYetSub')}</p>
            </>
          )}
          {p.status === 'done' && <p className="text-xl font-bold">{atTests ? t('turn.status.tests') : t('turn.status.done')}</p>}
          {p.status === 'done' && p.est && p.calledAt >= p.est.at && (
            <p className="mt-1 text-sm text-ink/70">
              {t('turn.estVsReal', { est: waitText(p.est.mins, t), real: Math.round((p.calledAt - p.est.at) / 60000) })}
            </p>
          )}
          {p.status === 'noshow' && <p className="text-xl font-bold">{t('turn.status.noshow')}</p>}
        </TokenTicket>
      )}

      {['booked', 'waiting'].includes(p.status) && <ShareTurn p={p} />}

      {atTests && (
        <Card className="space-y-3 border-l-4 border-l-brand">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="lab" size={22} />
            {t('reports.title')}
          </h2>
          <p>{t('reports.body', { n: RETURN_AFTER })}</p>
          {reports === 'ready' && (
            <Notice kind="ok" icon="check" title={t('reports.readyTitle')} live>
              {t('reports.readyBody')}
            </Notice>
          )}
        </Card>
      )}
      {atTests && (mine ? <CheckInCard state={state} p={p} /> : <Notice kind="info" icon="slip" title={t('reports.atCounter')} />)}
      {p.status === 'done' && !atTests && !hasRated(p) && mine && <FeedbackCard p={p} secret={secret} />}

      {p.status === 'done' && (
        <section>
          <p className="mb-2">{t('turn.afterVisit')}</p>
          <RowGroup>
            <ActionRow to="/find?to=g_pharmacy" icon="pill" title={t('places.g_pharmacy.name')} sub={t('places.g_pharmacy.landmark')} />
            <ActionRow to="/find?to=g_lab" icon="lab" title={t('places.g_lab.name')} sub={t('places.g_lab.landmark')} />
          </RowGroup>
        </section>
      )}
      {['booked', 'noshow'].includes(p.status) && <CheckInCard state={state} p={p} />}
      {p.status === 'noshow' && (
        <Notice kind="danger" title={t('turn.noshowHelp')}>
          <LinkButton to="/find?to=g_help" variant="secondary" icon="info" className="mt-2 w-full">
            {t('common.wayToHelp')}
          </LinkButton>
        </Notice>
      )}

      {bill.due > 0 && (
        <Card className="space-y-3 border-warn">
          <p className="flex items-center gap-2 text-xl font-bold">
            <Icon name="rupee" size={24} />
            {t('pay.state.due', { amount: rupees(bill.due) })}
          </p>
          {tests.some((i) => i.status === 'due') && <p>{t('pay.testsDue')}</p>}
          {bill.state === 'cardCheck' ? (
            <p>
              {t('pay.state.cardCheck')}. {t(`pay.confirmHow.${own?.waiver ? freeCheckKind(own.waiver.card) : 'any'}`)}
            </p>
          ) : (
            (own || secretFor(state, p)) && (
              <Button icon="rupee" className="w-full" onClick={() => setPaying(true)}>
                {t('pay.payNow', { amount: rupees(bill.due) })}
              </Button>
            )
          )}
          <p className="text-sm text-ink-2">{t('pay.orCounter')}</p>
        </Card>
      )}
      {tests.length > 0 && bill.due === 0 && (
        <section>
          <h2 className={sectionTitle}>{t('pay.goTests')}</h2>
          <RowGroup>
            {[...new Set(tests.map((i) => testById[i.code]?.placeId).filter(Boolean))].map((placeId) => (
              <ActionRow
                key={placeId}
                to={`/find?to=${placeId}`}
                icon={placeId === 'g_xray' ? 'xray' : 'lab'}
                title={t(`places.${placeId}.name`)}
                sub={tests
                  .filter((i) => testById[i.code]?.placeId === placeId)
                  .map((i) => itemName(i, t))
                  .join(', ')}
              />
            ))}
          </RowGroup>
        </section>
      )}
      <PayPanel open={paying} onClose={() => setPaying(false)} p={p} secret={secretFor(state, p)} due={bill.due} />
      <ClaimCard claim={own?.claim} />
      </div>

      <div className="space-y-5">
      {called && roomPlaceId && (
        <section className="space-y-3">
          <h2 className={sectionTitle}>{t('turn.wayToRoom', { room: p.room })}</h2>
          <RouteView from={settings.here} to={roomPlaceId} avoidStairs={settings.avoidStairs} plans={false} />
          <LinkButton to={`/find?to=${roomPlaceId}`} variant="soft" icon="map" className="w-full">
            {t('turn.seeMap')}
          </LinkButton>
        </section>
      )}

      {p.status === 'waiting' && (
        <section>
          <h2 className={sectionTitle}>{t('turn.whatNext')}</h2>
          <Card className="space-y-3">
            <p>{near ? t('turn.next.near', { rooms: roomsText(p.dept, t), floor: floorRef }) : t('turn.next.far')}</p>
            <LinkButton
              to={`/find?to=${near ? dept.rooms.map((r) => r.placeId).join(',') : 'f1_waitA'}`}
              variant="soft"
              icon="map"
              className="w-full"
            >
              {near ? t('slip.way', { rooms: roomsText(p.dept, t) }) : t('turn.wayToHall')}
            </LinkButton>
          </Card>
        </section>
      )}

      <section>
        <h2 className={sectionTitle}>{t('turn.nowSeeing')}</h2>
        <RowGroup>
          {dept.rooms.map((r) => {
            const s = servingIn(state, r.room)
            const st = roomState(state, r.room, now)
            return (
              <div key={r.room} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t('common.room', { n: r.room })}</p>
                  <p className="flex items-center gap-1.5 text-sm text-ink-2">
                    <Icon name={statusIcon[st.status]} size={16} />
                    {doctorStatusText(st, t)}
                  </p>
                </div>
                <span className={s ? 'token-num text-xl' : 'text-sm text-ink-2'}>{s ? s.token : t('turn.nobody')}</span>
              </div>
            )
          })}
        </RowGroup>
      </section>

      {p.status === 'waiting' && alerts === 'off' && (
        <Card className="space-y-3">
          <p className="flex items-start gap-2">
            <Icon name="bell" size={22} className="mt-0.5 shrink-0 text-brand" />
            {t('turn.alertsWhy')}
          </p>
          <Button variant="secondary" icon="bell" className="w-full" onClick={turnOnAlerts} disabled={asking}>
            {t('turn.allowAlerts')}
          </Button>
        </Card>
      )}
      {p.status === 'waiting' && alerts === 'push' && <Notice kind="ok" icon="bell" title={t('turn.alertsPush')} />}
      {p.status === 'waiting' && alerts === 'local' && (
        <Notice kind="info" icon="bell" title={t('turn.alertsLocal')}>
          {isServer() && pushSupported() && (
            <Button variant="secondary" size="sm" icon="bell" className="mt-2" onClick={turnOnAlerts} disabled={asking}>
              {t('turn.alertsUpgrade')}
            </Button>
          )}
        </Notice>
      )}
      {p.status === 'waiting' && alerts === 'denied' && <Notice kind="warn">{t('settings.alertsBlocked')}</Notice>}

      {p.status === 'waiting' && ahead > 3 && traffic != null && (
        <Notice kind="info" icon="car" title={t('turn.travelTitle')}>
          {t('turn.travel', {
            level: t(`traffic.${trafficLabel(traffic)}`),
            n: Math.round((20 * travelFactor(traffic)) / 5) * 5,
          })}
        </Notice>
      )}

      {msgs.length > 0 && (
        <details className="group rounded-2xl border border-line bg-card" open={banner !== null}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-semibold">
            <Icon name="sms" size={22} className="text-brand" />
            <span className="flex-1">
              {t('turn.messages')} ({msgs.length})
            </span>
            <Icon name="next" size={18} className="transition-transform group-open:rotate-90" />
          </summary>
          <div className="space-y-2 px-4 pb-4" aria-live="polite">
            <p className="text-sm text-ink-2">{t('turn.messagesNote')}</p>
            {msgs.map((m) => (
              <div key={m.id} className="rounded-xl rounded-tl-sm bg-brand-soft p-3">
                <p className="flex items-center gap-2 text-sm text-ink-2">
                  <span className="flex-1">{m.to ? t('turn.smsTo', { to: m.to }) : t('turn.smsApp')}</span>
                  <span>{fmtTime(m.at)}</span>
                </p>
                <p className="mt-1">{messageText(m, t)}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      <LinkButton to={`/slip/${p.token}`} variant="ghost" icon="slip" className="w-full">
        {t('turn.seeSlip')}
      </LinkButton>
      <TermNote term="queue" />
      </div>
      </div>
    </div>
  )
}
