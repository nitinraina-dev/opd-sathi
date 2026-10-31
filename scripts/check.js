// Logic checks that need no browser: run with `npm run check`.
//  1. English and Hindi have exactly the same text keys.
//  2. Every text key used in the code exists.
//  3. A route exists between every pair of places, "Avoid stairs" never uses
//     stairs, and every direction step reads properly in both languages.
//  4. The queue engine: tokens, people ahead, near alerts, calls, moves.
//  5. The forecast model gives sane numbers, and learns from history.
//  6. Staff roles and what the public (not logged in) can see.
//  7. Payments: free care, cards, UPI/cash, tests, refunds; payment never blocks care.
//  8. PM-JAY claims: every step in order, wrong steps refused, the patient's
//     own record shows the stage, the public queue never does.
//  9. Joining on arrival: phone bookings are not in the line until check-in;
//     free care typed on a phone counts only once staff confirm it.
// 10. Local alerts: news headlines, alert effects on the forecast, learning
//     an alert's real effect, the OPD's own early warning, busy days.
// 11. Emergency visits: recorded after care, billed afterwards (or free),
//     never in an OPD line.
// 12. Ask and SMS: answers from the hospital's facts, urgent words go to
//     Emergency; nearby hospitals only when busy; today's impact counts.
// 13. After the doctor: back with test reports near the front, the wait we
//     promised against the real one, and "how was your visit?".
// 14. Paper slips for people who registered on a phone (printed at the
//     counter, at the room or at a slip window), and an Emergency slip fee
//     taken before the doctor.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import en from '../client/src/i18n/en.js'
import hi from '../client/src/i18n/hi.js'
import { translate } from '../client/src/i18n/translate.js'
import { places, edges } from '../client/src/data/hospital.js'
import { shortestPath } from '../client/src/lib/route.js'
import { buildDirections, renderStep } from '../client/src/lib/directions.js'
import { initialState } from '../client/src/lib/state.js'
import { runAction, diffState, applyPatch } from '../client/src/lib/engine.js'
import { aheadOf, estimateWait, waitingList, findByToken } from '../client/src/lib/queue.js'
import { simNow } from '../client/src/lib/clock.js'
import { simulateDay, weekAhead, predictNow } from '../client/src/lib/predict.js'
import { sampleConditions, applyScenario } from '../client/src/lib/model.js'
import { dateKey, addDays } from '../client/src/lib/clock.js'
import { learnFromHistory } from '../client/src/lib/predict.js'
import { can, redactState, redactPatch, staffState } from '../client/src/lib/permissions.js'
import { billSummary, receiptsOf, upiLink } from '../client/src/lib/billing.js'
import { newClaim, claimStep, patientView, claimTotals, whoseTurn, sampleClaims, ClaimError, STAGES } from '../client/src/lib/claims.js'
import { DOCS, PACKAGES } from '../client/src/data/pmjay.js'
import { classifyHeadline, parseRss, effectFor, kindOf } from '../client/src/lib/signals.js'
import { opdTrend, trendSignals, busyDays, dayFactors, staffSuggestions } from '../client/src/lib/predict.js'
import { keyToDate } from '../client/src/lib/clock.js'
import { departments } from '../client/src/data/departments.js'
import { simpleAnswer, parseSms, smsText } from '../client/src/lib/ask.js'
import { loadShare, nearbyWait, BUSY_HERE } from '../client/src/lib/nearby.js'
import { NEARBY } from '../client/src/data/nearby.js'
import { impactToday, estimateAccuracy, feedbackSummary } from '../client/src/lib/impact.js'
import { RETURN_AFTER } from '../client/src/lib/engine.js'
import { joinKind, reportsState, slipsToPrint, slipState } from '../client/src/lib/queue.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const fail = (msg) => {
  failures++
  if (failures <= 40) console.log('  FAIL', msg)
}
const section = (name) => console.log(`\n${name}`)

// 1. Key parity ---------------------------------------------------------------
section('1. English and Hindi keys match')
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]))
const enKeys = new Set(flat(en))
const hiKeys = new Set(flat(hi))
for (const k of enKeys) if (!hiKeys.has(k)) fail(`missing in hi: ${k}`)
for (const k of hiKeys) if (!enKeys.has(k)) fail(`missing in en: ${k}`)
for (const k of enKeys) {
  const a = (translate('en', k).match(/\{\w+\}/g) || []).sort().join()
  const b = (translate('hi', k).match(/\{\w+\}/g) || []).sort().join()
  if (a !== b) fail(`placeholders differ for ${k}: en ${a} / hi ${b}`)
}
console.log(`  ${enKeys.size} keys`)

// 2. Keys used in code ----------------------------------------------------------
section('2. Text keys used in the code exist')
const files = []
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p)
    else if (/\.(jsx?|js)$/.test(f.name) && !p.includes(`${path.sep}i18n${path.sep}`)) files.push(p)
  }
}
walk(path.join(root, 'client/src'))
walk(path.join(root, 'server/src'))
const prefixes = [...enKeys]
let used = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\b(?:t|en|translate\(\s*\w+\s*,)\s*\(?\s*['"]([a-zA-Z][\w.]+)['"]/g)) {
    const key = m[1]
    if (!key.includes('.')) continue
    used++
    if (!enKeys.has(key)) fail(`${path.relative(root, f)}: unknown key ${key}`)
  }
  for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z][\w.]*)\$\{/g)) {
    if (!prefixes.some((k) => k.startsWith(m[1]))) fail(`${path.relative(root, f)}: no keys start with ${m[1]}`)
  }
}
console.log(`  ${used} static key uses in ${files.length} files`)

