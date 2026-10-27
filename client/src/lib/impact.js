import { REASONS } from '../data/feedback.js'

// What OPD Saathi changed today, from the day's own records (for the demo
// stage and the pitch). Counts only; no names.
export function impactToday(state) {
  const all = Object.values(state.patients).filter((p) => p.status !== 'moved')
  const opd = all.filter((p) => p.kind !== 'emergency')
  const seen = state.flags.filter((f) => f.seen && f.seenAt && f.at)
  return {
    total: opd.length,
    phone: opd.filter((p) => p.via === 'app').length, // no queue at the counter
    arrived: opd.filter((p) => p.arrivedAt).length, // joined the line on arrival
    rejoined: opd.filter((p) => p.rejoined).length, // missed turns rescued
    freeConfirmed: opd.filter((p) => p.waiver?.status === 'approved').length,
    seenByDoctor: opd.filter((p) => p.status === 'done').length,
    urgentSecs: seen.length ? Math.round(seen.reduce((a, f) => a + (f.seenAt - f.at), 0) / seen.length / 1000) : null,
    emergency: all.filter((p) => p.kind === 'emergency').length,
    backWithReports: opd.filter((p) => p.reports?.backAt || p.reportsState === 'back').length,
    estimate: estimateAccuracy(state),
    feedback: feedbackSummary(state),
  }
}

// The wait we told people when they joined the line, against when they were
// really called: how many were called within 5 minutes of it.
export function estimateAccuracy(state) {
  const off = Object.values(state.patients)
    .filter((p) => p.est && p.calledAt && p.calledAt >= p.est.at)
    .map((p) => (p.calledAt - p.est.at) / 60000 - p.est.mins)
  if (!off.length) return null
  return {
    total: off.length,
    within5: off.filter((d) => Math.abs(d) <= 5).length,
    avgOff: Math.round(off.reduce((a, d) => a + Math.abs(d), 0) / off.length),
  }
}

// "How was your visit?": answers by face, and what went wrong most often.
// Only staff screens (and offline mode) have the answers.
export function feedbackSummary(state) {
  const answers = Object.values(state.patients)
    .map((p) => p.feedback)
    .filter(Boolean)
  if (!answers.length) return null
  const count = (score) => answers.filter((f) => f.score === score).length
  const reasons = Object.fromEntries(REASONS.map((r) => [r, answers.filter((f) => f.reasons?.includes(r)).length]))
  const top = REASONS.filter((r) => reasons[r]).sort((a, b) => reasons[b] - reasons[a])[0] || null
  return { n: answers.length, good: count('good'), okay: count('okay'), bad: count('bad'), reasons, top }
}
