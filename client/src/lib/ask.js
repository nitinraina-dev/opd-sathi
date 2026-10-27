// The "Ask" helper and SMS replies: questions about places, waiting, timings
// and fees, in Hindi, Hinglish or English. Shared by the server and the
// browser (offline mode):
//   - isEmergencyText: urgent words always get "go to Emergency now", before
//     anything else and without any AI.
//   - simpleAnswer: word matching that needs no internet and no AI key.
//   - hospitalFacts / liveFacts: what the AI answerer is told (server only).
// It never gives medical advice, and never says someone can wait.

import { places, placeById, EMERGENCY } from '../data/hospital.js'
import { departments, deptById, OPD_HOURS } from '../data/departments.js'
import { OPD_FEE, FREE_AUTO } from '../data/fees.js'
import { translate } from '../i18n/translate.js'
import { aheadOf, estimateWait, followMoves, findByToken, totalWaiting, waitingList, reportsState } from './queue.js'
import { SCORE_BY_DIGIT } from '../data/feedback.js'
import { roomsText, waitText } from './text.js'

const pad = (s) => ` ${String(s || '').toLowerCase().replace(/[?!.,;:।]/g, ' ').replace(/\s+/g, ' ')} `
// English words match whole words (or a plural); Hindi matches inside words,
// which carry endings ("दवाई", "दवाइयाँ").
const hasWord = (text, w) => (/[^\x00-\x7F]/.test(w) ? text.includes(w) : text.includes(` ${w} `) || text.includes(` ${w}s `))
const hasAny = (text, words) => words.some((w) => hasWord(text, w.toLowerCase()))

// Words that mean "this may be an emergency". A false alarm only shows the way
// to Emergency, so the list errs on the side of caution.
const URGENT = [
  'chest pain', 'heart attack', "can't breathe", 'cannot breathe', 'not breathing', 'breathless', 'unconscious', 'fainted', 'not waking',
  'bleeding', 'accident', 'stroke', 'seizure', 'convulsion', 'poison', 'snake bite', 'snakebite', 'burnt', 'burned', 'suicide', 'labour pain', 'labor pain',
  'seene me dard', 'seene mein dard', 'saans nahi', 'sans nahi', 'saans nahin', 'saans lene', 'behosh', 'khoon beh', 'khoon nikal', 'durghatna', 'dil ka daura',
  'jal gaya', 'jal gayi', 'zehar', 'saanp',
  'सीने में दर्द', 'छाती में दर्द', 'दिल का दौरा', 'सांस नहीं', 'साँस नहीं', 'सांस लेने में', 'साँस लेने में', 'बेहोश', 'खून बह', 'खून निकल', 'दुर्घटना', 'एक्सीडेंट',
  'दौरा पड़', 'जल गया', 'जल गई', 'ज़हर', 'जहर', 'सांप', 'साँप', 'प्रसव पीड़ा',
]
export const isEmergencyText = (q) => hasAny(pad(q), URGENT)

