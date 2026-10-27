import { useId, useState } from 'react'
import { Button } from './ui.jsx'

// A single-series column chart in SVG, with a hover/focus tooltip and a
// table view. data: [{ label, value, sub?, tip? }]
function niceMax(v) {
  if (v <= 5) return 5
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * p
}

export default function ColumnChart({ data, title, valueLabel, unit = '', highlight = -1, highlightLabel, t, height = 240 }) {
  const [hover, setHover] = useState(null)
  const [table, setTable] = useState(false)
  const id = useId()
  // The SVG scales to its box; 480 units keeps labels readable on a phone.
  const W = 480
  const H = height
  const padL = 40
  const padR = 10
  const padT = 26
  const padB = 58
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)))
  const plotH = H - padT - padB
  const band = (W - padL - padR) / data.length
  const barW = Math.min(36, band * 0.55)
  const y = (v) => padT + plotH - (v / max) * plotH
  const peak = data.reduce((a, d, i) => (d.value > (data[a]?.value ?? -1) ? i : a), 0)
  const fmt = (v) => `${Math.round(v)}${unit}`

  return (
    <figure className="max-w-2xl space-y-2">
      <figcaption id={`${id}-t`} className="text-xl font-bold">
        {title}
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-t`}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} className={f === 0 ? 'ch-base' : 'ch-grid'} />
              <text x={padL - 8} y={y(max * f)} textAnchor="end" dominantBaseline="middle" className="ch-tick">
                {Math.round(max * f)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = padL + band * i + band / 2
            const top = y(d.value)
            const h = padT + plotH - top
            const r = Math.min(4, h)
            const x = cx - barW / 2
            const showValue = i === highlight || i === peak
            return (
              <g key={i}>
                {h > 0.5 && (
                  <path
                    d={`M${x} ${top + h}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + barW - r}Q${x + barW} ${top} ${x + barW} ${top + r}V${top + h}Z`}
                    className={i === highlight ? 'ch-bar-hi' : 'ch-bar'}
                    opacity={hover == null || hover === i ? 1 : 0.55}
                  />
                )}
                {showValue && (
                  <text x={cx} y={top - 7} textAnchor="middle" className="ch-value">
                    {fmt(d.value)}
                  </text>
                )}
                <text x={cx} y={H - padB + 22} textAnchor="middle" className="ch-label">
                  {d.label}
                </text>
                {d.sub && (
                  <text x={cx} y={H - padB + 42} textAnchor="middle" className="ch-sub">
                    {d.sub}
                  </text>
                )}
                <rect
                  x={padL + band * i}
                  y={padT}
                  width={band}
                  height={plotH + padB}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${d.label}${d.sub ? ` (${d.sub})` : ''}: ${fmt(d.value)} ${valueLabel}${d.tip ? `. ${d.tip}` : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="ch-hit"
                />
              </g>
            )
          })}
        </svg>
        {hover != null && data[hover] && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border-2 border-line bg-card px-3 py-2 text-base shadow-lg"
            style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%` }}
          >
            <p className="font-bold">{data[hover].label}</p>
            <p>
              {fmt(data[hover].value)} {valueLabel}
            </p>
            {data[hover].tip && <p className="text-ink-2">{data[hover].tip}</p>}
          </div>
        )}
      </div>
      {highlight >= 0 && highlightLabel && <p className="text-base text-ink-2">{highlightLabel}</p>}
      <Button variant="ghost" icon="chart" onClick={() => setTable(!table)} aria-expanded={table} className="text-base">
        {table ? t('common.hideTable') : t('common.showTable')}
      </Button>
      {table && (
        <table className="w-full text-left text-base">
          <thead>
            <tr className="border-b-2 border-line">
              <th className="py-1 pr-2">{t('forecast.when')}</th>
              <th className="py-1 pr-2">{valueLabel}</th>
              <th className="py-1">{t('forecast.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-1 pr-2">
                  {d.label}
                  {d.sub ? ` · ${d.sub}` : ''}
                </td>
                <td className="py-1 pr-2 tabular-nums">{fmt(d.value)}</td>
                <td className="py-1">{d.tip || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}
