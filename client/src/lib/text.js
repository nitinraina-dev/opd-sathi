// Small text helpers shared by several screens. They take the translate
// function, so they work in any language.

import { deptById } from '../data/departments.js'
import { placeById } from '../data/hospital.js'
import { pick } from '../i18n/translate.js'
import { rupees } from './billing.js'

export function roomsText(deptId, t) {
  const rs = deptById[deptId].rooms.map((r) => r.room)
  return rs.length === 1 ? t('common.room', { n: rs[0] }) : t('common.roomOr', { a: rs[0], b: rs[1] })
}

export function deptFloor(deptId) {
  return placeById[deptById[deptId].rooms[0].placeId].floor
}

export function roomFloorText(deptId, t) {
  return t('slip.roomFloor', { rooms: roomsText(deptId, t), floor: t(`floors.${deptFloor(deptId)}.ref`) })
}

export function waitText(mins, t) {
  return mins < 5 ? t('common.lessThan5') : t('common.aboutMin', { n: mins })
}

export function doctorNames(deptId, lang) {
  return deptById[deptId].rooms.map((r) => pick(r.doctor, lang)).join(', ')
}

export function doctorOf(room, lang) {
  for (const d of Object.values(deptById)) for (const r of d.rooms) if (r.room === room) return pick(r.doctor, lang)
  return ''
}

export function patientName(p, lang) {
  if (!p) return ''
  return lang === 'hi' && p.nameHi ? p.nameHi : p.name
}

// Doctor status in plain words, for one room.
export function doctorStatusText(st, t) {
  if (st.status === 'break') return t('doctor.break', { time: st.until })
  if (st.status === 'late') return t('doctor.late', { n: st.lateBy })
  return t('doctor.in')
}

export const genderIcon = { f: 'woman', m: 'man', x: 'person' }

// The text of a message (SMS / alert) in any language. Used on the patient's
// screen and by the server for web-push alerts.
export function messageText(m, t) {
  const floor = t(`floors.${deptFloor(m.dept)}.ref`)
  return t(`sms.${m.kind}`, {
    token: m.token,
    rooms: roomsText(m.dept, t),
    room: m.room,
    floor,
    newToken: m.newToken,
    dept: t(`depts.${m.dept}.name`),
    amount: rupees(m.amount),
    receipt: m.receipt || '',
  })
}

export function messageTitle(m, t) {
  if (m.kind === 'near') return t('turn.nearTitle')
  if (m.kind === 'called') return t('turn.calledTitle')
  return t('app.name')
}

// One reason in a forecast, e.g. "Dengue alert in the area (+6%)".
export function factorText(f, t) {
  const vars = { ...(f.vars || {}), ...(f.vars?.dept ? { dept: t(`depts.${f.vars.dept}.name`) } : {}) }
  const sign = f.pct > 0 ? '+' : ''
  return `${t(`factors.${f.key}`, vars)}${f.pct ? ` (${sign}${f.pct}%)` : ''}`
}

// A local alert's name: "Dengue", "Festival or mela", …
export const signalName = (s, t) => (s.type === 'outbreak' ? t(`signals.disease.${s.disease}`) : t(`signals.type.${s.type}`))

// What an alert does: "General Medicine +25%, Children +20%" or "All patients −20%".
export function effectText(eff, t) {
  const sign = (p) => `${p > 0 ? '+' : '−'}${Math.abs(p)}%`
  const parts = Object.entries(eff.depts || {}).map(([d, p]) => `${t(`depts.${d}.name`)} ${sign(p)}`)
  if (eff.all) parts.unshift(t('signals.allPatients', { pct: sign(eff.all) }))
  return parts.join(', ')
}

