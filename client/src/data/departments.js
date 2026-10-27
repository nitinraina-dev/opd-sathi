// OPD departments of the sample hospital. Department names and the plain-word
// descriptions are in src/i18n under depts.<id>. Doctors are made up.
//
// avgConsultMins: sample average time a doctor spends with one patient. The app
//                 starts from this and then uses the last 10 real consultations.
// seats:          this department's share of seats in Waiting hall A (40 in all)
// sampleShare:    share of a normal day's OPD patients (used by the forecast)

export const OPD_HOURS = { start: '09:00', end: '14:00' }

export const departments = [
  {
    id: 'MED',
    code: 'MED',
    icon: 'fever',
    rooms: [
      { room: 1, placeId: 'f1_opd1', doctor: { en: 'Dr. Sunita Verma', hi: 'डॉ. सुनीता वर्मा' } },
      { room: 2, placeId: 'f1_opd2', doctor: { en: 'Dr. Arvind Rao', hi: 'डॉ. अरविंद राव' } },
    ],
    hours: OPD_HOURS,
    avgConsultMins: 6,
    seats: 12,
    sampleShare: 0.34,
  },
  {
    id: 'CHD',
    code: 'CHD',
    icon: 'child',
    rooms: [{ room: 3, placeId: 'f1_opd3', doctor: { en: 'Dr. Meena Joshi', hi: 'डॉ. मीना जोशी' } }],
    hours: OPD_HOURS,
    avgConsultMins: 7,
    seats: 6,
    sampleShare: 0.14,
  },
  {
    id: 'WMN',
    code: 'WMN',
    icon: 'pregnant',
    rooms: [{ room: 4, placeId: 'f1_opd4', doctor: { en: 'Dr. Farah Khan', hi: 'डॉ. फ़राह ख़ान' } }],
    hours: OPD_HOURS,
    avgConsultMins: 8,
    seats: 6,
    sampleShare: 0.14,
  },
  {
    id: 'BON',
    code: 'BON',
    icon: 'bone',
    rooms: [{ room: 5, placeId: 'f1_opd5', doctor: { en: 'Dr. Rajesh Kulkarni', hi: 'डॉ. राजेश कुलकर्णी' } }],
    hours: OPD_HOURS,
    avgConsultMins: 7,
    seats: 5,
    sampleShare: 0.11,
  },
  {
    id: 'ENT',
    code: 'ENT',
    icon: 'ear',
    rooms: [{ room: 6, placeId: 'f1_opd6', doctor: { en: 'Dr. Harpreet Gill', hi: 'डॉ. हरप्रीत गिल' } }],
    hours: OPD_HOURS,
    avgConsultMins: 6,
    seats: 4,
    sampleShare: 0.08,
  },
  {
    id: 'EYE',
    code: 'EYE',
    icon: 'eye',
    rooms: [{ room: 7, placeId: 'f1_opd7', doctor: { en: 'Dr. Anjali Nair', hi: 'डॉ. अंजलि नायर' } }],
    hours: OPD_HOURS,
    avgConsultMins: 5,
    seats: 4,
    sampleShare: 0.11,
  },
  {
    id: 'SKN',
    code: 'SKN',
    icon: 'hand',
    rooms: [{ room: 8, placeId: 'f1_opd8', doctor: { en: 'Dr. Vikram Singh', hi: 'डॉ. विक्रम सिंह' } }],
    hours: OPD_HOURS,
    avgConsultMins: 5,
    seats: 3,
    sampleShare: 0.08,
  },
]

export const deptById = Object.fromEntries(departments.map((d) => [d.id, d]))

export const roomToDept = {}
export const roomPlace = {}
for (const d of departments) {
  for (const r of d.rooms) {
    roomToDept[r.room] = d.id
    roomPlace[r.room] = r.placeId
  }
}

export const allRooms = departments.flatMap((d) => d.rooms.map((r) => ({ ...r, dept: d.id })))
