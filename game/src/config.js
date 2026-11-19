// Neon Bay — one place for every tuning number, story beat and landmark.
// Nothing in the game hard-codes a speed, reward or mission position;
// change it here and the whole game follows.

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
  playerSpeed: 9, // sprint speed, units / second
  playerWalkSpeed: 4.5,
  playerHealth: 100,

  // Driving.
  carAccel: 22,
  carBrake: 34,
  carMaxSpeed: 38, // ~137 km/h on the speedometer
  carMaxReverse: 12,
  carTurn: 1.9, // steering, radians / second at full lock

  // Crowds and pressure.
  trafficCount: 12,
  pedestrianCount: 26,
  maxPoliceCars: 4,
  maxPoliceFoot: 4,
  wantedDecaySeconds: 22, // quiet seconds before one star drops

  // Combat.
  pistolDamage: 34,
  pistolAmmo: 12, // rounds per magazine
  pistolRange: 90,
  punchDamage: 20,
  enemyHealth: 100,
  enemyDamage: 8, // damage per enemy bullet that lands

  // Money.
  bustedFine: 120,
  wastedFine: 150,
  cashBundleValue: 25,
  cashBundleCount: 12,
  missionRewards: [150, 300, 500],

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
      'Marla needs a driver she can trust. Borrow a car — any car — and bring it to the paint shop on Coral Row.',
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      {
        type: 'goto',
        pos: [120, 0, -40],
        radius: 6,
        drive: true,
        text: 'Drive the car to the paint shop on Coral Row',
      },
    ],
    outro: 'Clean plates, clean conscience. Marla pays $150.',
  },
  {
    id: 'm2',
    title: 'The Bayfront Drop',
    giver: 'Marla Voss',
    intro:
      'A package is waiting at Pier 9. Grab it, then deliver it to the club on Sunset Strip. The harbour patrol is watching — expect heat.',
    steps: [
      { type: 'pickup', pos: [-160, 0, 160], radius: 5, text: 'Pick up the package at Pier 9' },
      {
        type: 'deliver',
        pos: [160, 0, 120],
        radius: 6,
        text: 'Deliver the package to the club (police are on your tail!)',
      },
    ],
    outro: 'Delivered, no questions asked. Marla pays $300.',
  },
  {
    id: 'm3',
    title: 'Dockyard Debt',
    giver: 'Marla Voss',
    intro:
      'The Kestrel crew skimmed Marla’s cut at the dockyard. Go to the docks, settle the debt, and come back in one piece.',
    steps: [
      { type: 'goto', pos: [-120, 0, 120], radius: 8, text: 'Reach the dockyard' },
      { type: 'eliminate', count: 6, text: 'Deal with the Kestrel crew (6 remaining)' },
      { type: 'return', pos: [40, 0, -120], radius: 6, text: 'Return to Marla at the Voss office' },
    ],
    outro: 'The docks are quiet again. Marla pays $500. Neon Bay is yours now, Rook.',
  },
];

// ---------------------------------------------------------------------------
// Free-roam cash bundles and named places
// ---------------------------------------------------------------------------

// Green cash-bundle pickup spots scattered around the city ($25 each).
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
  { name: 'Neon Plaza', pos: [0, 0] },
];
