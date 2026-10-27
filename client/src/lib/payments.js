// Paying a bill from the patient's phone.
//   demo: a dummy UPI screen ("I have paid" is simulated; no money moves)
//   test / live: Razorpay checkout with the hospital's keys (set by an admin)
// In offline mode there is no server, so only the demo works.

import { API, CREDENTIALS, isServer, whenReady } from './store.js'
import { api } from './auth.js'
import { upiLink } from './billing.js'
import { UPI_PAYEE } from '../data/fees.js'
import { payBillLocal } from './actions.js'

export async function paymentConfig() {
  await whenReady()
  if (!isServer()) return { mode: 'demo', upi: UPI_PAYEE }
  try {
    return await (await fetch(`${API}/api/pay/config`, { credentials: CREDENTIALS })).json()
  } catch {
    return { mode: 'demo', upi: UPI_PAYEE }
  }
}

export async function startPayment(p, secret, due) {
  await whenReady()
  if (!isServer()) return { mode: 'demo', local: true, payId: 'local', amount: due, token: p.token, upi: upiLink(due, p.token), payee: UPI_PAYEE }
  return api('/pay/start', { pid: p.id, secret })
}

export async function confirmPayment(p, secret, intent, extra = {}) {
  if (intent.local) return payBillLocal(p.id, intent.payId)
  return api('/pay/confirm', { pid: p.id, secret, payId: intent.payId, ...extra })
}

let rzpScript = null
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve()
  rzpScript ||= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = resolve
    s.onerror = () => {
      rzpScript = null
      reject(new Error('The payment page could not load'))
    }
    document.head.appendChild(s)
  })
  return rzpScript
}

// Opens Razorpay's checkout (UPI, cards, net banking). Resolves with the
// result to confirm, or null if the patient closed it.
export async function razorpayCheckout(intent, { title, description, lang }) {
  await loadRazorpay()
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: intent.keyId,
      order_id: intent.orderId,
      amount: intent.amount * 100,
      currency: 'INR',
      name: title,
      description,
      theme: { color: '#0a5c68' },
      config: lang === 'hi' ? { display: { language: 'hi' } } : undefined,
      handler: (resp) => resolve(resp),
      modal: { ondismiss: () => resolve(null) },
    })
    rzp.open()
  })
}
