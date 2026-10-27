// Read aloud (speech synthesis) and speak-instead-of-type (speech recognition).
// Both are built into the browser; nothing is downloaded.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
export const canSpeak = !!synth

const locale = (lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN')

function voiceFor(lang) {
  if (!synth) return null
  const voices = synth.getVoices()
  const want = locale(lang)
  return (
    voices.find((v) => v.lang === want) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(lang)) ||
    null
  )
}

// Speak one text. Resolves when finished (or stopped).
export function speak(text, lang = 'en', { rate = 0.9, interrupt = true } = {}) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve()
    if (interrupt) synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = locale(lang)
    const v = voiceFor(lang)
    if (v) u.voice = v
    u.rate = rate
    u.onend = () => resolve()
    u.onerror = () => resolve()
    synth.speak(u)
  })
}

// Speak several texts one after another, e.g. English then Hindi.
export async function speakAll(items, { onItem } = {}) {
  if (!synth) return
  synth.cancel()
  for (let i = 0; i < items.length; i++) {
    onItem?.(i)
    await speak(items[i].text, items[i].lang, { interrupt: false })
  }
}

export function stopSpeaking() {
  synth?.cancel()
}

// "MED-042" is read as "M E D 42" so it is clear in any voice.
export function spokenToken(token) {
  const [code, num] = String(token).split('-')
  return `${code.split('').join(' ')} ${Number(num)}`
}

// ---- Speech recognition -----------------------------------------------------

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
export const canListen = !!Recognition

export function listenOnce(lang = 'en') {
  return new Promise((resolve, reject) => {
    if (!Recognition) return reject(new Error('unsupported'))
    const r = new Recognition()
    r.lang = locale(lang)
    r.interimResults = false
    r.maxAlternatives = 1
    let done = false
    r.onresult = (e) => {
      done = true
      resolve(e.results[0][0].transcript)
    }
    r.onerror = (e) => {
      done = true
      reject(new Error(e.error || 'error'))
    }
    r.onend = () => {
      if (!done) reject(new Error('no-speech'))
    }
    r.start()
  })
}

// Turn Hindi digits into 0-9 and keep only digits.
export function digitsOnly(text) {
  const hiDigits = '०१२३४५६७८९'
  return String(text)
    .replace(/[०-९]/g, (c) => String(hiDigits.indexOf(c)))
    .replace(/\D/g, '')
}
