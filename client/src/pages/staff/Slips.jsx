import { useEffect, useRef, useState } from 'react'
import { useHospital, useSimNow } from '../../lib/store.js'
import { setSlipMode, slipsToRoom } from '../../lib/actions.js'
import { slipsToPrint, slipState, findByToken, followMoves, normalizeToken, aheadOf } from '../../lib/queue.js'
import { patientName, roomFloorText } from '../../lib/text.js'
import { billSummary } from '../../lib/billing.js'
import { plural } from '../../i18n/index.js'
import { departments } from '../../data/departments.js'
import { useSlipPrinter } from '../../components/PaperSlip.jsx'
import BillChip from '../../components/BillChip.jsx'
import { Button, Card, Toggle } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import { useStaffI18n, useCan } from './StaffLayout.jsx'

const MODES = [
  ['counter', 'register'],
  ['room', 'door'],
  ['window', 'slip'],
]
// Patients this close (or already called) get their slip printed by itself
// on the computer at the doctor's room.
const AUTO_AHEAD = 3

const pill = (on) =>
  `flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 font-semibold whitespace-nowrap ${
    on ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-card hover:border-brand'
  }`

// This screen's own choices (which doctor, print by itself), kept on this computer.
function useLocal(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      return s === null ? initial : JSON.parse(s)
    } catch {
      return initial
    }
  })
  const set = (x) => {
    setV(x)
    try {
      localStorage.setItem(key, JSON.stringify(x))
    } catch {
      // ignore
    }
  }
  return [v, set]
}

