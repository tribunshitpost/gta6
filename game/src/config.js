// Neon Bay — every tuning number, story beat and landmark in one place.
// The rest of the game reads its speeds, rewards and mission positions
// from here, so a single edit here retunes the whole game. Revision pass:
// quicker getaways, snappier police cooldown, fatter payouts, and the
// street names below were renamed to their final in-world names.

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
export const CONFIG = {
  title: 'Neon Bay',

  // World layout.
  cityHalf: 200, // playable area is x, z in [-200, 200]
  roadSpacing: 40, // distance between parallel roads
  roadWidth: 12,
  blockSize: 28, // building-block footprint (roadSpacing - roadWidth)

  // The player on foot.
  playerSpeed: 9.5, // sprint speed, units / second
  playerWalkSpeed: 4.8,
  playerHealth: 100,

  // Driving.
  carAccel: 24,
  carBrake: 36,
  carMaxSpeed: 41, // ~148 km/h on the speedometer
  carMaxReverse: 13,
  carTurn: 2.0, // steering, radians / second at full lock

  // Crowds and pressure.
  trafficCount: 14,
  pedestrianCount: 30,
  maxPoliceCars: 5,
  maxPoliceFoot: 5,
  wantedDecaySeconds: 18, // quiet seconds before one star drops

  // Combat.
  pistolDamage: 38,
  pistolAmmo: 14, // rounds per magazine
  pistolRange: 95,
  punchDamage: 22,
  enemyHealth: 90,
  enemyDamage: 7, // damage per enemy bullet that lands

  // Money.
  bustedFine: 100,
  wastedFine: 125,
  cashBundleValue: 30,
  cashBundleCount: 12,
  missionRewards: [175, 325, 550],

  // Persistence.
  saveKey: 'neon-bay-save-v1',
};

// ---------------------------------------------------------------------------
// Story missions
// ---------------------------------------------------------------------------
//
// A mission is a list of steps. A step is one of:
//   "steal"     — get into any traffic car
//   "goto"      — reach a marker (drive: true means the player must be in a car)
//   "pickup"    — walk into a marker
//   "deliver"   — reach a marker (used for the drop-off leg)
//   "eliminate" — defeat `count` rivals
//   "return"    — reach the fixer's office
// Markers are world positions [x, 0, z] with a completion radius.
export const MISSIONS = [
  {
    id: 'm1',
    title: 'Borrowed Wheels',
    giver: 'Marla Voss',
    intro:
      'Marla needs a wheelman she can trust, and she needs one tonight. Lift a car — any car on the street — and run it to the paint shop on Coral Avenue so it comes back clean.',
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      {
        type: 'goto',
        pos: [120, 0, -40],
        radius: 6,
        drive: true,
        text: 'Drive the car to the paint shop on Coral Avenue',
      },
    ],
    outro: 'Fresh paint, fresh plates, no questions. Marla pays $175.',
  },
  {
    id: 'm2',
    title: 'The Bayfront Drop',
    giver: 'Marla Voss',
    intro:
      'A package is sitting unguarded at Pier 9, and the harbour patrol is already sniffing around it. Grab the package, then run it to the Sunset Club on Sunset Boulevard before the heat catches up.',
    steps: [
      { type: 'pickup', pos: [-160, 0, 160], radius: 5, text: 'Pick up the package at Pier 9' },
      {
        type: 'deliver',
        pos: [160, 0, 120],
        radius: 6,
        text: 'Deliver the package to the club (police are on your tail!)',
      },
    ],
    outro: 'Delivered, no names exchanged. Marla pays $325.',
  },
  {
    id: 'm3',
    title: 'Dockside Debt',
    giver: 'Marla Voss',
    intro:
      'The Kestrel crew skimmed Marla’s cut at the docks and laughed about it. Go down to the dockyard, settle the debt in person, and come back in one piece.',
    steps: [
      { type: 'goto', pos: [-120, 0, 120], radius: 8, text: 'Reach the dockyard' },
      { type: 'eliminate', count: 5, text: 'Deal with the Kestrel crew (5 remaining)' },
      { type: 'return', pos: [40, 0, -120], radius: 6, text: 'Return to Marla at the Voss office' },
    ],
    outro: 'The docks are quiet again. Marla pays $550. Neon Bay is yours now, Rook.',
  },
];

// ---------------------------------------------------------------------------
// Free-roam cash bundles and named places
// ---------------------------------------------------------------------------

// Green cash-bundle pickup spots scattered around the city ($30 each).
export const CASH_SPOTS = [
  [-180, -180],
  [-60, -180],
  [60, -180],
  [180, -180],
  [-180, -60],
  [180, -60],
  [-180, 60],
  [180, 60],
  [-60, 180],
  [60, 180],
  [-140, 20],
  [140, -100],
];

// Named places shown in mission text and on the minimap.
export const PLACES = [
  { name: 'Pier 9', pos: [-160, 160] },
  { name: 'Voss Office', pos: [40, -120] },
  { name: 'Paint Shop', pos: [120, -40] },
  { name: 'Sunset Club', pos: [160, 120] },
  { name: 'Dockyard', pos: [-120, 120] },
  { name: 'Neon Square', pos: [0, 0] },
];
