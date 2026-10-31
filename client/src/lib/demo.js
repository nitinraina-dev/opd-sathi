// "Set up the demo": a fresh, believable day in one click. On the server it
// also loads sample history, a local alert and PM-JAY claims; offline it does
// what the browser can (patients, bookings, paper slips, Emergency visits).

import { isServer } from './store.js'
import { api } from './auth.js'
import {
  resetAll,
  setArrival,
  setEmergencyFee,
  setShareLoad,
  setSlipMode,
  addSamplePatients,
  addSampleVisits,
  registerPatient,
  recordEmergency,
  payBillLocal,
  printSlips,
  slipsToRoom,
} from './actions.js'

export async function setupDemo() {
  if (isServer()) {
    await api('/demo/setup', {})
    window.dispatchEvent(new Event('opd-learned'))
    window.dispatchEvent(new Event('opd-signals'))
    return
  }
  await resetAll()
  await setArrival(true)
  await setShareLoad(true)
  await setEmergencyFee(20, 'before')
  await setSlipMode('counter')
  await addSampleVisits(10)
  await addSamplePatients(24)
  for (const [name, nameHi, age, gender, dept] of [
    ['Ravi', 'रवि', 40, 'm', 'EYE'],
    ['Geeta', 'गीता', 66, 'f', 'MED'],
  ])
    await registerPatient({ name, nameHi, age, gender, dept, lang: 'hi', via: 'app', payChoice: 'counter' })
  const phone = []
  for (const [name, nameHi, age, gender, dept] of [
    ['Sunil', 'सुनील', 52, 'm', 'MED'],
    ['Pooja', 'पूजा', 29, 'f', 'ENT'],
    ['Asha', 'आशा', 45, 'f', 'MED'],
    ['Mohan', 'मोहन', 38, 'm', 'BON'],
  ])
    phone.push(await registerPatient({ name, nameHi, age, gender, dept, lang: 'hi', via: 'app', here: true, payChoice: 'upi' }))
  await payBillLocal(phone[0].id, 'SAMPLE')
  await printSlips([phone[2].id, phone[3].id])
  await slipsToRoom([phone[2].id])
  await recordEmergency({ name: 'Imran', age: 34, gender: 'm', lang: 'hi' })
}