// A token typed, or the turn link scanned from the patient's phone.
function tokenFrom(input) {
  const m = String(input || '').match(/\/turn\/([^/?#\s]+)/i)
  return normalizeToken(m ? decodeURIComponent(m[1]) : input)
}

function placeText({ p, place }, t) {
  if (p.status === 'called') return t('slips.calledWaiting', { room: p.room })
  return place === 0 ? t('slips.next') : plural(t, 'slips.ahead', place)
}

function SlipRow({ item, t, lang, showDept, action }) {
  const { p } = item
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-2 ${p.status === 'called' ? 'border-danger bg-danger-soft' : 'border-line'}`}>
      <span className="font-mono text-lg font-bold">{p.token}</span>
      <span>
        {patientName(p, lang)}
        {p.age != null && `, ${p.age}`}
      </span>
      {showDept && <span className="text-sm text-ink-2">{t(`depts.${p.dept}.name`)}</span>}
      <span className={`flex items-center gap-1 text-sm ${p.status === 'called' ? 'font-bold text-danger' : 'text-ink-2'}`}>
        {p.status === 'called' && <Icon name="alert" size={16} />}
        {placeText(item, t)}
      </span>
      <BillChip bill={billSummary(p)} t={t} />
      <span className="ml-auto">{action}</span>
    </li>
  )
}

// Paper slips for the doctor, for people who registered on a phone, so they
// never queue at the counter just for the paper. However the hospital gets
// the slip to the doctor (printed here, at the room, or at a slip window),
// this is the screen that prints it.
export default function Slips() {
  const { t, lang } = useStaffI18n()
  const state = useHospital()
  const now = useSimNow(5000)
  const allowed = useCan()
  const [print, sheet] = useSlipPrinter(now)
  const [dept, setDept] = useLocal('opd-saathi-slips-dept', '')
  const [auto, setAuto] = useLocal('opd-saathi-slips-auto', false)
  const [q, setQ] = useState('')
  const [sent, setSent] = useState(0)
  const tried = useRef(new Set())
  const mode = state.slipMode || 'counter'
  const canPrint = allowed('printSlips')

  const list = slipsToPrint(state, dept || null)
  const carry = Object.values(state.patients).filter((p) => slipState(p) === 'printed' && (!dept || p.dept === dept))
  const found = (() => {
    const tok = tokenFrom(q)
    const p = tok && findByToken(state, tok)
    const cur = p && followMoves(state, p)
    return cur && slipState(cur) ? cur : null
  })()

  const go = (patients) => {
    if (!canPrint || !patients.length) return
    print(patients)
    setSent(patients.length)
  }

  // At the doctor's room: print each slip once, by itself, as the patient comes close.
  useEffect(() => {
    if (!auto || mode !== 'room' || !canPrint) return
    const close = list.filter((x) => x.place <= AUTO_AHEAD && !tried.current.has(x.p.id)).map((x) => x.p)
    if (!close.length) return
    for (const p of close) tried.current.add(p.id)
    go(close)
  })

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {sheet}
      <h1 className="text-2xl font-bold">{t('slips.title')}</h1>
      <p className="text-lg text-ink-2">{t('slips.hint')}</p>
      <ScreenGuide id="slips" items={['print', 'carry', 'lost', 'room']} t={t} />

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t('slips.modeTitle')}</h2>
        <div role="radiogroup" aria-label={t('slips.modeTitle')} className="grid gap-2 sm:grid-cols-3">
          {MODES.map(([m, icon]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={!allowed('setSlipMode')}
              onClick={() => setSlipMode(m)}
              className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left disabled:cursor-default ${
                mode === m ? 'border-brand bg-brand-soft' : 'border-line bg-card enabled:hover:border-brand'
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Icon name={mode === m ? 'check' : icon} size={20} className="text-brand" />
                {t(`slips.mode.${m}.name`)}
              </span>
              <span className="text-sm leading-snug text-ink-2">{t(`slips.mode.${m}.sub`)}</span>
            </button>
          ))}
        </div>
        {!allowed('setSlipMode') && <p className="text-sm text-ink-2">{t('slips.modeAdmin')}</p>}
      </Card>

      <div role="group" aria-label={t('slips.all')} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={!dept} onClick={() => setDept('')} className={pill(!dept)}>
          <Icon name="users" size={20} />
          {t('slips.all')}
        </button>
        {departments.map((d) => (
          <button key={d.id} type="button" aria-pressed={dept === d.id} onClick={() => setDept(d.id)} className={pill(dept === d.id)}>
            <Icon name={d.icon} size={20} />
            {t(`depts.${d.id}.name`)}
          </button>
        ))}
      </div>

      <Card className="space-y-3">
        <label htmlFor="slip-find" className="block font-semibold">
          {t('slips.find')}
        </label>
        <input
          id="slip-find"
          className="min-h-12 w-full rounded-xl border border-line bg-card px-3 font-mono text-lg sm:max-w-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          autoFocus={mode === 'window'}
        />
        {q.trim() &&
          (found ? (
            <ul>
              <SlipRow
                item={{ p: found, place: aheadOf(state, found) }}
                t={t}
                lang={lang}
                showDept
                action={
                  <Button
                    icon="print"
                    disabled={!canPrint}
                    onClick={() => {
                      go([found])
                      setQ('')
                    }}
                  >
                    {slipState(found) === 'due' ? t('slips.print') : t('slips.reprint')}
                  </Button>
                }
              />
            </ul>
          ) : (
            tokenFrom(q) && <p className="text-ink-2">{t('slips.findNone')}</p>
          ))}
      </Card>

      {sent > 0 && (
        <p role="status" className="flex items-center gap-2 font-semibold text-ok">
          <Icon name="check" size={20} />
          {plural(t, 'slips.sent', sent)}
        </p>
      )}

      <section className="space-y-3" aria-labelledby="slips-due">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="slips-due" className="mr-auto text-xl font-semibold">
            {t('slips.toPrint', { n: list.length })}
          </h2>
          <Button icon="print" disabled={!canPrint || !list.length} onClick={() => go(list.map((x) => x.p))}>
            {t('slips.printAll', { n: list.length })}
          </Button>
        </div>
        {mode === 'room' && (
          <Toggle checked={auto} onChange={setAuto} icon="print" label={t('slips.auto')} hint={t('slips.autoHint')} />
        )}
        {!list.length ? (
          <p className="text-ink-2">{t('slips.none')}</p>
        ) : (
          <ul className="space-y-2">
            {list.map((item) => (
              <SlipRow
                key={item.p.id}
                item={item}
                t={t}
                lang={lang}
                showDept={!dept}
                action={
                  <Button variant="secondary" icon="print" disabled={!canPrint} onClick={() => go([item.p])}>
                    {t('slips.print')}
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </section>

      {(mode === 'counter' || carry.length > 0) && (
        <section className="space-y-3" aria-labelledby="slips-carry">
          <h2 id="slips-carry" className="text-xl font-semibold">
            {t('slips.carryTitle', { n: carry.length })}
          </h2>
          {!carry.length && <p className="text-ink-2">{t('slips.carryNone')}</p>}
          {departments
            .map((d) => [d, carry.filter((p) => p.dept === d.id).sort((a, b) => a.num - b.num)])
            .filter(([, ps]) => ps.length)
            .map(([d, ps]) => (
              <Card key={d.id} className="flex flex-wrap items-center gap-3">
                <Icon name={d.icon} size={28} />
                <div className="mr-auto min-w-0">
                  <p className="font-semibold">
                    {t(`depts.${d.id}.name`)} · {roomFloorText(d.id, t)}
                  </p>
                  <p className="font-mono text-lg font-bold">{ps.map((p) => p.token).join(', ')}</p>
                </div>
                <Button icon="check" disabled={!allowed('slipsToRoom')} onClick={() => slipsToRoom(ps.map((p) => p.id))}>
                  {t('slips.taken')}
                </Button>
              </Card>
            ))}
        </section>
      )}
    </div>
  )
}
