// Local alerts for the forecast (shared by the server and the screens):
// what each one does to patient numbers, and which news headlines look like
// one. A headline only ever becomes a suggestion; staff decide.

import { departments } from '../data/departments.js'
import { DISEASE_EFFECT, TYPE_EFFECT, STRENGTH } from '../data/signals.js'

// One name per kind of event, for learning: 'outbreak:dengue', 'festival', …
export const kindOf = (s) => (s.type === 'outbreak' ? `outbreak:${s.disease}` : s.type)

export const covers = (s, key) => s.from <= key && key <= s.to

// Percent change in patients: { all, depts: { MED: 25 } }. What this hospital
// has learned for the kind replaces the starting value; staff set how strong.
export function effectFor(s, learned = null) {
  const k = STRENGTH[s.strength] ?? 1
  const scale = (e) => ({
    all: Math.round((e.all || 0) * k),
    depts: Object.fromEntries(Object.entries(e.depts || {}).map(([d, p]) => [d, Math.round(p * k)])),
  })
  if (s.effect) return s.effect // fixed by the server (the hospital's own numbers)
  const learnedKind = learned?.signals?.[kindOf(s)]
  if (learnedKind) return scale(learnedKind)
  if (s.type === 'outbreak') return scale({ all: 0, depts: DISEASE_EFFECT[s.disease] || {} })
  return scale({ all: TYPE_EFFECT[s.type] ?? 0, depts: {} })
}

// The effect on the day's total, with departments weighted by their share.
export function totalPct(effect, shares = null) {
  const sh = shares || Object.fromEntries(departments.map((d) => [d.id, d.sampleShare]))
  const deptPart = Object.entries(effect.depts || {}).reduce((a, [d, p]) => a + (sh[d] || 0) * p, 0)
  return Math.round(((1 + (effect.all || 0) / 100) * (1 + deptPart / 100) - 1) * 100)
}

// ---- News headlines --------------------------------------------------------
// Order matters: "eye flu" before "flu", "road closed" before "bandh".
const RULES = [
  ['outbreak', 'eyeFlu', ['conjunctivitis', 'eye flu', 'pink eye', 'आई फ्लू', 'कंजंक्टिवाइटिस', 'आंखों का संक्रमण']],
  ['outbreak', 'dengue', ['dengue', 'डेंगू']],
  ['outbreak', 'malaria', ['malaria', 'मलेरिया']],
  ['outbreak', 'stomach', ['diarrhoea', 'diarrhea', 'cholera', 'gastroenteritis', 'typhoid', 'food poisoning', 'डायरिया', 'हैजा', 'टाइफाइड', 'उल्टी-दस्त', 'फूड पॉइजनिंग']],
  ['outbreak', 'covid', ['covid', 'coronavirus', 'कोविड', 'कोरोना']],
  ['outbreak', 'flu', ['influenza', 'h1n1', 'h3n2', 'swine flu', 'viral fever', 'flu cases', 'वायरल बुखार', 'स्वाइन फ्लू', 'इन्फ्लूएंजा', 'वायरल फीवर']],
  ['outbreak', 'heat', ['heatstroke', 'heat stroke', 'लू लगने', 'हीट स्ट्रोक']],
  ['roads', null, ['waterlogging', 'water-logging', 'road closed', 'roads closed', 'traffic diversion', 'diversion', 'जलभराव', 'रास्ता बंद', 'डायवर्जन', 'रूट डायवर्ट']],
  ['strike', null, ['bandh', 'chakka jam', 'hartal', 'transport strike', 'auto strike', 'हड़ताल', 'भारत बंद', 'चक्का जाम']],
  ['camp', null, ['health camp', 'medical camp', 'vaccination drive', 'स्वास्थ्य शिविर', 'चिकित्सा शिविर', 'टीकाकरण अभियान']],
  ['festival', null, ['mela', 'kumbh', 'diwali', 'holi', 'eid', 'chhath', 'dussehra', 'navratri', 'kanwar', 'मेला', 'दिवाली', 'होली', 'ईद', 'छठ', 'दशहरा', 'नवरात्र', 'कांवड़']],
]

// A headline that sounds like a local event → { type, disease }, or null.
export function classifyHeadline(title) {
  const text = ` ${String(title || '').toLowerCase()} `
  for (const [type, disease, words] of RULES) {
    if (words.some((w) => text.includes(w))) return { type, disease }
  }
  return null
}

// Google News RSS → [{ title, link, publisher, publishedAt }]. Small and
// forgiving on purpose: a broken item is skipped, never thrown.
export function parseRss(xml) {
  const unescape = (s) =>
    String(s || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .trim()
  const tag = (item, name) => unescape(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1])
  const out = []
  for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1]
    const publisher = tag(item, 'source')
    let title = tag(item, 'title')
    // Google adds " - Publisher" to every title.
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3)
    const link = tag(item, 'link')
    const at = Date.parse(tag(item, 'pubDate'))
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, publisher, publishedAt: Number.isFinite(at) ? at : null })
  }
  return out
}
