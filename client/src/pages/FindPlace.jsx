import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useI18n, translate } from '../i18n/index.js'
import { useSettings } from '../lib/settings.js'
import { useHospital } from '../lib/store.js'
import { followMoves } from '../lib/queue.js'
import { places, placeById, categories, startPlaces, HELP_POINTS } from '../data/hospital.js'
import { roomToDept } from '../data/departments.js'
import { renderStep } from '../lib/directions.js'
import { usePageSpeech } from '../components/pageSpeech.js'
import { Button, PageTitle, Toggle, Modal, TermNote, LinkButton, RowGroup, ActionRow } from '../components/ui.jsx'
import RouteView, { PlacePicker, useRoute, StepList } from '../components/Route.jsx'
import Icon from '../components/Icon.jsx'

const ROOM_OF = { f1_opd1: 1, f1_opd2: 2, f1_opd3: 3, f1_opd4: 4, f1_opd5: 5, f1_opd6: 6, f1_opd7: 7, f1_opd8: 8 }

// Name of a place plus what is inside (e.g. "Room 3 · Children").
function placeLabel(id, t) {
  const room = ROOM_OF[id]
  return room ? `${t(`places.${id}.name`)} (${t(`depts.${roomToDept[room]}.name`)})` : t(`places.${id}.name`)
}

function Picker({ onPick }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return places
      .filter((p) => !['g_stairs', 'f1_stairs', 'f2_stairs'].includes(p.id))
      .filter((p) =>
        ['en', 'hi'].some((l) => {
          const room = ROOM_OF[p.id]
          const text = [
            translate(l, `places.${p.id}.name`),
            translate(l, `places.${p.id}.landmark`),
            room ? translate(l, `depts.${roomToDept[room]}.name`) : '',
            room ? translate(l, `depts.${roomToDept[room]}.words`) : '',
          ]
            .join(' ')
            .toLowerCase()
          return text.includes(s)
        }),
      )
  }, [q])

  usePageSpeech([t('find.title'), t('find.searchLabel'), ...categories.map((c) => t(`find.cat.${c.id}`))].join('. '))

  return (
    <div className="space-y-4">
      <PageTitle>{t('find.title')}</PageTitle>
      <div className="relative md:max-w-xl">
        <label htmlFor="search" className="sr-only">
          {t('find.searchLabel')}
        </label>
        <Icon name="search" size={22} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2" />
        <input
          id="search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('find.searchPlaceholder')}
          className="w-full rounded-xl border border-line bg-card py-3 pl-11 pr-4 min-h-12 text-base focus:border-brand"
        />
      </div>
      {q.trim() && (
        <div aria-live="polite" className="md:max-w-xl">
          {results.length === 0 ? (
            <p className="text-ink-2">{t('find.noResults')}</p>
          ) : (
            <RowGroup>
              {results.map((p) => (
                <ActionRow
                  key={p.id}
                  onClick={() => onPick(p.id)}
                  icon={p.kind}
                  title={placeLabel(p.id, t)}
                  sub={`${t(`floors.${p.floor}.name`)}, ${t(`places.${p.id}.landmark`)}`}
                />
              ))}
            </RowGroup>
          )}
        </div>
      )}

      <h2 className="text-lg font-semibold">{t('find.pick')}</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => (c.list ? setOpen(c) : onPick(c.places.join(',')))}
            className={`flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-sm font-semibold leading-tight ${
              c.id === 'emergency' ? 'border-danger bg-danger text-danger-ink' : 'border-line bg-card text-ink hover:border-brand'
            }`}
          >
            <Icon name={c.icon} size={28} className={c.id === 'emergency' ? '' : 'text-brand'} />
            <span className="break-words">{t(`find.cat.${c.id}`)}</span>
          </button>
        ))}
      </div>
      <TermNote term="ward" />

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? t(`find.cat.${open.id}`) : ''}>
        {open && (
          <RowGroup>
            {open.places.map((id) => (
              <ActionRow
                key={id}
                onClick={() => {
                  setOpen(null)
                  onPick(id)
                }}
                icon={placeById[id].kind}
                title={placeLabel(id, t)}
                sub={t(`places.${id}.landmark`)}
              />
            ))}
          </RowGroup>
        )}
      </Modal>
    </div>
  )
}

