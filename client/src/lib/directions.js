// Turns a route into plain step-by-step directions with landmarks, e.g.
//   "Take the lift to the first floor."
//   "Come out of the lift and turn right."
//   "Room 3 is the third door on your left, opposite the blue chairs."
// Steps are stored as text keys plus values, so they are translated when shown
// and switch language instantly.

import { nodes, placeById, placesAtCorridor } from '../data/hospital.js'

const N = (id) => nodes[id]
const vec = (a, b) => ({ x: b.x - a.x, y: b.y - a.y })
const len = (v) => Math.hypot(v.x, v.y) || 1

// Signed angle from heading a to direction b, in degrees. Positive means a
// turn to the right (the plan's y axis points down).
function angle(a, b) {
  const cross = a.x * b.y - a.y * b.x
  const dot = a.x * b.x + a.y * b.y
  return (Math.atan2(cross, dot) * 180) / Math.PI
}

function turnOf(heading, dir) {
  if (!heading) return 'straight'
  const a = angle(heading, dir)
  if (Math.abs(a) < 30) return 'straight'
  if (Math.abs(a) > 150) return 'back'
  return a > 0 ? 'right' : 'left'
}

function sideOf(heading, dir) {
  if (!heading) return 'ahead'
  const a = angle(heading, dir)
  if (Math.abs(a) < 30) return 'ahead'
  if (Math.abs(a) > 150) return 'behind'
  return a > 0 ? 'right' : 'left'
}

const P = (id, form) => ({ place: id, form })
const roundM = (m) => Math.max(5, Math.round(m / 5) * 5)

// A notable place near the middle of a corridor run, to say "past the …".
function pickPast(midNodes, dest) {
  if (!midNodes.length) return null
  const mid = (midNodes.length - 1) / 2
  let best = null
  let bestD = Infinity
  midNodes.forEach((c, i) => {
    for (const pid of placesAtCorridor[c] || []) {
      if (pid === dest || !placeById[pid].notable) continue
      const d = Math.abs(i - mid)
      if (d < bestD) {
        bestD = d
        best = pid
      }
    }
  })
  return best
}

// Which door on that side the destination is, counting from where the run
// started (the corridor point where you turned).
function ordinalDoor(runNodes, dest, side, heading) {
  let count = 0
  for (const c of runNodes.slice(1)) {
    const at = N(c)
    for (const pid of placesAtCorridor[c] || []) {
      const p = placeById[pid]
      if (!p.door) continue
      if (sideOf(heading, vec(at, N(pid))) !== side) continue
      count++
      if (pid === dest) return count
    }
  }
  return 0
}

function exitKey(placeId) {
  const k = placeById[placeId]?.kind
  if (k === 'lift') return 'dir.exitLift'
  if (k === 'stairs') return 'dir.exitStairs'
  if (k === 'ramp') return 'dir.exitRamp'
  return 'dir.exitPlace'
}

