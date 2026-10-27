// City District Hospital: a made-up government hospital with three floors.
// Every floor is drawn on the same 260 x 490 portrait plan: rooms sit in a
// left and a right column with one corridor down the middle. Lifts and stairs
// are stacked at the top of the left column on every floor.
// Names, short map labels and landmarks live in src/i18n under places.<id>.

export const PLAN = {
  width: 260,
  height: 490,
  corridorX: 130,
  corridorLeft: 112,
  corridorRight: 148,
  top: 10,
  bottom: 462,
}

// One plan unit is about 1/6 of a metre, so the corridor is about 70 m long.
export const METRES_PER_UNIT = 1 / 6

export const floors = [0, 1, 2]

const L = 10 // left column x
const R = 150 // right column x
const W = 100 // column width

// kind:    what the place is (sets the icon and the map colour)
// door:    counts as a door when we say "the third door on your left"
// notable: worth mentioning when someone walks past it
// link:    'custom' means it is joined by the extra paths below, not to the corridor
const placeList = [
  // Ground floor
  { id: 'g_entrance', floor: 0, kind: 'entrance', rect: [95, 470, 70, 20], x: 130, y: 483, link: 'custom' },
  { id: 'g_lift', floor: 0, kind: 'lift', rect: [L, 15, W, 45] },
  { id: 'g_stairs', floor: 0, kind: 'stairs', rect: [L, 65, W, 45] },
  { id: 'g_xray', floor: 0, kind: 'xray', rect: [L, 115, W, 70], door: true },
  { id: 'g_toilets', floor: 0, kind: 'toilet', rect: [L, 190, W, 55], door: true },
  { id: 'g_water', floor: 0, kind: 'water', rect: [L, 250, W, 40], notable: true },
  { id: 'g_wheelchair', floor: 0, kind: 'wheelchair', rect: [L, 340, W, 50], notable: true },
  { id: 'g_ramp', floor: 0, kind: 'ramp', rect: [L, 395, W, 65] },
  { id: 'g_pharmacy', floor: 0, kind: 'pharmacy', rect: [R, 15, W, 70], door: true, notable: true },
  { id: 'g_lab', floor: 0, kind: 'lab', rect: [R, 90, W, 75], door: true },
  { id: 'g_reg', floor: 0, kind: 'registration', rect: [R, 170, W, 95], door: true, notable: true },
  { id: 'g_help', floor: 0, kind: 'help', rect: [R, 270, W, 60], notable: true },
  { id: 'g_emergency', floor: 0, kind: 'emergency', rect: [R, 335, W, 125], door: true, notable: true },

  // First floor
  { id: 'f1_lift', floor: 1, kind: 'lift', rect: [L, 15, W, 45] },
  { id: 'f1_stairs', floor: 1, kind: 'stairs', rect: [L, 65, W, 45] },
  { id: 'f1_waitA', floor: 1, kind: 'waiting', rect: [L, 115, W, 140], doorY: 185, notable: true },
  { id: 'f1_toilets', floor: 1, kind: 'toilet', rect: [L, 260, W, 50], door: true },
  { id: 'f1_opd7', floor: 1, kind: 'opd', rect: [L, 315, W, 70], door: true },
  { id: 'f1_opd8', floor: 1, kind: 'opd', rect: [L, 390, W, 70], door: true },
  { id: 'f1_opd1', floor: 1, kind: 'opd', rect: [R, 15, W, 70], door: true },
  { id: 'f1_opd2', floor: 1, kind: 'opd', rect: [R, 90, W, 70], door: true },
  { id: 'f1_opd3', floor: 1, kind: 'opd', rect: [R, 165, W, 70], door: true },
  { id: 'f1_opd4', floor: 1, kind: 'opd', rect: [R, 240, W, 70], door: true },
  { id: 'f1_opd5', floor: 1, kind: 'opd', rect: [R, 315, W, 70], door: true },
  { id: 'f1_opd6', floor: 1, kind: 'opd', rect: [R, 390, W, 70], door: true },

  // Second floor
  { id: 'f2_lift', floor: 2, kind: 'lift', rect: [L, 15, W, 45] },
  { id: 'f2_stairs', floor: 2, kind: 'stairs', rect: [L, 65, W, 45] },
  { id: 'f2_nurses', floor: 2, kind: 'nurses', rect: [L, 115, W, 80], notable: true },
  { id: 'f2_ward4', floor: 2, kind: 'ward', rect: [R, 15, W, 140], door: true },
  { id: 'f2_ward5', floor: 2, kind: 'ward', rect: [R, 160, W, 140], door: true },
  { id: 'f2_ward6', floor: 2, kind: 'ward', rect: [R, 305, W, 155], door: true },
]

