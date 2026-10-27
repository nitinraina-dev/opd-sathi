// Draws the OPD slip on a canvas and saves it as a PNG image.
// All text arrives already translated, so the image matches the screen.

import { qrMatrix } from './qr.js'

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

export function drawSlip({ hospital, title, tokenLabel, token, rows, qrText, qrCaption, note }) {
  const W = 720
  const PAD = 48
  const font = 'system-ui, "Noto Sans", "Noto Sans Devanagari", sans-serif'
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // Measure first so the canvas is exactly as tall as it needs to be.
  const layout = []
  let y = PAD
  const add = (text, size, weight = 400, color = '#16181a', gap = 8) => {
    ctx.font = `${weight} ${size}px ${font}`
    for (const l of wrap(ctx, text, W - PAD * 2)) {
      y += size
      layout.push({ text: l, size, weight, color, y })
      y += gap
    }
  }
  add(hospital, 30, 700)
  add(title, 26, 400, '#474a4d', 20)
  add(tokenLabel, 24, 400, '#474a4d')
  add(token, 104, 800, '#0a5c68', 24)
  for (const [label, value] of rows) {
    add(label, 22, 400, '#474a4d', 2)
    add(value, 32, 700, '#16181a', 18)
  }
  const qrSize = 280
  const qrTop = y + 10
  y = qrTop + qrSize + 10
  add(qrCaption, 22, 400, '#474a4d', 14)
  add(note, 20, 400, '#474a4d')
  const H = y + PAD

  canvas.width = W
  canvas.height = H
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#16181a'
  ctx.lineWidth = 4
  ctx.strokeRect(12, 12, W - 24, H - 24)
  ctx.textBaseline = 'alphabetic'
  for (const l of layout) {
    ctx.font = `${l.weight} ${l.size}px ${font}`
    ctx.fillStyle = l.color
    ctx.fillText(l.text, PAD, l.y)
  }

  const { n, isDark } = qrMatrix(qrText)
  const cell = Math.floor(qrSize / (n + 8))
  const x0 = Math.round((W - cell * n) / 2)
  const y0 = qrTop + Math.round((qrSize - cell * n) / 2)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (isDark(r, c)) ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell)
  return canvas
}

export function saveSlipImage(data, fileName) {
  const canvas = drawSlip(data)
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }, 'image/png')
}