function LostPanel({ open, onClose, from, to, avoidStairs }) {
  const { t, lang } = useI18n()
  const [settings, setSettings] = useSettings()
  const state = useHospital()
  const help = useRoute(from, HELP_POINTS, avoidStairs)
  const me = settings.me && state.patients[settings.me] ? followMoves(state, state.patients[settings.me]) : null
  const en = (k, v) => translate('en', k, v)
  const target = to.split(',')[0]
  return (
    <Modal open={open} onClose={onClose} title={t('lost.title')} wide>
      <div className="space-y-4">
        <p className="text-lg">{t('lost.calm')}</p>
        <PlacePicker
          id="lost-here"
          label={t('lost.whereNow')}
          value={settings.here}
          onChange={(v) => setSettings({ here: v })}
          places={startPlaces}
        />
        {help && (
          <section className="space-y-2">
            <h3 className="text-lg font-semibold">
              {t('lost.nearest', { place: t(`places.${help.route.to}.name`) })}
            </h3>
            <StepList steps={help.steps} />
            <LinkButton to={`/find?to=${help.route.to}`} variant="soft" icon="map" className="w-full" onClick={onClose}>
              {t('lost.showMap')}
            </LinkButton>
          </section>
        )}
        <section className="ticket px-5 py-5 text-center" aria-label={t('lost.cardLabel')}>
          <p className="text-lg">{t('lost.cardAsk')}</p>
          <p className="mt-2 text-3xl font-extrabold leading-tight">{t(`places.${target}.name`)}</p>
          <p className="text-lg">{t(`floors.${placeById[target].floor}.name`)}</p>
          {me && ['waiting', 'called'].includes(me.status) && <p className="token-num mt-2 text-3xl">{me.token}</p>}
          {lang !== 'en' && (
            <div lang="en" className="ticket-cut mt-4 pt-4">
              <p className="text-lg">{en('lost.cardAsk')}</p>
              <p className="text-2xl font-bold">{en(`places.${target}.name`)}</p>
              <p className="text-lg">{en(`floors.${placeById[target].floor}.name`)}</p>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

export default function FindPlace() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const [settings, setSettings] = useSettings()
  const [lost, setLost] = useState(false)
  const to = params.get('to') || ''
  const valid = to && to.split(',').every((id) => placeById[id])
  const from = settings.here && placeById[settings.here] ? settings.here : 'g_entrance'
  const res = useRoute(valid ? from : null, valid ? to : null, settings.avoidStairs)

  const speech = res ? [t('find.wayTo', { place: t(`places.${res.route.to}.name`) }), ...res.steps.map((s) => renderStep(s, t))].join('. ') : ''
  usePageSpeech(valid ? speech : undefined)

  if (!valid) return <Picker onPick={(id) => setParams({ to: id })} />

  const dest = res ? res.route.to : to.split(',')[0]
  return (
    <div className="space-y-4">
      <PageTitle sub={t(`places.${dest}.landmark`)}>{t('find.wayTo', { place: placeLabel(dest, t) })}</PageTitle>
      <div className="space-y-3 rounded-2xl border border-line bg-card p-3 md:grid md:grid-cols-2 md:items-end md:gap-4 md:space-y-0">
        <PlacePicker id="from" label={t('find.youAreAt')} value={from} onChange={(v) => setSettings({ here: v })} places={startPlaces} />
        <Toggle bare icon="wheelchair" label={t('settings.avoidStairs')} checked={settings.avoidStairs} onChange={(v) => setSettings({ avoidStairs: v })} />
      </div>
      <RouteView from={from} to={to} avoidStairs={settings.avoidStairs} />
      <div className="grid grid-cols-2 gap-2 md:max-w-xl">
        <Button variant="dangerOutline" icon="question" onClick={() => setLost(true)}>
          {t('lost.button')}
        </Button>
        <Button variant="secondary" icon="search" onClick={() => setParams({})}>
          {t('find.another')}
        </Button>
      </div>
      <LostPanel open={lost} onClose={() => setLost(false)} from={from} to={dest} avoidStairs={settings.avoidStairs} />
    </div>
  )
}
