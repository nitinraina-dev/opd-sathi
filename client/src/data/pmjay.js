// PM-JAY (Ayushman Bharat) for the sample hospital. PM-JAY pays empanelled
// hospitals for in-patient care by "package": one fixed amount for a
// treatment, covering the stay, tests and medicines from 3 days before
// admission to 15 days after discharge.
//
// The packages, codes and rates below are MADE UP for the demo. A real
// hospital uses its state's official package list (HBP) and rates.
// Package names are in src/i18n under pmjay.packages.<id>.

export const PACKAGES = [
  { id: 'fever', code: 'DEMO-MED-01', rate: 9000, dept: 'MED', ward: 'f2_ward4' },
  { id: 'pneumonia', code: 'DEMO-MED-02', rate: 15000, dept: 'MED', ward: 'f2_ward4' },
  { id: 'diarrhoea', code: 'DEMO-CHD-01', rate: 8000, dept: 'CHD', ward: 'f2_ward6' },
  { id: 'childPneumonia', code: 'DEMO-CHD-02', rate: 12000, dept: 'CHD', ward: 'f2_ward6' },
  { id: 'delivery', code: 'DEMO-WMN-01', rate: 9000, dept: 'WMN', ward: 'f2_ward5' },
  { id: 'caesarean', code: 'DEMO-WMN-02', rate: 15000, dept: 'WMN', ward: 'f2_ward5' },
  { id: 'fracture', code: 'DEMO-BON-01', rate: 25000, dept: 'BON', ward: 'f2_ward5' },
  { id: 'tonsils', code: 'DEMO-ENT-01', rate: 12000, dept: 'ENT', ward: 'f2_ward5' },
  { id: 'cataract', code: 'DEMO-EYE-01', rate: 10000, dept: 'EYE', ward: 'f2_ward5' },
  { id: 'cellulitis', code: 'DEMO-SKN-01', rate: 8000, dept: 'SKN', ward: 'f2_ward4' },
]
export const packageById = Object.fromEntries(PACKAGES.map((p) => [p.id, p]))

export const WARDS = ['f2_ward4', 'f2_ward5', 'f2_ward6']

// Papers the claim usually needs, ticked off by staff once they are in the
// PM-JAY portal. OPD Saathi keeps only the ticks, never the papers.
export const DOCS = ['photoIn', 'notes', 'reports', 'photoOut', 'summary']