export const places = placeList.map((p) => ({
  ...p,
  x: p.x ?? p.rect[0] + p.rect[2] / 2,
  y: p.y ?? p.rect[1] + p.rect[3] / 2,
  doorY: Math.round(p.doorY ?? p.rect[1] + p.rect[3] / 2),
  nameKey: `places.${p.id}.name`,
  landmarkKey: `places.${p.id}.landmark`,
}))

export const placeById = Object.fromEntries(places.map((p) => [p.id, p]))

// ---- The graph -------------------------------------------------------------
// Nodes are places plus corridor points (one opposite each door).
// Edges carry the walking distance in metres and whether they use stairs.

const extraCorridorPoints = { 0: [455], 1: [], 2: [] } // 455: inside the main entrance

export const nodes = {}
for (const p of places) nodes[p.id] = { id: p.id, type: 'place', floor: p.floor, x: p.x, y: p.y }

for (const f of floors) {
  const ys = new Set(extraCorridorPoints[f])
  for (const p of places) if (p.floor === f && p.link !== 'custom') ys.add(p.doorY)
  for (const y of ys) {
    const id = `c${f}_${y}`
    nodes[id] = { id, type: 'corridor', floor: f, x: PLAN.corridorX, y }
  }
}

export const edges = []
function link(a, b, m, extra = {}) {
  edges.push({ a, b, m, stairs: false, kind: 'walk', ...extra })
}

// Corridor: join neighbouring corridor points on each floor.
for (const f of floors) {
  const cs = Object.values(nodes)
    .filter((n) => n.type === 'corridor' && n.floor === f)
    .sort((u, v) => u.y - v.y)
  for (let i = 1; i < cs.length; i++) {
    link(cs[i - 1].id, cs[i].id, Math.max(1, Math.round((cs[i].y - cs[i - 1].y) * METRES_PER_UNIT)))
  }
}

// Doors: each place joins the corridor point opposite its door.
export const corridorOf = {}
export const placesAtCorridor = {}
for (const p of places) {
  if (p.link === 'custom') continue
  const c = `c${p.floor}_${p.doorY}`
  corridorOf[p.id] = c
  ;(placesAtCorridor[c] ||= []).push(p.id)
  link(p.id, c, 4)
}

// Lifts, stairs, the entrance steps and the ramp.
// A lift costs more than its length because you wait for it.
link('g_lift', 'f1_lift', 20, { kind: 'lift' })
link('f1_lift', 'f2_lift', 20, { kind: 'lift' })
link('g_stairs', 'f1_stairs', 15, { kind: 'stairs', stairs: true })
link('f1_stairs', 'f2_stairs', 15, { kind: 'stairs', stairs: true })
link('g_entrance', 'c0_455', 6, { kind: 'steps', stairs: true, upTo: 'c0_455' })
link('g_entrance', 'g_ramp', 12, { kind: 'ramp', upTo: 'g_ramp' })

// ---- Useful groups -----------------------------------------------------------

export const EMERGENCY = 'g_emergency'
export const DEFAULT_START = 'g_entrance'
export const HELP_POINTS = ['g_help', 'f2_nurses']

// Seats in each waiting area. Waiting hall A serves every OPD room; each
// department has a section of seats (see departments.js).
export const waitingAreas = [{ id: 'waitA', placeId: 'f1_waitA', seats: 40 }]

// Picker tiles on "Find a place". nearest: go to the closest one of these.
export const categories = [
  { id: 'toilets', icon: 'toilet', places: ['g_toilets', 'f1_toilets'], nearest: true },
  { id: 'water', icon: 'water', places: ['g_water'] },
  { id: 'opd', icon: 'doctor', places: ['f1_opd1', 'f1_opd2', 'f1_opd3', 'f1_opd4', 'f1_opd5', 'f1_opd6', 'f1_opd7', 'f1_opd8'], list: true },
  { id: 'pharmacy', icon: 'pill', places: ['g_pharmacy'] },
  { id: 'lab', icon: 'lab', places: ['g_lab'] },
  { id: 'xray', icon: 'xray', places: ['g_xray'] },
  { id: 'registration', icon: 'register', places: ['g_reg'] },
  { id: 'help', icon: 'info', places: ['g_help', 'f2_nurses'], nearest: true },
  { id: 'waiting', icon: 'chair', places: ['f1_waitA'] },
  { id: 'wards', icon: 'bed', places: ['f2_ward4', 'f2_ward5', 'f2_ward6'], list: true },
  { id: 'wheelchair', icon: 'wheelchair', places: ['g_wheelchair'] },
  { id: 'lift', icon: 'lift', places: ['g_lift', 'f1_lift', 'f2_lift'], nearest: true },
  { id: 'entrance', icon: 'door', places: ['g_entrance'] },
  { id: 'emergency', icon: 'emergency', places: ['g_emergency'] },
]

// Places people can say they are at ("I am at …"), in plan order.
export const startPlaces = places.filter((p) => !['g_stairs', 'f1_stairs', 'f2_stairs', 'g_ramp'].includes(p.id)).map((p) => p.id)