// Everyday words for each kind of place.
const PLACE_WORDS = {
  toilet: ['toilet', 'toilets', 'washroom', 'bathroom', 'latrine', 'loo', 'shauchalay', 'शौचालय', 'टॉयलेट', 'बाथरूम'],
  water: ['water', 'drinking water', 'pani', 'paani', 'पानी', 'पीने का पानी'],
  pharmacy: ['pharmacy', 'medicine', 'medicines', 'chemist', 'dawai', 'dawa', 'davai', 'दवा', 'दवाई', 'दवाइयाँ', 'फार्मेसी'],
  lab: ['lab', 'laboratory', 'blood test', 'jaanch', 'janch', 'khoon ki jaanch', 'जाँच', 'जांच', 'लैब', 'खून की जाँच'],
  xray: ['x-ray', 'xray', 'x ray', 'एक्स-रे', 'एक्सरे', 'एक्स रे'],
  registration: ['registration', 'register', 'counter', 'parchi', 'parchee', 'पर्ची', 'पंजीकरण', 'रजिस्ट्रेशन', 'काउंटर'],
  help: ['help desk', 'enquiry', 'inquiry', 'information desk', 'poochtach', 'सहायता केंद्र', 'पूछताछ'],
  emergency: ['emergency', 'casualty', 'इमरजेंसी', 'आपातकालीन', 'कैजुअल्टी'],
  lift: ['lift', 'elevator', 'लिफ्ट'],
  ramp: ['ramp', 'रैंप'],
  wheelchair: ['wheelchair', 'wheel chair', 'व्हीलचेयर'],
  entrance: ['entrance', 'exit', 'gate', 'main door', 'gate kahan', 'गेट', 'प्रवेश', 'बाहर जाने'],
  waiting: ['waiting hall', 'waiting room', 'waiting area', 'प्रतीक्षा', 'वेटिंग'],
  ward: ['ward', 'wards', 'वार्ड'],
  nurses: ['nurse', 'nurses', 'nurses station', 'नर्स'],
}
// Which department handles what (where to go, not medical advice).
const DEPT_WORDS = {
  MED: ['fever', 'cough', 'bp', 'blood pressure', 'sugar', 'diabetes', 'bukhar', 'khansi', 'general medicine', 'medicine doctor', 'बुखार', 'खांसी', 'खाँसी', 'शुगर', 'बीपी'],
  CHD: ['child', 'children', 'baby', 'kid', 'bachcha', 'bachche', 'bacche', 'बच्चा', 'बच्चे', 'बच्चों', 'शिशु'],
  WMN: ['pregnant', 'pregnancy', 'women', 'periods', 'lady doctor', 'garbh', 'mahila', 'गर्भ', 'महिला', 'पीरियड'],
  BON: ['bone', 'bones', 'joint', 'joints', 'back pain', 'fracture', 'knee', 'haddi', 'jodo', 'kamar', 'हड्डी', 'जोड़', 'कमर', 'घुटना', 'घुटने'],
  ENT: ['ear', 'nose', 'throat', 'hearing', 'kaan', 'naak', 'gala', 'कान', 'नाक', 'गला', 'गले'],
  EYE: ['eye', 'eyes', 'glasses', 'vision', 'aankh', 'ankh', 'chashma', 'आंख', 'आँख', 'आंखों', 'आँखों', 'चश्मा'],
  SKN: ['skin', 'rash', 'itch', 'itching', 'khujli', 'twacha', 'त्वचा', 'खुजली', 'दाने'],
}
const WAIT_WORDS = ['how long', 'wait', 'waiting time', 'my turn', 'my number', 'when will', 'kitni der', 'kitna time', 'kab aayega', 'kab aayegi', 'kab ayega', 'kab ayegi', 'baari', 'bari', 'number kab', 'कितनी देर', 'बारी', 'कब आएगी', 'कब आएगा', 'इंतज़ार', 'इंतजार', 'नंबर कब']
const HOURS_WORDS = ['timing', 'timings', 'open', 'close', 'closed', 'opening', 'closing', 'what time', 'kab khul', 'kab band', 'kitne baje', 'samay', 'sunday', 'ravivar', 'रविवार', 'समय', 'कब खुल', 'कब बंद', 'कितने बजे', 'टाइम']
const FEE_WORDS = ['fee', 'fees', 'cost', 'price', 'charge', 'charges', 'how much', 'paisa', 'paise', 'kitne paise', 'shulk', 'free', 'muft', 'फ़ीस', 'फीस', 'पैसे', 'शुल्क', 'मुफ़्त', 'मुफ्त', 'कितने पैसे']

// The place a question is about, by kind words or by the place's own name.
function bestPlace(text) {
  let best = null
  for (const p of places) {
    if (p.kind === 'stairs') continue
    const words = [...(PLACE_WORDS[p.kind] || []), translate('en', `places.${p.id}.name`), translate('hi', `places.${p.id}.name`)].map((w) =>
      String(w).toLowerCase(),
    )
    const hit = words.filter((w) => w && hasAny(text, [w])).reduce((a, w) => Math.max(a, w.length), 0)
    // Several places of a kind (toilets on each floor): the ground floor first.
    if (hit && (!best || hit > best.hit || (hit === best.hit && p.floor < best.place.floor))) best = { place: p, hit }
  }
  return best?.place || null
}
function bestDept(text) {
  let best = null
  for (const [id, words] of Object.entries(DEPT_WORDS)) {
    const hit = words.filter((w) => hasAny(text, [w])).reduce((a, w) => Math.max(a, w.length), 0)
    if (hit && (!best || hit > best.hit)) best = { id, hit }
  }
  return best?.id || null
}

