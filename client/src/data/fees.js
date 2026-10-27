// Sample fees for City District Hospital (made up, in rupees). Many government
// hospitals charge a small OPD fee and give free care to some groups. Change
// these to match your hospital.

export const OPD_FEE = 10

// Tests a doctor can add after the consultation, and where they are done.
export const TESTS = [
  { id: 'cbc', fee: 50, placeId: 'g_lab' },
  { id: 'sugar', fee: 30, placeId: 'g_lab' },
  { id: 'urine', fee: 30, placeId: 'g_lab' },
  { id: 'lipid', fee: 150, placeId: 'g_lab' },
  { id: 'ecg', fee: 50, placeId: 'g_lab' },
  { id: 'xray', fee: 100, placeId: 'g_xray' },
]
export const testById = Object.fromEntries(TESTS.map((t) => [t.id, t]))

// Free without asking anything more (from the registration answers).
export const FREE_AUTO = { seniorAge: 60, childUnder: 5, depts: ['WMN'] }

// Free with a card that staff look at on the counter. We never ask for, or
// store, the card's number.
export const FREE_CARDS = ['bpl', 'pmjay', 'disability']

// Made-up UPI ID for the demo payment screen (no real account). Replace with
// the hospital's own UPI ID, or set Razorpay keys on the server.
export const UPI_PAYEE = { vpa: 'citydistricthospital@demo', name: 'City District Hospital' }
