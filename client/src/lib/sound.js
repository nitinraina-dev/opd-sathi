// Small chimes made with the Web Audio API (no sound files to download).
// Browsers only allow sound after the person has tapped the page once.

let ctx = null

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

export function unlockAudio() {
  const c = getCtx()
  if (c && c.state === 'suspended') c.resume()
}

export function audioReady() {
  return !!ctx && ctx.state === 'running'
}

function tone(c, freq, start, dur, type = 'sine', gain = 0.25) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gain, start + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, start + dur)
  o.connect(g).connect(c.destination)
  o.start(start)
  o.stop(start + dur + 0.05)
}

const PATTERNS = {
  near: [
    [660, 0, 0.35],
    [880, 0.4, 0.5],
  ],
  called: [
    [523, 0, 0.3],
    [659, 0.3, 0.3],
    [784, 0.6, 0.6],
  ],
  alarm: [
    [880, 0, 0.25, 'square', 0.15],
    [660, 0.3, 0.25, 'square', 0.15],
    [880, 0.6, 0.25, 'square', 0.15],
    [660, 0.9, 0.25, 'square', 0.15],
  ],
  ding: [[740, 0, 0.6]],
}

export function chime(kind = 'ding') {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume()
  const t0 = c.currentTime + 0.05
  for (const [f, at, dur, type, gain] of PATTERNS[kind] || PATTERNS.ding) tone(c, f, t0 + at, dur, type, gain)
}

export function vibrate(pattern = [300, 150, 300]) {
  // Phones only allow vibration after the person has tapped the page.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not all phones allow it.
  }
}
