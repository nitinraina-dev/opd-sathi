import { useId } from 'react'
import { places, placeById, PLAN, nodes } from '../data/hospital.js'

// Where the route line touches a place: the door on the corridor side, so the
// line and the pin never cover the room's name. The ramp is drawn through its
// middle, and the main entrance at the outside doors.
function pointFor(id) {
  const n = nodes[id]
  if (n.type === 'corridor') return { id, x: n.x, y: n.y }
  const p = placeById[id]
  if (p.kind === 'entrance') return { id, x: p.x, y: 466 }
  if (p.kind === 'ramp') return { id, x: p.rect[0] + p.rect[2] - 12, y: p.rect[1] + p.rect[3] - 10 }
  const left = p.rect[0] < PLAN.corridorLeft
  return { id, x: left ? p.rect[0] + p.rect[2] : p.rect[0], y: p.doorY }
}

// One floor of the hospital as an SVG plan, with the route drawn on it.
// The route is a thick line with arrows; the start and the destination are
// labelled with words, so nothing depends on colour alone.

function labelLines(text) {
  const s = String(text)
  if (s.length <= 13 || !s.includes(' ')) return [s]
  const words = s.split(' ')
  let best = [s]
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const diff = Math.abs(a.length - b.length)
    if (diff < bestDiff) {
      bestDiff = diff
      best = [a, b]
    }
  }
  return best
}

function PlaceShape({ p, t, highlight, via }) {
  const [x, y, w, h] = p.rect
  const lines = labelLines(t(`places.${p.id}.short`))
  const cls = `pl pl-${p.kind}${highlight ? ' pl-target' : via ? ' pl-via' : ''}`
  const lh = 13
  const top = p.y - ((lines.length - 1) * lh) / 2
  return (
    <g>
      {p.kind !== 'entrance' && <rect x={x} y={y} width={w} height={h} rx="5" className={cls} />}
      <text x={p.x} y={top} textAnchor="middle" dominantBaseline="middle" className={`pl-text${highlight ? ' pl-text-strong' : ''}`}>
        {lines.map((l, i) => (
          <tspan key={i} x={p.x} dy={i === 0 ? 0 : lh}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  )
}

export default function FloorPlan({ floor, route, from, to, t, compact = false }) {
  const titleId = useId()
  const arrowId = useId().replace(/:/g, '')
  const ps = places.filter((p) => p.floor === floor)
  const pts = route ? route.nodes.filter((id) => nodes[id].floor === floor).map(pointFor) : []
  const first = pts[0]
  const last = pts[pts.length - 1]
  const startHere = route ? route.from === first?.id : from && nodes[from]?.floor === floor
  const endHere = route ? route.to === last?.id : to && nodes[to]?.floor === floor
  // Lifts or stairs used to arrive on or leave this floor.
  const via = new Set([first && !startHere ? first.id : null, last && !endHere ? last.id : null].filter(Boolean))
  const nextId = route && last && !endHere ? route.nodes[route.nodes.indexOf(last.id) + 1] : null
  const leave = nextId
    ? t(placeById[last.id].kind === 'lift' ? 'dir.lift' : nodes[nextId].floor > floor ? 'dir.stairsUp' : 'dir.stairsDown', {
        floor: t(`floors.${nodes[nextId].floor}.ref`),
      })
    : ''
  const floorName = t(`floors.${floor}.name`)
  const desc = route
    ? t('map.routeDesc', { floor: floorName, from: t(`places.${route.from}.name`), to: t(`places.${route.to}.name`) })
    : t('map.plan', { floor: floorName })

  return (
    <figure className="w-full">
      {!compact && <figcaption className="mb-1.5 font-semibold">{floorName}</figcaption>}
      <svg
        viewBox={`0 0 ${PLAN.width} ${PLAN.height}`}
        className="mx-auto block h-auto w-full max-w-[420px]"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{desc}</title>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto">
            <path d="M0 0L10 5L0 10z" className="pl-arrow" />
          </marker>
        </defs>
        <rect x="4" y="6" width="252" height="460" rx="8" className="pl-building" />
        <rect x={PLAN.corridorLeft} y={PLAN.top} width={PLAN.corridorRight - PLAN.corridorLeft} height={PLAN.bottom - PLAN.top} className="pl-corridor" />
        {floor === 0 && (
          <g>
            <rect x={PLAN.corridorLeft} y="462" width={PLAN.corridorRight - PLAN.corridorLeft} height="8" className="pl-corridor" />
            {[466, 470, 474].map((y) => (
              <line key={y} x1={PLAN.corridorLeft + 2} x2={PLAN.corridorRight - 2} y1={y} y2={y} className="pl-steps" />
            ))}
          </g>
        )}
        {ps.map((p) => (
          <PlaceShape key={p.id} p={p} t={t} highlight={p.id === to} via={via.has(p.id)} />
        ))}

        {pts.length > 1 && (
          <g>
            <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="pl-route-casing" />
            <polyline
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              className="pl-route"
              markerMid={`url(#${arrowId})`}
              markerEnd={endHere ? undefined : `url(#${arrowId})`}
            />
          </g>
        )}

        {startHere && first && (
          <g>
            <circle cx={first.x} cy={first.y} r="9" className="pl-start-dot" />
            <circle cx={first.x} cy={first.y} r="3.5" className="pl-start-core" />
            <Tag x={first.x} y={first.y - 16} text={t('map.start')} />
          </g>
        )}
        {endHere && last && (
          <g>
            <path
              d={`M${last.x} ${last.y + 2}c-6-7-9-11-9-15a9 9 0 0 1 18 0c0 4-3 8-9 15z`}
              className="pl-pin"
              transform={`translate(0 -4)`}
            />
            <circle cx={last.x} cy={last.y - 17} r="3.2" className="pl-start-core" />
            <Tag x={last.x} y={last.y - 36} text={t('map.here')} strong />
          </g>
        )}
        {!route && to && nodes[to]?.floor === floor && (
          <Tag x={nodes[to].x} y={nodes[to].y - 22} text={t('map.here')} strong />
        )}
      </svg>
      {leave && (
        <p className="mt-1.5 flex items-center justify-center gap-2 font-semibold text-brand">
          <span aria-hidden="true">{nodes[nextId].floor > floor ? '↑' : '↓'}</span>
          {leave}
        </p>
      )}
    </figure>
  )
}

function Tag({ x, y, text, strong }) {
  const w = Math.max(36, String(text).length * 7.2 + 12)
  const cx = Math.min(Math.max(x, w / 2 + 2), PLAN.width - w / 2 - 2)
  return (
    <g>
      <rect x={cx - w / 2} y={y - 10} width={w} height="20" rx="10" className={strong ? 'pl-tag-strong' : 'pl-tag'} />
      <text x={cx} y={y + 0.5} textAnchor="middle" dominantBaseline="middle" className={strong ? 'pl-tag-text-strong' : 'pl-tag-text'}>
        {text}
      </text>
    </g>
  )
}
