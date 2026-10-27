import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Icon from './Icon.jsx'
import FloorPlan from './FloorPlan.jsx'
import { Button, Notice, TermNote } from './ui.jsx'
import { nearestRoute } from '../lib/route.js'
import { buildDirections, renderStep } from '../lib/directions.js'
import { speak, speakAll, stopSpeaking, canSpeak } from '../lib/speech.js'
import { useI18n } from '../i18n/index.js'
import { placeById } from '../data/hospital.js'

// True on laptops (Tailwind's lg: breakpoint), where the steps and the map
// fit side by side. Phones and tablets switch between them with tabs.
const wideQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 64rem)') : null
const subscribeWide = (cb) => {
  wideQuery?.addEventListener('change', cb)
  return () => wideQuery?.removeEventListener('change', cb)
}
export const useWide = () => useSyncExternalStore(subscribeWide, () => !!wideQuery?.matches, () => false)

// Works out the route (nearest of several targets if given a list).
export function useRoute(from, to, avoidStairs) {
  const key = Array.isArray(to) ? to.join(',') : to
  return useMemo(() => {
    if (!from || !key) return null
    const targets = key.split(',')
    let route = nearestRoute(from, targets, { avoidStairs })
    let fellBack = false
    if (!route && avoidStairs) {
      route = nearestRoute(from, targets, {})
      fellBack = true
    }
    return route ? { route, steps: buildDirections(route), fellBack } : null
  }, [from, key, avoidStairs])
}

export function routeSummary(route, t) {
  const parts = [t('route.about', { m: Math.max(5, Math.round(route.metres / 5) * 5) })]
  if (route.usesLift) parts.push(t('route.usesLift'))
  if (route.usesStairs) parts.push(t('route.usesStairs'))
  if (route.usesRamp) parts.push(t('route.usesRamp'))
  if (!route.usesStairs) parts.push(t('route.noStairs'))
  return parts.join(', ')
}

export function StepList({ steps, active = -1, onPick, t: tProp }) {
  const { t: tHook } = useI18n()
  const t = tProp || tHook
  return (
    <ol className="overflow-hidden rounded-2xl border border-line bg-card divide-y divide-line">
      {steps.map((s, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => onPick?.(i)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left ${active === i ? 'bg-brand-soft' : 'hover:bg-page'}`}
            aria-current={active === i ? 'step' : undefined}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${active === i ? 'bg-brand text-brand-ink' : 'bg-page text-ink'}`}>
              {i + 1}
            </span>
            <Icon name={s.icon} size={22} className="mt-0.5 shrink-0 text-brand" />
            <span className={`min-w-0 flex-1 leading-snug ${s.final ? 'font-semibold' : ''}`}>{renderStep(s, t)}</span>
            {canSpeak && <Icon name="speaker" size={18} className="mt-1 shrink-0 text-ink-2" />}
          </button>
        </li>
      ))}
    </ol>
  )
}

export default function RouteView({ from, to, avoidStairs, plans = true }) {
  const { t, lang } = useI18n()
  const res = useRoute(from, to, avoidStairs)
  const [active, setActive] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [tab, setTab] = useState('steps')
  const wide = useWide()

  useEffect(() => () => stopSpeaking(), [])
  useEffect(() => {
    setActive(-1)
    setPlaying(false)
  }, [from, to, avoidStairs, lang])

  if (!res) return <Notice kind="warn" title={t('route.none')} />
  const { route, steps } = res

  const listenAll = () => {
    if (playing) {
      stopSpeaking()
      setPlaying(false)
      setActive(-1)
      return
    }
    setPlaying(true)
    speakAll(
      steps.map((s) => ({ text: renderStep(s, t), lang })),
      { onItem: setActive },
    ).then(() => {
      setPlaying(false)
      setActive(-1)
    })
  }
  const pickStep = (i) => {
    setActive(i)
    setPlaying(false)
    speak(renderStep(steps[i], t), lang)
  }

  const stepsPanel = (
    <div className="space-y-3">
      {canSpeak && (
        <Button variant={playing ? 'secondary' : 'soft'} icon={playing ? 'stop' : 'speaker'} onClick={listenAll} className="w-full">
          {playing ? t('route.stopListening') : t('route.listenAll')}
        </Button>
      )}
      <StepList steps={steps} active={active} onPick={pickStep} t={t} />
    </div>
  )
  const mapPanel = (
    <div className="space-y-5">
      <div className={wide && route.floors.length > 1 ? 'grid grid-cols-2 items-start gap-4' : 'space-y-5'}>
        {route.floors.map((f) => (
          <FloorPlan key={f} floor={f} route={route} from={route.from} to={route.to} t={t} />
        ))}
      </div>
      <p className="text-sm text-ink-2">{t('route.mapKey')}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
        <Icon name="walk" size={22} className="text-brand" />
        <span>{routeSummary(route, t)}</span>
      </p>
      {res.fellBack && <Notice kind="warn" title={t('route.noStepFree')} />}
      {route.usesStairs && !avoidStairs && <Notice kind="info" icon="stairs">{t('route.stairsHint')}</Notice>}
      {route.usesLift && <TermLine term="lift" />}
      {route.usesRamp && <TermLine term="ramp" />}
      {plans && wide ? (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-6 pt-1">
          <section aria-labelledby="route-steps" className="space-y-2">
            <h2 id="route-steps" className="text-lg font-semibold">{t('route.steps')}</h2>
            {stepsPanel}
          </section>
          <section aria-labelledby="route-map" className="space-y-2">
            <h2 id="route-map" className="text-lg font-semibold">{t('route.mapTitle')}</h2>
            {mapPanel}
          </section>
        </div>
      ) : plans ? (
        <>
          <div role="tablist" aria-label={t('route.viewLabel')} className="flex rounded-xl bg-card p-1 ring-1 ring-line">
            {[
              ['steps', 'walk', t('route.steps')],
              ['map', 'map', t('route.mapTitle')],
            ].map(([k, icon, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                id={`tab-${k}`}
                aria-selected={tab === k}
                aria-controls={`panel-${k}`}
                onClick={() => setTab(k)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg font-semibold ${tab === k ? 'bg-brand text-brand-ink' : 'text-ink-2 hover:text-ink'}`}
              >
                <Icon name={icon} size={18} />
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'steps' ? stepsPanel : mapPanel}
          </div>
        </>
      ) : (
        stepsPanel
      )}
    </div>
  )
}

function TermLine({ term }) {
  return <TermNote term={term} />
}

// "You are at …" picker, grouped by floor.
export function PlacePicker({ value, onChange, label, places, id = 'here' }) {
  const { t } = useI18n()
  const byFloor = [0, 1, 2].map((f) => ({ f, list: places.filter((p) => placeById[p].floor === f) }))
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink-2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-card px-3 min-h-12 text-base font-semibold"
      >
        {byFloor.map(({ f, list }) => (
          <optgroup key={f} label={t(`floors.${f}.name`)}>
            {list.map((p) => (
              <option key={p} value={p}>
                {t(`places.${p}.name`)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