// The patient's own line, in a sentence.
export function myStatusText(state, p, t, now) {
  p = followMoves(state, p)
  const d = deptById[p.dept]
  const floor = d ? t(`floors.${placeById[d.rooms[0].placeId].floor}.ref`) : ''
  if (p.status === 'waiting') {
    const ahead = aheadOf(state, p)
    return ahead === 0 ? t('ask.next', { token: p.token }) : t('ask.waitMine', { token: p.token, n: ahead, wait: waitText(estimateWait(state, p.dept, ahead, now), t) })
  }
  if (p.status === 'called') return t('ask.calledMine', { token: p.token, room: p.room, floor })
  if (p.status === 'done' && reportsState(p) === 'pending') return t('ask.testsMine', { token: p.token })
  if (p.status === 'done' && reportsState(p) === 'ready') return t('ask.reportsReadyMine', { token: p.token })
  return t(`ask.${p.status}Mine`, { token: p.token })
}

const reply = (answer, placeId = '', emergency = false) => ({ answer, placeId: placeId || '', emergency, source: 'simple' })

export function emergencyAnswer(lang) {
  return reply(translate(lang, 'ask.emergency'), EMERGENCY, true)
}

// Word matching: no internet, no AI. `me` is the asker's own record, if known.
export function simpleAnswer(state, question, lang, me = null, now = Date.now()) {
  const t = (k, v) => translate(lang, k, v)
  const text = pad(question)
  if (isEmergencyText(question)) return emergencyAnswer(lang)
  const dept = bestDept(text)
  if (hasAny(text, WAIT_WORDS)) {
    if (me) return reply(myStatusText(state, me, t, now))
    const d = dept || 'MED'
    return reply(
      t('ask.waitGeneral', {
        n: totalWaiting(state),
        dept: t(`depts.${d}.name`),
        wait: waitText(estimateWait(state, d, waitingList(state, d).length, now), t),
      }),
    )
  }
  if (hasAny(text, FEE_WORDS)) return reply(t('ask.fee', { fee: `₹${OPD_FEE}`, age: FREE_AUTO.seniorAge, child: FREE_AUTO.childUnder }), 'g_reg')
  if (hasAny(text, HOURS_WORDS)) return reply(t('ask.hours', { start: OPD_HOURS.start, end: OPD_HOURS.end }))
  const place = bestPlace(text)
  // "Eye doctor" is about a department, "eye drops" is the pharmacy: a department
  // wins over a place only when the place matched on a weaker word.
  if (dept && (!place || place.kind === 'opd')) {
    const room = deptById[dept].rooms[0]
    return reply(
      t('ask.dept', { dept: t(`depts.${dept}.name`), rooms: roomsText(dept, t), floor: t(`floors.${placeById[room.placeId].floor}.ref`) }),
      room.placeId,
    )
  }
  if (place) {
    return reply(
      t('ask.place', { place: t(`places.${place.id}.name`), floor: t(`floors.${place.floor}.name`), landmark: t(`places.${place.id}.landmark`) }),
      place.id,
    )
  }
  return reply(t('ask.unknown'), 'g_help')
}

// ---- What the AI answerer is told (server) ------------------------------------

// The hospital, in English with Hindi names. The same text every time, so it
// can be cached.
export function hospitalFacts() {
  const en = (k, v) => translate('en', k, v)
  const hi = (k, v) => translate('hi', k, v)
  const lines = ['PLACES (id | name | Hindi name | floor | how to recognise it):']
  for (const p of places) {
    if (p.kind === 'stairs') continue
    lines.push(`${p.id} | ${en(`places.${p.id}.name`)} | ${hi(`places.${p.id}.name`)} | ${en(`floors.${p.floor}.name`)} | ${en(`places.${p.id}.landmark`)}`)
  }
  lines.push('', 'OPD DEPARTMENTS (id | name | Hindi name | for | rooms | place id of the first room):')
  for (const d of departments) {
    lines.push(
      `${d.id} | ${en(`depts.${d.id}.name`)} | ${hi(`depts.${d.id}.name`)} | ${en(`depts.${d.id}.words`)} | ${d.rooms.map((r) => `Room ${r.room}`).join(', ')}, ${en(`floors.${placeById[d.rooms[0].placeId].floor}.name`)} | ${d.rooms[0].placeId}`,
    )
  }
  lines.push(
    '',
    `HOURS: registration 08:00-13:30, doctors ${OPD_HOURS.start}-${OPD_HOURS.end}, Monday to Saturday. Sunday: OPD closed. Emergency is open day and night, every day.`,
    `FEES: OPD fee ₹${OPD_FEE}, paid on the phone (UPI) or in cash at the registration counter. Free for people aged ${FREE_AUTO.seniorAge} or over, children under ${FREE_AUTO.childUnder} and pregnancy care, and with a BPL ration card, an Ayushman Bharat (PM-JAY) card or a disability certificate; staff check the age or card. Nobody is refused care for money.`,
    'JOINING THE LINE: register in the OPD Saathi app or at the registration counter to get a token. A booking made on a phone joins the line only on arrival: scan the code on the waiting-room screen (Waiting hall A, first floor) or show the slip at the registration counter. Patients can wait anywhere; the app tells them when their turn is close.',
    'EMERGENCY: ground floor, under the big red EMERGENCY sign. No token, no form and no payment before care. Any staff member will help at once.',
    'PM-JAY (Ayushman Bharat): pays for hospital stays (admission) for eligible families; the Arogya Mitra at the help desk helps with it.',
  )
  return lines.join('\n')
}

