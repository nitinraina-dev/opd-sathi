// What screens call to change the hospital state. In server (MERN) mode the
// action is sent to the Express API; in local mode it runs here with the same
// engine. Every action returns a Promise.

import { update, getState, isServer, serverAction, whenReady } from './store.js'
import { runAction, dueRooms } from './engine.js'
import { postEvent } from './n8n.js'

async function dispatch(name, args = {}) {
  await whenReady()
  if (isServer()) {
    try {
      return await serverAction(name, args)
    } catch (err) {
      // Staff screens show this (for example "Please log in").
      window.dispatchEvent(new CustomEvent('opd-action-error', { detail: { name, message: err.message, status: err.status } }))
      throw err
    }
  }
  let out = null
  update((s) => {
    out = runAction(s, name, args)
  })
  for (const e of out.events) postEvent(e.type, e.data)
  return out.result
}

// These two return a result the screen needs, so their errors reach the caller.
export const registerPatient = (data) => dispatch('registerPatient', data)
export const raiseFlag = (flag) => dispatch('raiseFlag', flag)
// Staff at the counter (server), or the patient in the offline demo.
export const checkIn = (pid) => dispatch('checkIn', { pid })
// The Emergency desk, after care has started.
export const recordEmergency = (data) => dispatch('recordEmergency', data)
// Offline demo only: "how was your visit?" (on a server it goes through /api/feedback).
export const giveFeedbackLocal = (pid, score, reasons) => dispatch('giveFeedback', { pid, score, reasons, via: 'app' })
// Offline demo only: visits from earlier this morning (the server's demo setup adds them itself).
export const addSampleVisits = (n = 10) => dispatch('addSampleVisits', { n })

// Button actions: an error is shown by the staff screen, not thrown.
const quiet = (p) => p.catch(() => null)
export const callNext = (room) => quiet(dispatch('callNext', { room }))
export const markNoShow = (room) => quiet(dispatch('markNoShow', { room }))
export const sendToEnd = (pid) => quiet(dispatch('sendToEnd', { pid }))
export const movePatient = (pid, dept) => quiet(dispatch('movePatient', { pid, dept }))
export const setRoomStatus = (room, patch) => quiet(dispatch('setRoomStatus', { room, patch }))
export const markFlagSeen = (id) => quiet(dispatch('markFlagSeen', { id }))
export const reportsReady = (pid) => quiet(dispatch('reportsReady', { pid }))
export const addSamplePatients = (n = 20) => quiet(dispatch('addSamplePatients', { n }))
export const setSpeed = (speed) => quiet(dispatch('setSpeed', { speed }))
export const setAutoRun = (on) => quiet(dispatch('setAutoRun', { on }))
export const setArrival = (on) => quiet(dispatch('setArrival', { on }))
export const setEmergencyFee = (amount) => quiet(dispatch('setEmergencyFee', { amount }))
export const setShareLoad = (on) => quiet(dispatch('setShareLoad', { on }))
export const resetAll = () => quiet(dispatch('resetAll'))

// Payments and bills.
export const payCash = (pid) => quiet(dispatch('payBill', { pid, method: 'cash' }))
export const decideWaiver = (pid, approve) => quiet(dispatch('decideWaiver', { pid, approve }))
export const addCharges = (pid, tests) => quiet(dispatch('addCharges', { pid, tests }))
export const refundItem = (pid, itemId) => quiet(dispatch('refundItem', { pid, itemId }))
// Offline demo only: the patient's "I have paid" (online payments go through the server).
export const payBillLocal = (pid, ref) => dispatch('payBill', { pid, method: 'upi', mode: 'demo', ref: `DEMO-${ref}` })

// Local mode only: the demo doctors. (On a server, the server runs them.)
export function simTick() {
  if (isServer()) return
  const s = getState()
  if (s.autoRun && dueRooms(s).length) quiet(dispatch('tick'))
}
