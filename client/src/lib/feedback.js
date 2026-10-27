// "How was your visit?" from the patient's phone: to the server with the
// patient's own key, or straight into the offline demo.

import { isServer, whenReady } from './store.js'
import { api } from './auth.js'
import { giveFeedbackLocal } from './actions.js'

export async function sendFeedback(p, secret, score, reasons) {
  await whenReady()
  if (!isServer()) return giveFeedbackLocal(p.id, score, reasons)
  return api('/feedback', { pid: p.id, secret, score, reasons })
}
