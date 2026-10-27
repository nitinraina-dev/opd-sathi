import { makeClock } from './clock.js'

// If the demo runs outside OPD hours, start the hospital clock at 9:30 today
// so queues, doctor breaks and forecasts make sense.
export function demoStartTime(now = Date.now()) {
  const d = new Date(now)
  const m = d.getHours() * 60 + d.getMinutes()
  if (m >= 8 * 60 + 30 && m < 13 * 60 + 30) return now
  d.setHours(9, 30, 0, 0)
  return d.getTime()
}

// Shared hospital state. Lives in localStorage and is synced between tabs.
export function initialState() {
  return {
    v: 1,
    rev: 0,
    clock: makeClock(1, demoStartTime()),
    autoRun: false,
    arrival: true, // phones book; the place in the line starts at check-in
    emergencyFee: 0, // ₹ for an Emergency visit, billed after care (0 = free)
    shareLoad: true, // when overcrowded, show patients nearby hospitals with shorter waits
    patients: {}, // id -> patient
    counters: {}, // dept -> last token number
    rooms: {}, // room number -> { servingId, status, until, lateBy }
    history: {}, // dept -> last 10 consultation times in minutes
    flags: [], // urgent help flags, newest first
    messages: [], // simulated SMS, newest first
    calls: [], // called tokens for the waiting-room board, newest first
    seq: 1,
    sampleIdx: 0,
  }
}
