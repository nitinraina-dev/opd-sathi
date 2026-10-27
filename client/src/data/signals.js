// Local events that make the OPD busier or quieter for a while. The effects
// are MADE-UP starting values (percent more or fewer patients). The forecast
// learns this hospital's own effect for each kind from its history
// (learnFromHistory in lib/predict.js), so they matter less over time.
// Names are in src/i18n under signals.type / signals.disease.

export const SIGNAL_TYPES = ['outbreak', 'festival', 'strike', 'roads', 'camp', 'busier', 'quieter']

// Illnesses that fill an OPD in waves, and which departments feel them.
export const DISEASE_EFFECT = {
  dengue: { MED: 25, CHD: 20 },
  malaria: { MED: 15, CHD: 10 },
  flu: { MED: 20, CHD: 20, ENT: 10 },
  stomach: { MED: 15, CHD: 20 },
  eyeFlu: { EYE: 60 },
  covid: { MED: 15, ENT: 10 },
  heat: { MED: 15, CHD: 10 },
}
export const DISEASES = Object.keys(DISEASE_EFFECT)

// Everyone: fewer people travel on festival or bandh days, or when roads are
// closed; a health camp brings more.
export const TYPE_EFFECT = { festival: -20, strike: -30, roads: -10, camp: 20, busier: 15, quieter: -15 }

export const STRENGTH = { small: 0.5, medium: 1, large: 1.5 }

// How long a new alert lasts unless staff change it.
export const DEFAULT_DAYS = { outbreak: 14, festival: 1, strike: 1, roads: 3, camp: 1, busier: 3, quieter: 1 }

export const TYPE_ICON = { outbreak: 'lab', festival: 'calendar', strike: 'alert', roads: 'car', camp: 'users', busier: 'plus', quieter: 'minus' }
