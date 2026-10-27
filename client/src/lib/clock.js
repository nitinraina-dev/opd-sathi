// The hospital clock. Demo controls can speed time up 10x, so every screen
// reads time from the shared clock instead of Date.now().

// When the state comes from the server, the browser's clock may be a little
// off; the store sets this offset so every screen agrees with the server.
let offset = 0
export function setClockOffset(ms) {
  offset = ms
}
export function realNow() {
  return Date.now() + offset
}

export function makeClock(speed = 1, simTime = realNow()) {
  return { speed, anchorReal: realNow(), anchorSim: simTime }
}

export function simNow(clock) {
  if (!clock) return realNow()
  return clock.anchorSim + (realNow() - clock.anchorReal) * clock.speed
}

const pad = (n) => String(n).padStart(2, '0')

export function minutesOfDay(ts) {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

export function fmtTime(ts) {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function hm(mins) {
  const m = Math.round(mins)
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`
}

export function parseHM(s) {
  const [h, m] = String(s || '').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function atTodayHM(ts, s) {
  const d = new Date(ts)
  const mins = parseHM(s)
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  return d.getTime()
}

export function dateKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function keyToDate(key) {
  return new Date(`${key}T12:00:00`)
}

export function addDays(key, n) {
  const d = keyToDate(key)
  d.setDate(d.getDate() + n)
  return dateKey(d.getTime())
}
