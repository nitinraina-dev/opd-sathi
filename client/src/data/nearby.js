// MADE-UP nearby public hospitals for the demo: the names, places, distances
// and waits are not real. A district would feed each hospital's real numbers
// (from its own OPD Saathi, or a state dashboard) through n8n instead.
// Names are in src/i18n under nearby.<id>.
//
// km / roadMins: from this hospital. busy: how crowded its OPD usually gets
// (0-1). phase: shifts its rush a little, so the hospitals differ.

export const NEARBY = [
  { id: 'riverside', km: 4, roadMins: 15, depts: ['MED', 'CHD', 'WMN', 'EYE'], busy: 0.45, phase: 1 },
  { id: 'northblock', km: 7, roadMins: 25, depts: ['MED', 'BON', 'ENT', 'SKN', 'EYE'], busy: 0.75, phase: 0 },
  { id: 'sector5', km: 2.5, roadMins: 10, depts: ['MED', 'CHD', 'SKN'], busy: 0.35, phase: 2 },
]
