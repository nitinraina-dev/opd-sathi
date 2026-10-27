// The live hospital: state in memory (loaded from storage at start-up), every
// change run through the shared engine, saved, and streamed to all screens.
// Logged-in staff get everything; everyone else gets the queue without
// patients' names, ages or phone numbers.

import { initialState } from '../../client/src/lib/state.js'
import { runAction, diffState, dueRooms } from '../../client/src/lib/engine.js'
import { redactState, redactPatch, staffState, staffPatch } from '../../client/src/lib/permissions.js'

export async function createHospital(store, { notifier, push, stats }) {
  let state = await store.load()
  if (!state) {
    state = initialState()
    await store.save({ full: true, rev: state.rev }, state)
  }
  const clients = new Map() // response -> { full }
  const watchers = [] // (name, state, new messages) after every change (Telegram)
  let saving = Promise.resolve()

  function send(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  function act(name, args) {
    const before = structuredClone(state)
    const { result, events, full } = runAction(state, name, args)
    state.rev = before.rev + 1
    const patch = full ? { rev: state.rev, full: structuredClone(state) } : diffState(before, state)
    const snapshot = structuredClone(state)
    // Saves run one after another so the database never goes back in time.
    saving = saving.then(() => store.save(patch, snapshot)).catch((err) => console.error('Save failed:', err.message))

    const publicPatch = redactPatch(patch)
    const fullPatch = staffPatch(patch)
    for (const [res, c] of clients) send(res, 'patch', c.full ? fullPatch : publicPatch)

    notifier.postAll(events)
    const had = new Set(before.messages.map((m) => m.id))
    const fresh = (patch.messages || []).filter((m) => !had.has(m.id))
    if (fresh.length) push.onMessages(state, fresh)
    for (const fn of watchers) fn(name, state, fresh)
    // The forecast learns when people arrive: at registration, or at check-in for a booking.
    const arrived =
      (name === 'registerPatient' && result?.status !== 'booked') || (name === 'checkIn' && result && before.patients[args.pid]?.status === 'booked')
    if (arrived) stats.record(state, name === 'checkIn' ? state.patients[args.pid].dept : args.dept).catch((err) => console.warn('Stats:', err.message))
    return { result, patch: fullPatch, publicPatch }
  }

  // Demo doctors (when "Doctors call the next patient on their own" is on).
  const timer = setInterval(() => {
    if (state.autoRun && dueRooms(state).length) act('tick', {})
  }, 1000)
  timer.unref()

  return {
    // The real state, for the server's own use (has patients' keys).
    raw: () => state,
    // What a screen may see: staff without patients' keys; others, no personal details.
    getState: (full) => (full ? staffState(state) : redactState(state)),
    act,
    addClient(res, full) {
      clients.set(res, { full })
      send(res, 'state', { state: full ? staffState(state) : redactState(state), serverNow: Date.now() })
    },
    removeClient(res) {
      clients.delete(res)
    },
    clientCount: () => clients.size,
    onChange: (fn) => watchers.push(fn),
  }
}