export function buildDirections(route) {
  const path = route.nodes
  const es = route.edges
  const k = path.length - 1
  const start = path[0]
  const dest = path[k]
  const steps = []

  if (k === 0) {
    return [{ key: 'dir.already', vars: { place: P(dest, 'ref') }, icon: 'pin', floor: N(dest).floor, at: dest }]
  }

  steps.push({
    key: 'dir.start',
    vars: { place: P(start, 'ref'), landmark: P(start, 'landmark') },
    icon: 'you',
    floor: N(start).floor,
    at: start,
  })

  let heading = null
  let exitFrom = null
  let lastRun = null
  let i = 0

  const flushExit = () => {
    if (!exitFrom) return
    steps.push({ key: 'dir.exitOnly', vars: { place: P(exitFrom, 'ref') }, icon: 'door', floor: N(exitFrom).floor, at: exitFrom })
    exitFrom = null
  }

  while (i < k) {
    const a = N(path[i])
    const b = N(path[i + 1])
    const e = es[i]

    // Lift or stairs, possibly several floors in one go.
    if (e.kind === 'lift' || e.kind === 'stairs') {
      let j = i
      while (j < k && es[j].kind === e.kind) j++
      const toFloor = N(path[j]).floor
      const up = toFloor > a.floor
      steps.push({
        key: e.kind === 'lift' ? 'dir.lift' : up ? 'dir.stairsUp' : 'dir.stairsDown',
        vars: { floor: { floor: toFloor } },
        icon: e.kind,
        floor: a.floor,
        toFloor,
        at: path[i],
      })
      heading = null
      exitFrom = path[j]
      lastRun = null
      i = j
      continue
    }

    // Entrance steps or the ramp.
    if (e.kind === 'steps' || e.kind === 'ramp') {
      const up = e.upTo === path[i + 1]
      steps.push({
        key: `dir.${e.kind}${up ? 'Up' : 'Down'}`,
        icon: e.kind === 'ramp' ? 'ramp' : 'stairs',
        floor: a.floor,
        at: path[i + 1],
      })
      heading = vec(a, b)
      exitFrom = b.type === 'place' && i + 1 < k ? path[i + 1] : null
      lastRun = null
      i++
      continue
    }

    // Stepping out of a place into the corridor.
    if (a.type === 'place' && b.type === 'corridor') {
      heading = vec(a, b)
      exitFrom = path[i]
      i++
      continue
    }

    // Walking from the corridor into a place.
    if (b.type === 'place') {
      if (i + 1 === k) break // the destination: described below
      flushExit()
      const side = sideOf(heading, vec(a, b))
      steps.push({
        key: side === 'ahead' ? 'dir.goToAhead' : side === 'behind' ? 'dir.goToBehind' : 'dir.goTo',
        vars: { place: P(path[i + 1], 'ref'), side: { key: `dir.side.${side}` } },
        icon: placeById[path[i + 1]].kind,
        floor: a.floor,
        at: path[i + 1],
      })
      heading = vec(a, b)
      lastRun = null
      i++
      continue
    }

    // A straight run along the corridor.
    const runStart = i
    const dir0 = vec(a, b)
    let metres = 0
    let j = i
    while (
      j < k &&
      N(path[j]).type === 'corridor' &&
      N(path[j + 1]).type === 'corridor' &&
      Math.abs(angle(dir0, vec(N(path[j]), N(path[j + 1])))) < 25
    ) {
      metres += es[j].m
      j++
    }
    const turn = turnOf(heading, { x: dir0.x / len(dir0), y: dir0.y / len(dir0) })
    const past = metres >= 20 ? pickPast(path.slice(runStart + 1, j), dest) : null
    const m = roundM(metres)
    const pastVars = past ? { place: P(past, 'ref') } : {}

    if (exitFrom) {
      steps.push({
        key: exitKey(exitFrom),
        vars: { place: P(exitFrom, 'ref'), turn: { key: `dir.turnLower.${turn}` } },
        icon: `turn-${turn}`,
        floor: a.floor,
        at: exitFrom,
      })
      steps.push({ key: past ? 'dir.walkPast' : 'dir.walk', vars: { m, ...pastVars }, icon: 'walk', floor: a.floor, at: path[j] })
    } else if (turn === 'straight') {
      steps.push({
        key: past ? 'dir.walkStraightPast' : 'dir.walkStraight',
        vars: { m, ...pastVars },
        icon: 'walk',
        floor: a.floor,
        at: path[j],
      })
    } else {
      steps.push({
        key: past ? 'dir.turnWalkPast' : 'dir.turnWalk',
        vars: { turn: { key: `dir.turn.${turn}` }, m, ...pastVars },
        icon: `turn-${turn}`,
        floor: a.floor,
        at: path[j],
      })
    }
    heading = dir0
    exitFrom = null
    lastRun = { from: runStart, to: j }
    i = j
  }

  // Arrival.
  const door = N(path[k - 1])
  const d = N(dest)
  if (door.type === 'corridor') {
    flushExit()
    const side = sideOf(heading, vec(door, d))
    const ord =
      lastRun && (side === 'left' || side === 'right') && placeById[dest].door
        ? ordinalDoor(path.slice(lastRun.from, lastRun.to + 1), dest, side, heading)
        : 0
    let key = 'dir.arriveSide'
    if (side === 'ahead' || side === 'behind') key = side === 'ahead' ? 'dir.arriveAhead' : 'dir.arriveBehind'
    else if (ord > 0 && ord <= 10) key = 'dir.arriveDoor'
    steps.push({
      key,
      vars: {
        name: P(dest, 'name'),
        side: { key: `dir.side.${side}` },
        ordinal: { key: `ordinal.${ord || 1}` },
        landmark: P(dest, 'landmark'),
      },
      icon: 'pin',
      floor: d.floor,
      at: dest,
      final: true,
    })
  } else {
    steps.push({
      key: 'dir.arrived',
      vars: { place: P(dest, 'ref'), landmark: P(dest, 'landmark') },
      icon: 'pin',
      floor: d.floor,
      at: dest,
      final: true,
    })
  }
  return steps
}

function resolveVar(v, t) {
  if (v == null) return ''
  if (typeof v !== 'object') return v
  if (v.place) return t(`places.${v.place}.${v.form || 'ref'}`)
  if (v.floor !== undefined) return t(`floors.${v.floor}.ref`)
  if (v.key) return t(v.key)
  return ''
}

export function renderStep(step, t) {
  const vars = {}
  for (const [name, v] of Object.entries(step.vars || {})) vars[name] = resolveVar(v, t)
  const s = t(step.key, vars)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