// Right now: how busy each department is, and the asker's own token (no names).
export function liveFacts(state, me, now) {
  const t = (k, v) => translate('en', k, v)
  const lines = [`NOW: ${new Date(now).toLocaleString('en-IN', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}. People waiting in all: ${totalWaiting(state)}.`]
  for (const d of departments) {
    const n = waitingList(state, d.id).length
    lines.push(`${t(`depts.${d.id}.name`)}: ${n} waiting; a new patient waits ${waitText(estimateWait(state, d.id, n, now), t)}.`)
  }
  if (me) lines.push(`THE ASKER'S OWN TOKEN: ${myStatusText(state, me, t, now)}`)
  return lines.join('\n')
}

// ---- SMS (any phone) ----------------------------------------------------------
// Commands: a token ("MED 12") → your place; WHERE/KAHAN + place → where it is;
// IN + screen code + token → join the line (from the phone number on the
// slip); 1, 2 or 3 (and a token) after the visit → how it was; anything
// else → how to use it. Urgent words → go to Emergency now.
export function parseSms(text) {
  const raw = String(text || '').trim()
  const upper = raw.toUpperCase()
  // Hindi script, or Hindi typed in English letters ("kahan dawai"): reply in Hindi.
  const lang = /[ऀ-ॿ]/.test(raw) || /\b(kahan|kaha|dawai|dawa|kitni|kitna|baari|bari|madad|kab|hai|meri|mera)\b/i.test(raw) ? 'hi' : 'en'
  const tokenMatch = upper.match(/\b([A-Z]{3})[\s-]?0*(\d{1,4})\b/)
  const token = tokenMatch ? `${tokenMatch[1]}-${tokenMatch[2].padStart(3, '0')}` : null
  if (isEmergencyText(raw)) return { cmd: 'emergency', lang }
  const code = upper.match(/\b(\d{6})\b/)?.[1] || null
  if (/^(IN|AAYA|AAYI|PAHUNCHA|पहुँचा|पहुंचा|आया|आई)\b/i.test(raw) && code && token) return { cmd: 'in', code, token, lang }
  if (/^(WHERE|KAHAN|KAHA|कहाँ|कहां)\b/i.test(raw)) return { cmd: 'where', query: raw.replace(/^\S+\s*/, ''), lang }
  // "1", "2 MED 12": the token is optional (the phone number on the slip finds the visit).
  const rate = upper.match(/^([123])(?:\s+([A-Z]{3})[\s-]?0*(\d{1,4}))?$/)
  if (rate) return { cmd: 'rate', score: SCORE_BY_DIGIT[rate[1]], token: rate[2] ? `${rate[2]}-${rate[3].padStart(3, '0')}` : null, lang }
  if (token && departments.some((d) => d.code === tokenMatch[1])) return { cmd: 'status', token, lang }
  return { cmd: 'help', lang }
}

// `rated`: for a 1/2/3 reply, whether the feedback was taken.
export function smsText(state, msg, { now = Date.now(), lang = msg.lang, rated = false } = {}) {
  const t = (k, v) => translate(lang, k, v)
  const p = msg.token ? findByToken(state, msg.token) : null
  const say = (s) => `${t('app.name')}: ${s}`
  switch (msg.cmd) {
    case 'emergency':
      return say(t('ask.emergency'))
    case 'where':
      return say(simpleAnswer(state, msg.query, lang, null, now).answer)
    case 'status':
    case 'in':
      return p && p.kind !== 'emergency' ? say(myStatusText(state, p, t, now)) : say(t('sms.notFound', { token: msg.token }))
    case 'rate':
      return say(t(rated ? 'sms.rateThanks' : 'sms.rateNone'))
    default:
      return say(t('sms.help'))
  }
}
