// Who did what, and when. Every staff action, login and account change is
// written down; patients' own actions (registering, asking for help) too,
// as "public". Only admins can read it. No names or phone numbers are kept,
// only tokens, rooms and places.

export function createAudit(store) {
  return {
    log(staff, action, detail = {}) {
      store
        .addAudit({
          at: Date.now(),
          actor: staff?.username || 'public',
          role: staff?.role || 'public',
          action,
          detail,
        })
        .catch((err) => console.warn('Audit log:', err.message))
    },
    list: (opts) => store.getAudit(opts),
    actors: () => store.auditActors(),
  }
}

// A short, privacy-safe record of one hospital action.
export function actionDetail(name, args, result, before) {
  switch (name) {
    case 'registerPatient':
      return { token: result?.token, dept: args.dept, via: args.via }
    case 'callNext':
    case 'markNoShow':
      return { room: args.room, token: result || null }
    case 'sendToEnd':
      return { token: result || before.patients[args.pid]?.token || null }
    case 'movePatient':
      return { token: before.patients[args.pid]?.token || null, newToken: result || null, dept: args.dept }
    case 'setRoomStatus':
      return { room: args.room, ...args.patch }
    case 'raiseFlag':
      return { where: args.where || '' }
    case 'markFlagSeen':
      return { where: before.flags.find((f) => f.id === args.id)?.where || '' }
    case 'addSamplePatients':
      return { n: args.n }
    case 'setSpeed':
      return { speed: args.speed }
    case 'setAutoRun':
    case 'setArrival':
    case 'setShareLoad':
      return { on: args.on }
    case 'recordEmergency':
      return { token: result?.token || null, amount: result?.bill?.[0]?.amount || 0, free: result?.bill?.[0]?.status === 'waived' }
    case 'setEmergencyFee':
      return { amount: args.amount, when: args.when || before.emergencyPay || 'after' }
    case 'printSlips':
    case 'slipsToRoom':
      return { tokens: args.pids.map((pid) => before.patients[pid]?.token).filter(Boolean), n: result || 0 }
    case 'setSlipMode':
      return { mode: args.mode }
    case 'checkIn':
      return { token: result || before.patients[args.pid]?.token || null, via: 'counter' }
    case 'reportsReady':
      return { token: result || before.patients[args.pid]?.token || null }
    case 'payBill':
      return { token: before.patients[args.pid]?.token || null, amount: result?.amount || 0, method: args.method, receipt: result?.receipt || null }
    case 'decideWaiver':
      return { token: before.patients[args.pid]?.token || null, approve: args.approve, card: before.patients[args.pid]?.waiver?.card || '' }
    case 'addCharges':
      return { token: before.patients[args.pid]?.token || null, tests: args.tests, amount: result || 0 }
    case 'refundItem':
      return { token: before.patients[args.pid]?.token || null, amount: result || 0 }
    default:
      return {}
  }
}
