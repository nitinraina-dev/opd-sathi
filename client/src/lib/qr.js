import qrcode from 'qrcode-generator'

// QR code as a grid of modules, so it can be drawn as SVG or on a canvas.
export function qrMatrix(text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return { n, isDark: (r, c) => qr.isDark(r, c) }
}

export function qrPath(text) {
  const { n, isDark } = qrMatrix(text)
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  }
  return { n, d }
}

export function turnUrl(token) {
  return `${window.location.origin}/turn/${token}`
}
