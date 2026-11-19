// Neon Bay — central tuning and world constants.
// Every system reads its numbers from here so the whole game can be
// rebalanced in one place. All distances are in metres, all speeds in
// metres per second, all money in Neon Bay dollars.
export const CONFIG = {
  title: 'Neon Bay',
  version: '1.0.0',
  saveKey: 'neonbay-save-v1',
  saveVersion: 1,

  // The city is a square, 240 m across, centred on the plaza fountain.
  cityHalf: 120,
  roadHalf: 4.5,
  // Avenue centre lines. Buildings live strictly inside the blocks
  // between these lines, never on an intersection.
  avenues: [-90, -45, 0, 45, 90],
  blockMargin: 5,

  player: {
    walkSpeed: 6,
    runSpeed: 10,
    jumpSpeed: 7.5,
    radius: 0.55,
    height: 1.8,
    maxHealth: 100,
    startCash: 250,
  },

  car: {
    accel: 22,
    brake: 34,
    reverseAccel: 12,
    maxSpeed: 38,
    maxReverse: 10,
    turnRate: 1.9,
    drag: 0.6,
    radius: 1.6,
  },

  traffic: {
    count: 14,
    countLowFx: 6,
    speed: 9,
    spacing: 26,
  },

  pedestrians: {
    count: 26,
    countLowFx: 10,
    walkSpeed: 1.6,
  },

  police: {
    maxCruisers: 4,
    chaseSpeed: 30,
    ramDistance: 3.2,
    bustDistance: 4.5,
    bustTime: 4,
    finePerStar: 120,
    heatDecaySeconds: 14,
  },

  combat: {
    pistolDamage: 34,
    pistolRange: 55,
    pistolCooldown: 0.28,
    maxAmmo: 12,
  },

  economy: {
    missionReward: [600, 900, 1200],
    fenceBase: 350,
    fencePerCarValue: 1,
    pickupCash: 75,
    pickupHealth: 35,
  },

  // Five districts, each a rectangle with its own palette and flavour.
  districts: [
    { name: 'Lumen Square', x: -45, z: -45, w: 90, h: 90, tint: 0xff5fd0, blurb: 'Neon plaza and fountain' },
    { name: 'Vesper Quay', x: 45, z: -90, w: 75, h: 90, tint: 0x37c8ff, blurb: 'Docks and warehouses' },
    { name: 'Coral Row', x: -120, z: 0, w: 75, h: 120, tint: 0xff7a4d, blurb: 'Bars, motels and bright signs' },
    { name: 'Palmetto Heights', x: -45, z: 45, w: 90, h: 75, tint: 0x7dff8a, blurb: 'Palm-lined residential streets' },
    { name: 'Foundry District', x: 45, z: 45, w: 75, h: 75, tint: 0xffc94d, blurb: 'Factories, cranes and the fence' },
  ],

  // Named places the missions and the HUD point at.
  places: {
    fountain: { x: 0, z: 0, label: 'Lumen Fountain' },
    coralDrop: { x: -96, z: 22, label: 'Coral Row Motel' },
    palmettoHideout: { x: -22, z: 96, label: 'Palmetto Hideout' },
    dockOffice: { x: 96, z: -67, label: 'Dock Office' },
    fenceLot: { x: 82, z: 82, label: 'Foundry Fence' },
    garage: { x: -22, z: -22, label: 'Mara\u2019s Garage' },
  },

  colours: {
    sky: 0x1b2a4a,
    dusk: 0xff8c5a,
    ground: 0x2b2f38,
    road: 0x1d2026,
    sidewalk: 0x3a3f4a,
    water: 0x0e4d6b,
  },
};

// Which district contains a point, for the HUD location readout.
export function districtAt(x, z) {
  for (const d of CONFIG.districts) {
    if (x >= d.x - d.w / 2 && x <= d.x + d.w / 2 && z >= d.z - d.h / 2 && z <= d.z + d.h / 2) return d;
  }
  return CONFIG.districts[0];
}

// Wanted stars earned by each kind of crime, shared by combat,
// vehicles (car theft) and pedestrians (hitting a walker).
export const CRIME_HEAT = { shoot: 1, stealCar: 1, hitPedestrian: 1, ramCop: 2 };


// The three story missions, in the order the player meets them.
export const MISSIONS = [
  {
    id: 'first-light',
    title: 'First Light',
    giver: 'Mara Voss',
    intro: 'Mara needs a package moved before sunrise. Pick it up at the Lumen Fountain, then run it to the Coral Row Motel. Keep it quiet.',
    pickupLabel: 'Pick up the package at Lumen Fountain',
    deliverLabel: 'Deliver the package to the Coral Row Motel',
    doneLine: 'Clean run. Mara pays in full and remembers who showed up.',
  },
  {
    id: 'hot-pursuit',
    title: 'Hot Pursuit',
    giver: 'Deke Rollins',
    intro: 'Deke set off every alarm in Vesper Quay. The heat is on you now — lose the cruisers and reach the Palmetto Hideout before they box you in.',
    pickupLabel: 'Escape the police and reach Palmetto Heights',
    deliverLabel: 'Reach the Palmetto Hideout',
    doneLine: 'You vanished into the palms. Deke owes you one, and he pays his debts.',
  },
  {
    id: 'dockside-debt',
    title: 'Dockside Debt',
    giver: 'Captain Ilya Sorren',
    intro: 'A dock foreman skipped out on what he owes the Captain. Collect the debt at the Vesper Quay dock office, then bring it back to the Foundry.',
    pickupLabel: 'Collect the debt at the Dock Office',
    deliverLabel: 'Return the money to the Foundry fence lot',
    doneLine: 'The Captain counts it twice and nods. Debt settled, reputation earned.',
  },
];