// 3. Routes and directions -------------------------------------------------------
section('3. Routes and directions between every pair of places')
const ids = places.map((p) => p.id)
let pairs = 0
let maxSteps = 0
for (const from of ids) {
  for (const to of ids) {
    if (from === to) continue
    for (const avoidStairs of [false, true]) {
      const r = shortestPath(from, to, { avoidStairs })
      if (!r) {
        fail(`no route ${from} -> ${to} (avoidStairs ${avoidStairs})`)
        continue
      }
      pairs++
      if (avoidStairs && r.edges.some((e) => e.stairs)) fail(`stairs used with avoidStairs: ${from} -> ${to}`)
      for (let i = 1; i < r.nodes.length - 1; i++) {
        const p = places.find((x) => x.id === r.nodes[i])
        if (p && !['lift', 'stairs', 'ramp', 'entrance'].includes(p.kind)) fail(`route walks through ${p.id}: ${from} -> ${to}`)
      }
      const steps = buildDirections(r)
      maxSteps = Math.max(maxSteps, steps.length)
      for (const lang of ['en', 'hi']) {
        const t = (k, v) => translate(lang, k, v)
        for (const s of steps) {
          const text = renderStep(s, t)
          if (/\{|undefined|NaN|\bdir\.|places\.|floors\.|ordinal\./.test(text)) fail(`${lang} ${from} -> ${to}: "${text}"`)
        }
      }
    }
  }
}
console.log(`  ${pairs} routes checked, longest has ${maxSteps} steps, ${edges.filter((e) => e.stairs).length} stair edges`)

const show = (from, to, avoidStairs, lang = 'en') => {
  const r = shortestPath(from, to, { avoidStairs })
  const t = (k, v) => translate(lang, k, v)
  console.log(`  ${from} -> ${to}${avoidStairs ? ' (avoid stairs)' : ''}: ${r.metres} m`)
  for (const s of buildDirections(r)) console.log(`     - ${renderStep(s, t)}`)
}
show('g_entrance', 'f1_opd3', true)
show('g_entrance', 'f1_opd3', false)
show('g_entrance', 'f1_opd3', true, 'hi')
show('f1_waitA', 'g_emergency', true)
show('g_reg', 'g_help', false)

// 4. Queue engine -------------------------------------------------------------------
section('4. Queue engine')
const s = initialState()
const ev = []
const act = (name, args) => {
  const before = structuredClone(s)
  const out = runAction(s, name, args)
  s.rev = before.rev + 1
  ev.push(...out.events)
  const patch = out.full ? { rev: s.rev, full: structuredClone(s) } : diffState(before, s)
  const rebuilt = applyPatch(before, patch)
  if (JSON.stringify(rebuilt) !== JSON.stringify(s)) fail(`patch does not rebuild state after ${name}`)
  return out.result
}
const people = []
for (let i = 0; i < 8; i++) people.push(act('registerPatient', { name: `P${i}`, age: 30 + i, gender: 'f', dept: 'CHD', lang: 'en', via: 'counter' }))
if (people[0].token !== 'CHD-001' || people[7].token !== 'CHD-008') fail(`tokens: ${people[0].token} ${people[7].token}`)
if (aheadOf(s, s.patients[people[6].id]) !== 6) fail('ahead count')
const nearBefore = s.messages.filter((m) => m.kind === 'near').length
if (nearBefore !== 4) fail(`near alerts for first 4 people, got ${nearBefore}`)
act('callNext', { room: 3 })
if (s.patients[people[0].id].status !== 'called') fail('first patient not called')
if (!s.messages.some((m) => m.kind === 'near' && m.pid === people[4].id)) fail('5th person should be alerted when 3 are ahead')
if (s.calls[0].token !== 'CHD-001') fail('call not announced')
const w = estimateWait(s, 'CHD', aheadOf(s, s.patients[people[7].id]), Date.now())
if (w % 5 !== 0 || w <= 0) fail(`wait estimate ${w}`)
act('sendToEnd', { pid: people[1].id })
if (waitingList(s, 'CHD').at(-1).id !== people[1].id) fail('send to end')
act('movePatient', { pid: people[2].id, dept: 'EYE' })
const moved = s.patients[s.patients[people[2].id].movedTo]
if (!moved || !moved.token.startsWith('EYE-')) fail('move to another department')
act('setRoomStatus', { room: 3, patch: { status: 'late', lateBy: 20 } })
const w2 = estimateWait(s, 'CHD', 2, Date.now())
if (w2 < 20) fail(`late doctor should add delay, got ${w2}`)
const flag = act('raiseFlag', { where: 'f1_waitA', lang: 'hi' })
act('markFlagSeen', { id: flag })
if (!s.flags[0].seen) fail('flag seen')
act('addSamplePatients', { n: 20 })
if (Object.keys(s.patients).length < 29) fail('sample patients')
act('setAutoRun', { on: true })
act('tick', {})
act('resetAll', {})
if (Object.keys(s.patients).length || s.flags.length) fail('reset')
const types = new Set(ev.map((e) => e.type))
for (const k of ['registered', 'turn_near', 'token_called', 'sent_to_end', 'moved', 'urgent_flag', 'flag_seen']) {
  if (!types.has(k)) fail(`no ${k} event`)
}
console.log(`  ${ev.length} events: ${[...types].join(', ')}`)

// 5. Forecast -------------------------------------------------------------------------
section('5. Forecast model')
const cond = sampleConditions(Date.now())
const today = dateKey(Date.now())
const week = weekAhead(cond, today, 7)
for (const d of week) {
  if (!d.closed && !(d.total > 50 && d.total < 600)) fail(`odd total ${d.total} on ${d.key}`)
  if (!d.closed && !d.best) fail(`no best hour on ${d.key}`)
}
console.log('  ' + week.map((d) => `${d.key.slice(5)}: ${d.closed ? 'closed' : `${d.total} (${d.peakCrowd}, best ${d.best?.hour}:00)`}`).join(' | '))
const rainy = applyScenario(cond, { rain: true, jam: true }, today)
const a = simulateDay(today, cond)
const b = simulateDay(today, rainy)
if (!a.closed) {
  console.log(`  today ${Math.round(a.total)} patients; with heavy rain + jam ${Math.round(b.total)}; doctors late ${b.lateMins} min`)
  if (!(b.total < a.total)) fail('heavy rain should lower the total')
  for (const h of a.hours) if (!Number.isFinite(h.wait) || h.wait < 0) fail(`wait at ${h.hour}`)
}
const live = initialState()
const p = predictNow(live, cond, Date.now())
if (p.hallWaiting !== 0) fail('predictNow waiting')

// Learning: a hospital where Mondays are twice as busy and 10:00 is the peak.
const history = []
for (let i = 1; i <= 42; i++) {
  const date = addDays(today, -i)
  const dow = new Date(`${date}T12:00:00`).getDay()
  if (dow === 0) continue
  const total = dow === 1 ? 480 : 240
  history.push({ date, total, byHour: { 8: total * 0.1, 9: total * 0.2, 10: total * 0.35, 11: total * 0.15, 12: total * 0.12, 13: total * 0.08 }, byDept: { MED: total } })
}
const learned = learnFromHistory(history)
if (!learned || learned.days !== 36) fail(`learned days ${learned?.days}`)
if (!(learned.weekday[1] > 1.6)) fail(`learned Monday ${learned.weekday[1]}`)
if (!(learned.hourShare[10] > learned.hourShare[9])) fail('learned peak hour should move to 10:00')
const shareSum = Object.values(learned.hourShare).reduce((a, b) => a + b, 0)
if (Math.abs(shareSum - 1) > 1e-9) fail(`hour shares add up to ${shareSum}`)
if (learnFromHistory([]) !== null) fail('no history should mean no learning')

// Weather: in this hospital heavy rain halves attendance. Rainy days fall on
// different weekdays, and the Monday pattern must not be blamed on rain.
const wet = []
for (let i = 1; i <= 56; i++) {
  const date = addDays(today, -i)
  const dow = new Date(`${date}T12:00:00`).getDay()
  if (dow === 0) continue
  const heavy = i % 5 === 0
  const total = (dow === 1 ? 360 : 240) * (heavy ? 0.5 : 1)
  wet.push({ date, total, byHour: { 9: total }, byDept: { MED: total }, wx: heavy ? { rain: 30, tMax: 28 } : { rain: 0, tMax: 31 } })
}
const lw = learnFromHistory(wet)
if (!(lw.weather.heavyRain < 0.65)) fail(`learned heavy rain effect ${lw.weather.heavyRain}`)
if (!(lw.weatherDays.heavyRain >= 8)) fail('rainy days not counted')
if (!(lw.weekday[1] > 1.35 && lw.weekday[3] < 1.1)) fail(`weekday confused by rain: Mon ${lw.weekday[1]} Wed ${lw.weekday[3]}`)
console.log(`  weather learning: heavy rain x${lw.weather.heavyRain.toFixed(2)} (typical x0.75) from ${lw.weatherDays.heavyRain} days; Monday x${lw.weekday[1].toFixed(2)}`)
const nextMonday = [...Array(7)].map((_, i) => addDays(today, i)).find((k) => new Date(`${k}T12:00:00`).getDay() === 1)
const plain = simulateDay(nextMonday, cond)
const taught = simulateDay(nextMonday, cond, { learned })
console.log(`  learned from ${learned.days} days: Monday x${learned.weekday[1].toFixed(2)}; next Monday ${Math.round(plain.total)} -> ${Math.round(taught.total)} patients`)
if (!(taught.total > plain.total)) fail('learning should raise the busy Monday forecast')

// 6. Roles and privacy ---------------------------------------------------------------
section('6. Staff roles and public privacy')
const roles = { admin: { role: 'admin' }, doctor: { role: 'doctor' }, nurse: { role: 'nurse' }, reception: { role: 'reception' } }
const expect = [
  ['registerPatient', null, true],
  ['raiseFlag', null, true],
  ['callNext', null, false],
  ['callNext', 'doctor', true],
  ['callNext', 'reception', false],
  ['movePatient', 'reception', true],
  ['resetAll', 'nurse', false],
  ['resetAll', 'admin', true],
  ['accounts', 'doctor', false],
  ['automation', 'admin', true],
]
for (const [what, role, ok] of expect) if (can(role ? roles[role] : null, what) !== ok) fail(`${role || 'public'} ${what} should be ${ok}`)
const st = initialState()
runAction(st, 'registerPatient', { name: 'Secret', age: 40, gender: 'f', dept: 'MED', mobile: '9876543210', lang: 'en' })
runAction(st, 'raiseFlag', { name: 'Secret', where: 'g_reg' })
const pub = redactState(st)
const leak = JSON.stringify(pub)
if (leak.includes('Secret') || leak.includes('9876543210')) fail('public state leaks a name or phone number')
if (!Object.values(pub.patients)[0].token) fail('public state must keep tokens')
const before = structuredClone(st)
runAction(st, 'registerPatient', { name: 'Hidden', age: 30, gender: 'm', dept: 'EYE', lang: 'hi' })
st.rev = before.rev + 1
if (JSON.stringify(redactPatch(diffState(before, st))).includes('Hidden')) fail('public patch leaks a name')
console.log(`  ${expect.length} permission rules, no names or phone numbers in public data`)

// 7. Payments -------------------------------------------------------------------------
section('7. Payments and free care')
const ps = initialState()
// At the counter: staff see the person, so free care by age counts at once.
const reg = (a) => runAction(ps, 'registerPatient', { gender: 'f', lang: 'en', via: 'counter', ...a }).result
const payer = reg({ name: 'Pay', age: 40, dept: 'MED', payChoice: 'upi', secret: 'k1' })
const senior = reg({ name: 'Old', age: 70, dept: 'MED' })
const baby = reg({ name: 'Baby', age: 2, dept: 'CHD' })
const mother = reg({ name: 'Mom', age: 26, dept: 'WMN' })
const carded = reg({ name: 'Card', age: 35, dept: 'EYE', payChoice: 'card', card: 'bpl' })
const sum = (x) => billSummary(ps.patients[x.id])
if (sum(payer).state !== 'due' || sum(payer).due !== 10) fail('a paying patient owes the OPD fee')
if (sum(senior).freeReason !== 'senior' || sum(baby).freeReason !== 'child' || sum(mother).freeReason !== 'pregnancy') fail('automatic free care')
if (sum(carded).state !== 'cardCheck') fail('card holders wait for a staff check')
if (ps.patients[payer.id].status !== 'waiting' || ps.patients[carded.id].status !== 'waiting') fail('unpaid patients must still be in the queue')
runAction(ps, 'callNext', { room: 1 })
if (ps.patients[payer.id].status !== 'called') fail('an unpaid patient must still be called (payment never blocks care)')
const r1 = runAction(ps, 'payBill', { pid: payer.id, method: 'upi', mode: 'demo', ref: 'X' }).result
if (r1.amount !== 10 || r1.receipt !== 'R-0001' || sum(payer).state !== 'paid') fail('UPI payment')
if (runAction(ps, 'payBill', { pid: payer.id, method: 'cash' }).result !== null) fail('paying twice must do nothing')
const before2 = billSummary(ps.patients[payer.id]).items.length
runAction(ps, 'addCharges', { pid: payer.id, tests: ['cbc', 'xray'] })
if (sum(payer).due !== 150 || sum(payer).items.length !== before2 + 2) fail('tests added to the bill')
const firstItem = sum(payer).items.find((i) => i.code === 'cbc').id
runAction(ps, 'payBill', { pid: payer.id, method: 'cash', items: [firstItem] })
if (sum(payer).due !== 100) fail('paying only the items that were billed')
if (runAction(ps, 'addCharges', { pid: senior.id, tests: ['cbc'] }).result !== 0 || sum(senior).due !== 0) fail('tests stay free for free patients')
runAction(ps, 'decideWaiver', { pid: carded.id, approve: true })
if (sum(carded).state !== 'free' || sum(carded).freeReason !== 'bpl') fail('accepted card makes the visit free')
const refundId = sum(payer).items.find((i) => i.status === 'paid' && i.code === 'opd').id
runAction(ps, 'refundItem', { pid: payer.id, itemId: refundId })
if (sum(payer).refunded !== 10) fail('refund')
const moveFrom = reg({ name: 'Move', age: 30, dept: 'ENT', payChoice: 'counter' })
runAction(ps, 'movePatient', { pid: moveFrom.id, dept: 'SKN' })
const movedP = ps.patients[ps.patients[moveFrom.id].movedTo]
if (sum(movedP).due !== 10 || billSummary(ps.patients[moveFrom.id]).due !== 0) fail('the bill moves with the patient (not charged twice)')
const pubPay = JSON.stringify(redactState(ps))
if (pubPay.includes('"bill"') || pubPay.includes('"k1"') || pubPay.includes('xray')) fail('public data must not show bill items, tests or keys')
if (!pubPay.includes('"billDue":100')) fail('public data should show the amount due')
if (JSON.stringify(staffState(ps)).includes('"k1"')) fail('staff data must not include patients\' keys')
if (upiLink(10, 'MED-001').indexOf('am=10.00') < 0) fail('UPI link amount')
console.log(`  free care, card checks, UPI and cash, tests, partial pay, refunds, moves; receipts ${receiptsOf(ps.patients[payer.id]).map((r) => r.receipt).join(', ')}`)

// 8. PM-JAY claims ---------------------------------------------------------------
section('8. PM-JAY claims')
const by = { by: 'desk', now: 1000 }
const refused = (fn, code, what) => {
  try {
    fn()
    fail(`${what}: should be refused`)
  } catch (e) {
    if (!(e instanceof ClaimError) || e.code !== code) fail(`${what}: expected ${code}, got ${e.code || e.message}`)
  }
}
let cl = newClaim({ name: 'Ravi', age: 40, gender: 'm', dept: 'EYE', pkg: 'cataract' }, { id: 'CL-0001', ...by })
if (cl.stage !== 'preauthSent' || cl.rate !== 10000 || cl.ward !== 'f2_ward5') fail('a new claim asks for pre-auth at the package rate')
refused(() => claimStep(cl, 'discharge', {}, by), 'notNow', 'discharge before pre-auth')
refused(() => claimStep(cl, 'preauthApprove', { amount: 20000 }, by), 'amount', 'approve more than the package')
refused(() => claimStep(cl, 'preauthQuery', {}, by), 'note', 'a question without the question')
cl = claimStep(cl, 'preauthQuery', { note: 'Send the eye test' }, by)
if (whoseTurn(cl) !== 'us') fail('a question is for the hospital to answer')
cl = claimStep(cl, 'reply', { note: 'Sent' }, by)
if (cl.stage !== 'preauthSent') fail('an answer goes back to PM-JAY')
cl = claimStep(cl, 'preauthApprove', {}, by)
if (cl.approved !== 10000 || whoseTurn(cl) !== 'ward') fail('approved pre-auth: patient in the ward')
cl = claimStep(cl, 'discharge', {}, by)
refused(() => claimStep(cl, 'submit', {}, by), 'docs', 'send a claim without the papers')
cl = claimStep(cl, 'update', { docs: Object.fromEntries(DOCS.map((d) => [d, true])), tms: 'DEMO-1' }, by)
cl = claimStep(cl, 'submit', {}, by)
if (cl.claimed !== 10000 || cl.tms !== 'DEMO-1') fail('the claim is for the approved amount')
refused(() => claimStep(cl, 'claimApprove', { amount: 9000 }, by), 'note', 'a cut without a reason')
cl = claimStep(cl, 'claimApprove', { amount: 9000, note: 'Lens cost above the package' }, by)
cl = claimStep(cl, 'paid', { ref: 'DEMO-UTR-1' }, by)
if (cl.stage !== 'paid' || cl.paid !== 9000 || cl.payRef !== 'DEMO-UTR-1') fail('money received is the approved amount')
refused(() => claimStep(cl, 'cancel', { note: 'x' }, by), 'closed', 'change a closed claim')
if (cl.history.map((h) => h.stage).join() !== 'preauthSent,preauthQuery,preauthSent,preauthApproved,discharged,claimSent,claimApproved,paid') fail('the history lists every step')
if (patientView(cl).view !== 'done' || patientView({ ...cl, stage: 'preauthApproved' }).view !== 'approved' || patientView({ ...cl, stage: 'cancelled' }) !== null)
  fail('what the patient sees about their claim')
// The stage goes on the patient's own record, never the public queue.
const cs = initialState()
const pj = runAction(cs, 'registerPatient', { name: 'Ravi', age: 40, gender: 'm', lang: 'en', dept: 'EYE', payChoice: 'card', card: 'pmjay', secret: 'k9' }).result
runAction(cs, 'decideWaiver', { pid: pj.id, approve: true })
runAction(cs, 'setClaim', { pid: pj.id, claim: patientView(cl) })
if (cs.patients[pj.id].claim?.view !== 'done' || !staffState(cs).patients[pj.id].claim) fail('staff see the claim on the patient')
if (JSON.stringify(redactState(cs)).includes('claim') || JSON.stringify(redactPatch({ rev: 1, patients: { [pj.id]: cs.patients[pj.id] } })).includes('claim'))
  fail('the public queue must not show PM-JAY claims')
const samples = sampleClaims(Date.now(), 1, 'admin')
if (new Set(samples.map((c) => c.stage)).size < 8 || samples.some((c) => !STAGES.includes(c.stage) || c.history.at(-1).at > Date.now())) fail('sample claims cover the stages, in the past')
if (PACKAGES.some((p) => !p.code.startsWith('DEMO-'))) fail('package codes must be clearly made up')
const tot = claimTotals(samples)
console.log(`  every step in order, ${['notNow', 'amount', 'note', 'docs', 'closed'].length} kinds of wrong step refused; samples: ${tot.open} open, ₹${tot.received} received`)

// 9. Joining on arrival ----------------------------------------------------------
section('9. Joining the line on arrival, and confirming free care')
const ar = initialState()
const arReg = (a) => runAction(ar, 'registerPatient', { gender: 'm', lang: 'en', dept: 'MED', ...a }).result
const atDesk = arReg({ name: 'Desk', age: 40, via: 'counter' })
const home = arReg({ name: 'Home', age: 30 })
const scanned = arReg({ name: 'Scanned', age: 30, here: true })
if (home.status !== 'booked' || atDesk.status !== 'waiting' || scanned.status !== 'waiting') fail('a phone booking is not in the line; counter and scanned are')
if (waitingList(ar, 'MED').some((p) => p.id === home.id) || aheadOf(ar, ar.patients[home.id]) !== 0) fail('a booking must not hold a place')
runAction(ar, 'callNext', { room: 1 })
if (ar.patients[home.id].status !== 'booked') fail('doctors never call a booking')
const homeToken = runAction(ar, 'checkIn', { pid: home.id }).result
const line = waitingList(ar, 'MED')
if (homeToken !== home.token || line.at(-1).id !== home.id) fail('check-in joins the end of the line')
if (runAction(ar, 'checkIn', { pid: home.id }).result !== null) fail('checking in twice does nothing')
// A missed turn can check in again, at the end.
runAction(ar, 'callNext', { room: 1 })
runAction(ar, 'markNoShow', { room: 1 })
const missed = Object.values(ar.patients).find((p) => p.status === 'noshow')
runAction(ar, 'checkIn', { pid: missed.id })
if (waitingList(ar, 'MED').at(-1).id !== missed.id) fail('a missed turn rejoins at the end')
// Bookings are for the day they were made.
const old = arReg({ name: 'Yesterday', age: 30 })
ar.patients[old.id].bookedAt = simNow(ar.clock) - 86400000
if (runAction(ar, 'checkIn', { pid: old.id }).result !== null) fail("yesterday's booking cannot join today's line")
// With the rule off (quick demo), phones join straight away.
runAction(ar, 'setArrival', { on: false })
if (arReg({ name: 'Quick', age: 30 }).status !== 'waiting') fail('arrival rule off: phones join at once')
runAction(ar, 'setArrival', { on: true })
// Free care typed on a phone waits for staff.
const claimsSenior = arReg({ name: 'Says70', age: 70 })
const b0 = billSummary(ar.patients[claimsSenior.id])
if (b0.state !== 'cardCheck' || b0.due !== 10 || ar.patients[claimsSenior.id].waiver?.card !== 'senior') fail('age typed on a phone is a claim, ₹10 due until confirmed')
if (ar.patients[claimsSenior.id].status !== 'booked') fail('a free-care claim still books normally')
runAction(ar, 'decideWaiver', { pid: claimsSenior.id, approve: false })
if (billSummary(ar.patients[claimsSenior.id]).due !== 10 || ar.messages[0].kind !== 'freeNo') fail('age not confirmed: fee stays due')
const mum = arReg({ name: 'Mum', age: 25, dept: 'WMN' })
runAction(ar, 'decideWaiver', { pid: mum.id, approve: true })
if (billSummary(ar.patients[mum.id]).freeReason !== 'pregnancy' || ar.messages[0].kind !== 'freeOk') fail('pregnancy care confirmed: free')
if (JSON.stringify(staffState({ ...ar, patients: { x: { ...ar.patients[home.id], device: 'abc' } } })).includes('abc')) fail('staff never see the booking phone id')
console.log('  bookings hold no place; check-in joins the end; missed turns rejoin; old bookings refused; free care waits for staff')

// 10. Local alerts -------------------------------------------------------------------
section('10. Local alerts: news, effects, learning, early warning')
const heads = [
  ['लखनऊ में डेंगू के 13 नए मरीज मिले', 'outbreak:dengue'],
  ['Eye flu cases rise in Lucknow schools', 'outbreak:eyeFlu'],
  ['Lucknow: viral fever cases surge in hospitals', 'outbreak:flu'],
  ['Bharat Bandh today: what is open in Lucknow', 'strike'],
  ['Roads closed after waterlogging in Lucknow', 'roads'],
  ['लखनऊ में कल से मेला शुरू', 'festival'],
  ['Lucknow Metro opens new station', null],
]
for (const [h, want] of heads) {
  const c = classifyHeadline(h)
  if ((c ? kindOf(c) : null) !== want) fail(`headline "${h}": got ${c ? kindOf(c) : null}, want ${want}`)
}
const rss = `<rss><channel><item><title>Dengue &amp; malaria up in Lucknow - Daily Paper</title><link>https://example.org/a</link><pubDate>Fri, 23 Oct 2026 08:00:00 GMT</pubDate><source url="https://example.org">Daily Paper</source></item><item><title><![CDATA[No link]]></title></item></channel></rss>`
const parsed = parseRss(rss)
if (parsed.length !== 1 || parsed[0].title !== 'Dengue & malaria up in Lucknow' || parsed[0].publisher !== 'Daily Paper' || !parsed[0].publishedAt) fail('RSS: title without " - Publisher", entities, broken item skipped')
const big = effectFor({ type: 'outbreak', disease: 'dengue', strength: 'large' })
if (big.depts.MED !== 38 || effectFor({ type: 'festival' }).all !== -20) fail('alert effects and strength')

// An alert changes only its own dates, and the departments it affects.
const day0 = dateKey(Date.now())
const monday = (() => {
  let k = addDays(day0, 1)
  while (keyToDate(k).getDay() !== 3) k = addDays(k, 1)
  return k
})()
const dengue = { type: 'outbreak', disease: 'dengue', from: monday, to: monday, strength: 'medium' }
const plainDay = simulateDay(monday, cond)
const sickDay = simulateDay(monday, cond, { signals: [dengue] })
if (!(sickDay.byDept.MED > plainDay.byDept.MED * 1.2 && Math.abs(sickDay.byDept.SKN - plainDay.byDept.SKN) < 1)) fail('a dengue alert fills General Medicine, not Skin')
if (simulateDay(addDays(monday, 1), cond, { signals: [dengue] }).total !== simulateDay(addDays(monday, 1), cond).total) fail('an alert only changes its own dates')
if (!dayFactors(monday, cond, null, [dengue]).factors.some((f) => f.key === 'sig.outbreak.dengue')) fail('the alert is listed as a reason')
if (!staffSuggestions(sickDay, cond, monday, [dengue]).some((x) => x.key === 'sigOutbreak' && x.disease === 'dengue')) fail('staff are told what to plan for an outbreak')
const fest = { type: 'festival', from: monday, to: monday }
if (!(simulateDay(monday, cond, { signals: [fest] }).total < plainDay.total * 0.85)) fail('a festival day is quieter')

// Learning: history with a dengue spell (General Medicine ×1.4) and a festival day (×0.7).
const hist = []
for (let i = 1; i <= 40; i++) {
  const date = addDays(day0, -i)
  const dow = keyToDate(date).getDay()
  if (dow === 0) continue
  const sick = i >= 10 && i <= 17
  const party = i === 25
  const base = 240 * (party ? 0.7 : 1)
  const share = { MED: 0.34, CHD: 0.14, WMN: 0.125, BON: 0.1, ENT: 0.07, EYE: 0.1, SKN: 0.08 }
  const byDept = Object.fromEntries(Object.entries(share).map(([k, v]) => [k, Math.round(base * v * (sick && k === 'MED' ? 1.4 : 1))]))
  const total = Object.values(byDept).reduce((a, b) => a + b, 0)
  hist.push({ date, total, byDept, byHour: { 9: total }, sig: sick ? ['outbreak:dengue'] : party ? ['festival'] : [] })
}
const lh = learnFromHistory(hist)
const lMed = lh.signals['outbreak:dengue']?.depts.MED
if (!(lMed > 30 && lMed < 40)) fail(`learned dengue effect on General Medicine ≈ +40% blended (got ${lMed})`)
if (!(lh.signals.festival?.all < -20)) fail(`learned festival effect (got ${lh.signals.festival?.all})`)
if (Math.abs(lh.deptShare.MED - learnFromHistory(hist.filter((d) => !d.sig.length)).deptShare.MED) > 0.001) fail('alert days must not change the usual department mix')
if (effectFor(dengue, lh).depts.MED !== lMed) fail('a new alert uses what this hospital learned')

// Early warning: General Medicine up 40% on the last 3 open days, with no alert.
const rising = hist.map((d, idx) => (idx < 3 ? { ...d, byDept: { ...d.byDept, MED: Math.round(d.byDept.MED * 1.4) } } : d))
const tr = opdTrend(rising, learnFromHistory(rising), day0)
if (tr.length !== 1 || tr[0].dept !== 'MED' || tr[0].pct < 30) fail(`early warning for General Medicine (got ${JSON.stringify(tr)})`)
if (opdTrend(hist, lh, day0).length) fail('no early warning on usual days')
const ts = trendSignals(tr, day0)
if (ts[0].effect.depts.MED !== Math.round(tr[0].pct / 2) || ts[0].to !== addDays(day0, 6)) fail('the warning carries half the extra into the next week')

// Busy days: a usual day vs a strong outbreak vs a bandh.
const wk = [plainDay, simulateDay(monday, cond, { signals: [{ ...dengue, strength: 'large' }, { type: 'busier', from: monday, to: monday, strength: 'large' }] }), simulateDay(monday, cond, { signals: [{ type: 'strike', from: monday, to: monday }] })].map((sim) => ({ key: monday, sim, closed: false, total: Math.round(sim.total) }))
const levels = busyDays(wk).map((d) => d.level)
if (levels[1] === 'normal' || levels[2] !== 'quiet') fail(`busy-day levels (got ${levels})`)
// A week that starts on a closed Sunday still says how big a usual day is.
const fromSunday = busyDays([{ key: monday, closed: true, total: 0 }, ...wk])
if (!(fromSunday[0].usual > 0) || fromSunday[0].usual !== fromSunday[1].usual) fail(`usual day on a closed day (got ${fromSunday[0].usual})`)
console.log(`  ${heads.length} headlines sorted, effects by date and department, learned dengue +${lMed}%, early warning +${tr[0].pct}%`)

// 11. Emergency visits ------------------------------------------------------------
section('11. Emergency visits and their fee')
const es = initialState()
const emr = (a = {}) => runAction(es, 'recordEmergency', { lang: 'en', ...a }).result
if (emr({ name: 'A', age: 40 }).bill.length) fail('no Emergency fee by default (free)')
runAction(es, 'setEmergencyFee', { amount: 100 })
const due = emr({ age: 40 })
const elder = emr({ age: 72 })
const bplCard = emr({ age: 30, card: 'bpl', cardOk: true })
const unknown = emr({})
const sum11 = (x) => billSummary(es.patients[x.id])
if (sum11(due).due !== 100 || sum11(elder).state !== 'free' || sum11(bplCard).state !== 'free' || sum11(unknown).due !== 100) fail('fee after care; free for age 60+ and a card staff saw; unknown age still recorded')
if (!/^EMR-\d{3}$/.test(due.token) || due.status !== 'emergency') fail('Emergency token and status')
runAction(es, 'payBill', { pid: due.id, method: 'cash' })
if (sum11(due).state !== 'paid' || !receiptsOf(es.patients[due.id]).length) fail('Emergency fee paid in cash, with a receipt')
if (departments.some((d) => waitingList(es, d.id).length) || es.messages.length) fail('Emergency visits are never in an OPD line and get no messages')
if (JSON.stringify(redactState(es)).includes('"name":"A"')) fail('the public queue has no Emergency names')
console.log('  free by default; billed after care when set; free care applies; never in an OPD line')

// 12. Ask, SMS, nearby hospitals, impact -----------------------------------------
section('12. Ask, SMS, nearby hospitals, impact')
const as = initialState()
for (let i = 0; i < 5; i++) runAction(as, 'registerPatient', { name: `Q${i}`, age: 30, gender: 'm', lang: 'en', dept: 'MED', via: 'counter' })
const meQ = Object.values(as.patients)[3]
const askCases = [
  ['Where is the X-ray?', 'en', 'g_xray'],
  ['dawai kahan milegi', 'hi', 'g_pharmacy'],
  ['एक्स-रे कहाँ है?', 'hi', 'g_xray'],
  ['eye doctor kahan hai', 'en', 'f1_opd7'],
  ['where is the toilet', 'en', 'g_toilets'],
  ['blood test kahan hota hai', 'en', 'g_lab'],
  ['earlier I came here', 'en', 'g_help'],
]
for (const [q, l, want] of askCases) {
  const r = simpleAnswer(as, q, l)
  if (r.placeId !== want || r.emergency) fail(`ask "${q}": got ${r.placeId}, want ${want}`)
}
for (const q of ['my father has chest pain', 'सीने में दर्द है', 'saans nahi aa rahi', 'accident ho gaya']) {
  const r = simpleAnswer(as, q, 'en')
  if (!r.emergency || r.placeId !== 'g_emergency') fail(`urgent words must go to Emergency: "${q}"`)
}
if (!simpleAnswer(as, 'How long is my wait?', 'en', meQ).answer.includes('3 people are ahead')) fail('ask: my own wait')
if (!simpleAnswer(as, 'meri baari kab aayegi', 'hi', meQ).answer.includes('3 लोग')) fail('ask: my own wait in Hindi')
if (!simpleAnswer(as, 'When does the OPD close?', 'en').answer.includes('Sunday')) fail('ask: timings')
const smsCases = [
  ['MED 4', 'status', 'MED-004', 'en'],
  ['med-004', 'status', 'MED-004', 'en'],
  ['KAHAN XRAY', 'where', null, 'hi'],
  ['IN 123456 MED-4', 'in', 'MED-004', 'en'],
  ['chest pain please help', 'emergency', null, 'en'],
  ['hello', 'help', null, 'en'],
]
for (const [text, cmd, token, lang] of smsCases) {
  const m = parseSms(text)
  if (m.cmd !== cmd || (token && m.token !== token) || m.lang !== lang) fail(`SMS "${text}": got ${m.cmd}/${m.token}/${m.lang}`)
}
if (!smsText(as, parseSms('MED 4')).includes('3 people are ahead') || smsText(as, parseSms('MED 4')).includes('Q3')) fail('SMS status: place in the line, never the name')
if (!smsText(as, parseSms('MED 99')).includes('could not find')) fail('SMS: unknown token')
// Past token 999 a token has four digits, and is still found.
const k999 = initialState()
k999.counters.MED = 998
for (let i = 0; i < 2; i++) runAction(k999, 'registerPatient', { name: `B${i}`, age: 30, gender: 'm', lang: 'en', dept: 'MED', via: 'counter' })
if (findByToken(k999, 'MED-1000')?.num !== 1000 || findByToken(k999, 'med 999')?.num !== 999 || parseSms('MED 1000').token !== 'MED-1000') fail('tokens past 999 are found')
// Nearby hospitals: shown only when it is busy here and the trip saves time.
const weekday10 = (() => {
  const d = new Date()
  while (d.getDay() === 0) d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return d.getTime()
})()
if (NEARBY.some((h) => nearbyWait(h, weekday10) == null)) fail('nearby hospitals are open at 10:00 on a weekday')
const sunday = (() => {
  const d = new Date(weekday10)
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
  return d.getTime()
})()
if (NEARBY.some((h) => nearbyWait(h, sunday) != null)) fail('nearby OPDs are closed on Sunday')
const quiet = initialState()
if (loadShare(quiet, 'MED', weekday10)) fail('no suggestion when it is not busy here')
const crowd = initialState()
for (let i = 0; i < 40; i++) runAction(crowd, 'registerPatient', { name: `C${i}`, age: 30, gender: 'm', lang: 'en', dept: 'MED', via: 'counter' })
const share = loadShare(crowd, 'MED', weekday10)
if (!share || share.here < BUSY_HERE || share.best.wait + share.best.roadMins > share.here - 15) fail('a nearby hospital is suggested when busy and quicker')
runAction(crowd, 'setShareLoad', { on: false })
if (loadShare(crowd, 'MED', weekday10)) fail('staff can turn the suggestion off')
// Impact: a missed turn checked in again counts as rescued.
const im = initialState()
const imp = runAction(im, 'registerPatient', { name: 'I', age: 30, gender: 'm', lang: 'en', dept: 'CHD' }).result
runAction(im, 'checkIn', { pid: imp.id })
runAction(im, 'callNext', { room: 3 })
runAction(im, 'markNoShow', { room: 3 })
runAction(im, 'checkIn', { pid: imp.id })
const x = impactToday(im)
if (x.phone !== 1 || x.arrived !== 1 || x.rejoined !== 1) fail(`impact counts (got ${JSON.stringify(x)})`)
console.log(`  ${askCases.length} questions answered, urgent words always to Emergency, ${smsCases.length} SMS commands, nearby only when it helps`)

// 13. After the doctor ---------------------------------------------------------------
section('13. Back with reports, promised waits, feedback')
{
  const s = initialState()
  const t0 = simNow(s.clock)
  const reg = (name, i) => runAction(s, 'registerPatient', { name, age: 30, gender: 'f', lang: 'en', dept: 'MED', via: 'counter', order: t0 + i }).result
  const ppl = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(reg)
  if (!ppl.every((p) => s.patients[p.id].est && Number.isFinite(s.patients[p.id].est.mins))) fail('everyone who joins the line is told a wait')
  runAction(s, 'callNext', { room: 1 })
  const a = s.patients[ppl[0].id]
  runAction(s, 'addCharges', { pid: a.id, tests: ['cbc', 'xray'] })
  if (reportsState(a) !== 'pending' || a.reports.tests.join() !== 'cbc,xray') fail('tests from the consultation keep the visit open')
  runAction(s, 'callNext', { room: 1 })
  if (a.status !== 'done' || joinKind(a) !== 'reports') fail('seen, with reports to bring back')
  if (s.messages.some((m) => m.pid === a.id && m.kind === 'done')) fail('no "how was it?" while tests are still to do')
  if (!smsText(s, parseSms('MED 1')).includes('tests')) fail('SMS status says: go for the tests')
  if (runAction(s, 'giveFeedback', { pid: ppl[3].id, score: 'good' }).result !== null) fail('no feedback before the visit')
  runAction(s, 'reportsReady', { pid: a.id })
  if (reportsState(a) !== 'ready' || s.messages[0].kind !== 'reportsReady') fail('reports ready: a message to the patient')
  const pub = redactState(s).patients[a.id]
  if (pub.reports || pub.reportsState !== 'ready' || JSON.stringify(pub).includes('xray')) fail('the public queue knows reports are ready, never which tests')
  runAction(s, 'checkIn', { pid: a.id })
  if (a.status !== 'waiting' || aheadOf(s, a) !== RETURN_AFTER || reportsState(a) !== 'back') fail(`back with reports goes in after ${RETURN_AFTER} people (got ${aheadOf(s, a)})`)
  if (!s.messages.some((m) => m.pid === a.id && m.kind === 'backIn') || runAction(s, 'checkIn', { pid: a.id }).result !== null) fail('back in once, with a message')
  // A short line: the end of it.
  const t = initialState()
  const p1 = runAction(t, 'registerPatient', { name: 'P', age: 30, gender: 'm', lang: 'en', dept: 'EYE', via: 'counter' }).result
  runAction(t, 'registerPatient', { name: 'Q', age: 30, gender: 'm', lang: 'en', dept: 'EYE', via: 'counter' })
  runAction(t, 'callNext', { room: 7 })
  runAction(t, 'addCharges', { pid: p1.id, tests: ['sugar'] })
  runAction(t, 'callNext', { room: 7 })
  runAction(t, 'checkIn', { pid: p1.id })
  if (waitingList(t, 'EYE').at(-1).id !== p1.id) fail('back with reports, short line: at the end')
  // Reports are for the same day.
  const u = initialState()
  const p2 = runAction(u, 'registerPatient', { name: 'R', age: 30, gender: 'm', lang: 'en', dept: 'SKN', via: 'counter' }).result
  runAction(u, 'callNext', { room: 8 })
  runAction(u, 'addCharges', { pid: p2.id, tests: ['cbc'] })
  runAction(u, 'callNext', { room: 8 })
  u.patients[p2.id].reports.at -= 86400000
  if (runAction(u, 'checkIn', { pid: p2.id }).result !== null) fail("yesterday's reports: register again")
  // Finished: thanks, and one answer per visit.
  const b = s.patients[ppl[1].id]
  runAction(s, 'callNext', { room: 1 })
  if (!s.messages.some((m) => m.pid === b.id && m.kind === 'done')) fail('a finished visit gets "how was it?"')
  if (runAction(s, 'giveFeedback', { pid: b.id, score: 'bad', reasons: ['wait', 'nonsense', 'wait'] }).result !== true) fail('feedback after the visit')
  if (b.feedback.reasons.join() !== 'wait' || runAction(s, 'giveFeedback', { pid: b.id, score: 'good' }).result !== null) fail('known reasons only, once per visit')
  if (redactState(s).patients[b.id].feedback || !redactState(s).patients[b.id].rated) fail('the public queue only knows feedback was given')
  // The estimate counts the consultation in progress.
  const v = initialState()
  runAction(v, 'registerPatient', { name: 'S', age: 30, gender: 'm', lang: 'en', dept: 'CHD', via: 'counter' })
  if (estimateWait(v, 'CHD', 0, simNow(v.clock)) !== 0) fail('a free doctor: no wait')
  runAction(v, 'callNext', { room: 3 })
  if (estimateWait(v, 'CHD', 0, simNow(v.clock)) <= 0) fail('next in line still waits for the patient inside')
  // SMS and Telegram replies: 1, 2 or 3, with or without a token.
  for (const [text, score, token] of [['1', 'good', null], ['2 MED 4', 'okay', 'MED-004'], ['3 med-12', 'bad', 'MED-012']]) {
    const m = parseSms(text)
    if (m.cmd !== 'rate' || m.score !== score || m.token !== token) fail(`SMS "${text}": got ${JSON.stringify(m)}`)
  }
  if (parseSms('12').cmd === 'rate' || parseSms('MED 1').cmd !== 'status') fail('only 1, 2 or 3 on its own is a rating')
  if (!smsText(s, parseSms('1'), { rated: true }).includes('Thank you')) fail('SMS: thanks for the feedback')
  // Demo: earlier visits with promised and real waits, feedback, one at the tests.
  const w = initialState()
  runAction(w, 'addSampleVisits', { n: 10 })
  const acc = estimateAccuracy(w)
  const fb = feedbackSummary(w)
  const atTests = Object.values(w.patients).filter((p) => joinKind(p) === 'reports')
  if (!acc || acc.total !== 10 || acc.within5 < 7 || !fb || fb.n !== 8 || fb.top !== 'wait' || atTests.length !== 1) fail(`sample visits (${JSON.stringify({ acc, fb, atTests: atTests.length })})`)
  if (Object.keys(w.history).length) fail('sample visits never change consultation times')
  if (impactToday(s).backWithReports !== 1) fail('impact: back with reports')
  console.log(`  back with reports after ${RETURN_AFTER} people, same day; one answer per visit; sample day ${acc.within5}/${acc.total} on time, ${fb.n} answers`)
}

// 14. Paper slips, and the Emergency slip fee ------------------------------------
section('14. Paper slips for the doctor, and the Emergency slip fee')
{
  const s = initialState()
  const reg = (a) => runAction(s, 'registerPatient', { gender: 'f', lang: 'hi', dept: 'MED', age: 30, ...a }).result
  const desk = reg({ name: 'Desk', via: 'counter' })
  const booked = reg({ name: 'Booked' })
  const here = reg({ name: 'Here', here: true })
  const ent = reg({ name: 'Ent', here: true, dept: 'ENT' })
  if (s.patients[desk.id].slip || s.patients[booked.id].slip?.status !== 'due' || slipState(s.patients[booked.id]) !== null) fail('only phone registrations need a printed slip, once in the line')
  if (slipsToPrint(s).map((x) => x.p.id).join() !== [ent.id, here.id].join()) fail('slips to print: soonest first, bookings not yet')
  if (slipsToPrint(s, 'MED').length !== 1) fail('slips to print for one doctor')
  runAction(s, 'callNext', { room: 1 })
  runAction(s, 'callNext', { room: 2 })
  if (s.patients[here.id].status !== 'called' || slipsToPrint(s)[0].p.id !== here.id) fail('called without a slip: first in the list')
  // Printed at the counter, then taken to the room.
  if (runAction(s, 'printSlips', { pids: [here.id, ent.id, desk.id, booked.id] }).result !== 2) fail('prints only phone slips in the line')
  if (s.patients[here.id].slip.status !== 'printed' || s.messages.some((m) => m.kind === 'slipAtRoom')) fail('printed at the counter: not at the room yet')
  const r14 = runAction(s, 'slipsToRoom', { pids: [here.id] })
  if (s.patients[here.id].slip.status !== 'atRoom' || s.messages[0].kind !== 'slipAtRoom' || !r14.events.some((e) => e.type === 'slip_at_room')) fail('taken to the room: the patient is told')
  if (runAction(s, 'slipsToRoom', { pids: [here.id] }).result !== 0) fail('taking a slip twice does nothing')
  // Printed at the doctor's room: there at once.
  runAction(s, 'setSlipMode', { mode: 'room' })
  const atRoom = reg({ name: 'Room', here: true })
  runAction(s, 'printSlips', { pids: [atRoom.id] })
  if (s.patients[atRoom.id].slip.status !== 'atRoom' || s.messages[0].kind !== 'slipAtRoom') fail('printed at the room: with the doctor at once')
  // At the slip window: the patient takes it; printing again counts copies.
  runAction(s, 'setSlipMode', { mode: 'window' })
  const win = reg({ name: 'Window', here: true })
  runAction(s, 'printSlips', { pids: [win.id] })
  runAction(s, 'printSlips', { pids: [win.id] })
  if (s.patients[win.id].slip.status !== 'given' || s.patients[win.id].slip.copies !== 2 || s.messages.some((m) => m.pid === win.id && m.kind === 'slipAtRoom')) fail('slip window: handed over, printed again on request')
  // Moved to another doctor: a new token, so a new slip.
  runAction(s, 'movePatient', { pid: ent.id, dept: 'CHD' })
  if (s.patients[s.patients[ent.id].movedTo].slip?.status !== 'due') fail('moved: a new slip to print')
  // The public queue knows where the slip is, not whose it is.
  const pub = redactState(s).patients[here.id]
  if (pub.slip?.status !== 'atRoom' || pub.name) fail('public: slip status only')
  if (!can({ role: 'reception' }, 'printSlips') || can(null, 'printSlips') || can({ role: 'nurse' }, 'setSlipMode') || !can({ role: 'admin' }, 'setSlipMode')) fail('slip roles')
  const before14 = JSON.parse(JSON.stringify(s))
  runAction(s, 'setSlipMode', { mode: 'counter' })
  if (diffState(before14, s).hospital?.slipMode !== 'counter') fail('the slip mode reaches every screen')
  // Emergency slip fee, before the doctor.
  const e = initialState()
  runAction(e, 'setEmergencyFee', { amount: 20, when: 'before' })
  runAction(e, 'setEmergencyFee', { amount: 30 })
  if (e.emergencyFee !== 30 || e.emergencyPay !== 'before') fail('Emergency fee: amount and when')
  const paid = runAction(e, 'recordEmergency', { name: 'X', age: 30, paidCash: true, lang: 'hi' }).result
  const elder14 = runAction(e, 'recordEmergency', { age: 75, lang: 'hi' }).result
  if (billSummary(e.patients[paid.id]).state !== 'paid' || billSummary(e.patients[elder14.id]).state !== 'free') fail('Emergency slip: paid at the counter, free care still applies')
  console.log('  phone slips printed soonest first; counter → room, room printer, slip window; moves reprint; Emergency fee before the doctor')
}

console.log(failures ? `\n${failures} problem(s) found.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
