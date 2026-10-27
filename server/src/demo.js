// One click before a demo (admin): a fresh, believable day that shows every
// part of OPD Saathi, so nothing is set up by hand in front of an audience.
//   POST /api/demo/setup
// Everything is made up: sample patients without phone numbers, sample
// history, sample PM-JAY claims, an alert, and two Emergency visits.

import crypto from 'node:crypto'
import { Router } from 'express'

export function createDemo({ hospital, stats, claims, signals, audit, auth }) {
  const router = Router()

  router.post('/demo/setup', auth.requireRole('demo'), async (req, res) => {
    const act = (name, args = {}) => hospital.act(name, args).result
    act('resetAll')
    act('setArrival', { on: true })
    act('setShareLoad', { on: true })
    act('setEmergencyFee', { amount: 50 })
    // Four weeks of history: the forecast learns, and a recent rise in fever
    // patients raises the early warning.
    await stats.loadSample(hospital.raw())
    // Earlier this morning: visits already seen (the waits we told them and
    // the real ones, some feedback, one patient at the tests).
    act('addSampleVisits', { n: 10 })
    // A busy morning: people in every line.
    act('addSamplePatients', { n: 24 })
    // Two people who booked on their phones and are not here yet.
    for (const [name, nameHi, age, gender, dept] of [
      ['Ravi', 'रवि', 40, 'm', 'EYE'],
      ['Geeta', 'गीता', 66, 'f', 'MED'],
    ])
      act('registerPatient', { name, nameHi, age, gender, dept, lang: 'hi', via: 'app', payChoice: 'counter', secret: crypto.randomBytes(16).toString('hex') })
    // Emergency: one visit paid after care, one still to settle.
    const paid = act('recordEmergency', { name: 'Unknown', lang: 'hi' })
    act('payBill', { pid: paid.id, method: 'cash' })
    act('recordEmergency', { name: 'Imran', age: 34, gender: 'm', lang: 'hi' })
    // A local alert from the district, and PM-JAY claims at every stage.
    await signals.endStaffAlerts()
    await signals.addAlert({ type: 'outbreak', disease: 'dengue', title: 'District health office: dengue cases rising in the city', strength: 'medium' }, req.staff)
    await claims.addSamples(req.staff)
    audit.log(req.staff, 'demoSetup', {})
    res.json({ ok: true })
  })

  return { router }
}
