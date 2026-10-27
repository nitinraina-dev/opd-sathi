// "Set up the demo": a fresh, believable day in one click. On the server it
// also loads sample history, a local alert and PM-JAY claims; offline it does
// what the browser can (patients, bookings, Emergency visits).

import { isServer } from './store.js'
import { api } from './auth.js'
import { resetAll, setArrival, setEmergencyFee, setShareLoad, addSamplePatients, addSampleVisits, registerPatient, recordEmergency } from './actions.js'

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
  await setEmergencyFee(50)
  await addSampleVisits(10)
  await addSamplePatients(24)
  for (const [name, nameHi, age, gender, dept] of [
    ['Ravi', 'रवि', 40, 'm', 'EYE'],
    ['Geeta', 'गीता', 66, 'f', 'MED'],
  ])
    await registerPatient({ name, nameHi, age, gender, dept, lang: 'hi', via: 'app', payChoice: 'counter' })
  await recordEmergency({ name: 'Imran', age: 34, gender: 'm', lang: 'hi' })
}
