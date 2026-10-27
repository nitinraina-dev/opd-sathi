// Sharing the load with nearby hospitals: when this OPD is overcrowded, a
// patient who has not come yet can see where the same doctor is quicker.
// Only for OPD visits: an emergency always goes to the nearest Emergency.
// The other hospitals' waits are SIMULATED for the demo (data/nearby.js).

import { NEARBY } from '../data/nearby.js'
import { minutesOfDay } from './clock.js'
import { estimateWait, waitingList, round5 } from './queue.js'

const OPEN = [8 * 60, 13 * 60 + 30] // registration hours, as here

// A made-up but steady wait for a new patient at a nearby hospital now.
export function nearbyWait(h, now) {
  const d = new Date(now)
  const m = minutesOfDay(now)
  if (d.getDay() === 0 || m < OPEN[0] || m > OPEN[1]) return null
  const rush = Math.exp(-(((m - 10 * 60) / 100) ** 2)) // peaks around 10:00
  const wiggle = 1 + 0.15 * Math.sin(h.phase * 2 + m / 25)
  return round5(5 + 70 * h.busy * (0.35 + rush) * wiggle)
}

// Every nearby hospital with this department, quickest first.
export function nearbyFor(deptId, now) {
  return NEARBY.filter((h) => h.depts.includes(deptId))
    .map((h) => ({ ...h, wait: nearbyWait(h, now) }))
    .filter((h) => h.wait != null)
    .sort((a, b) => a.wait + a.roadMins - (b.wait + b.roadMins))
}

// Worth suggesting? Only when it is busy here (a new patient waits 45 minutes
// or more) and the trip plus the wait there saves at least 15 minutes.
export const BUSY_HERE = 45
export function loadShare(state, deptId, now) {
  if (state.shareLoad === false) return null
  const here = estimateWait(state, deptId, waitingList(state, deptId).length, now)
  if (here < BUSY_HERE) return null
  const best = nearbyFor(deptId, now)[0]
  if (!best || best.roadMins + best.wait > here - 15) return null
  return { here, best }
}
