// Shortest walking route between two places (Dijkstra over the graph in
// src/data/hospital.js). With avoidStairs, edges that use stairs are skipped,
// so the route goes through lifts and the ramp only.

import { nodes, edges, placeById, corridorOf, placesAtCorridor } from '../data/hospital.js'

const adj = {}
for (const id of Object.keys(nodes)) adj[id] = []
edges.forEach((e, i) => {
  adj[e.a].push({ ...e, to: e.b, from: e.a, i })
  adj[e.b].push({ ...e, to: e.a, from: e.b, i })
})

export function shortestPath(from, to, { avoidStairs = false } = {}) {
  if (!nodes[from] || !nodes[to]) return null
  const dist = { [from]: 0 }
  const prev = {}
  const done = new Set()
  // The graph is small (under 100 nodes), so a simple scan is fast enough.
  for (;;) {
    let u = null
    let best = Infinity
    for (const k in dist) {
      if (!done.has(k) && dist[k] < best) {
        best = dist[k]
        u = k
      }
    }
    if (u === null || u === to) break
    done.add(u)
    for (const e of adj[u]) {
      if (avoidStairs && e.stairs) continue
      // Only walk *through* corridors, lifts, stairs, the ramp and the entrance,
      // never through someone's room.
      if (e.to !== to && nodes[e.to].type === 'place' && !isPassThrough(e.to)) continue
      const nd = best + e.m
      if (nd < (dist[e.to] ?? Infinity)) {
        dist[e.to] = nd
        prev[e.to] = { node: u, edge: e }
      }
    }
  }
  if (dist[to] === undefined) return null
  const path = [to]
  const used = []
  let cur = to
  while (cur !== from) {
    const p = prev[cur]
    used.unshift(p.edge)
    path.unshift(p.node)
    cur = p.node
  }
  return {
    from,
    to,
    nodes: path,
    edges: used,
    metres: Math.round(dist[to]),
    usesStairs: used.some((e) => e.stairs),
    usesLift: used.some((e) => e.kind === 'lift'),
    usesRamp: used.some((e) => e.kind === 'ramp'),
    floors: [...new Set(path.map((id) => nodes[id].floor))],
  }
}

function isPassThrough(id) {
  const k = placeById[id]?.kind
  return k === 'lift' || k === 'stairs' || k === 'ramp' || k === 'entrance'
}

// The closest of several places (for "Toilets", "Help desk", …).
export function nearestRoute(from, ids, opts) {
  let best = null
  for (const id of ids) {
    const r = shortestPath(from, id, opts)
    if (r && (!best || r.metres < best.metres)) best = r
  }
  return best
}

export { corridorOf, placesAtCorridor }
