// Neon Bay — vehicles: the player car, traffic and parked cars.
// Traffic drives rectangular loops around the avenues — never through
// intersections at an angle — so the loop can never deadlock or crash
// into a building. Cars are built from boxes: a body, a cabin, wheels
// and headlights, in one Group per car.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dist2D, makeRng, pick, range, resolveAllColliders, turnToward } from './util.js';

const CAR_COLOURS = [0xd83838, 0x38a8d8, 0xd8c838, 0x7a7a8a, 0x38d878, 0xd87ab8, 0x3848d8, 0xe8e8e8];
export const CAR_MODELS = [
  { name: 'Comet Coupe', value: 420, top: 40 },
  { name: 'Bayline Sedan', value: 300, top: 36 },
  { name: 'Quay Van', value: 260, top: 30 },
  { name: 'Palmetto Cruiser', value: 520, top: 38 },
  { name: 'Foundry Pickup', value: 380, top: 34 },
];

export function makeCarMesh(model, colour) {
  const car = new THREE.Group();
  car.name = 'car-' + model.name.replace(/\s+/g, '-').toLowerCase();
  const paint = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x182838, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 4.4), paint);
  body.position.y = 0.65;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), glass);
  cabin.position.set(0, 1.3, -0.2);
  cabin.castShadow = true;
  car.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  for (const [wx, wz] of [[-1.05, 1.4], [1.05, 1.4], [-1.05, -1.4], [1.05, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    car.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b8 });
  for (const lx of [-0.7, 0.7]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    light.position.set(lx, 0.7, 2.22);
    car.add(light);
  }
  car.userData.model = model;
  return car;
}

// Rectangular traffic loops: inset rectangles around the plaza, one per
// ring, so cars circulate without ever choosing a turn at an intersection.
export function trafficLoops() {
  const loops = [];
  for (const inset of [22, 48, 68, 92]) {
    loops.push({ min: -inset, max: inset });
  }
  return loops;
}

export class Traffic {
  constructor(scene, seed, lowFx) {
    this.scene = scene;
    this.cars = [];
    this.loops = trafficLoops();
    const rng = makeRng(seed + 101);
    const count = lowFx ? CONFIG.traffic.countLowFx : CONFIG.traffic.count;
    for (let i = 0; i < count; i++) {
      const loop = this.loops[i % this.loops.length];
      const model = pick(rng, CAR_MODELS);
      const mesh = makeCarMesh(model, pick(rng, CAR_COLOURS));
      mesh.position.set(range(rng, loop.min, loop.max), 0, loop.min);
      scene.add(mesh);
      // Perimeter position: 0..1 around the rectangle, plus a phase.
      this.cars.push({
        mesh,
        loop,
        t: rng(),
        speed: CONFIG.traffic.speed * range(rng, 0.8, 1.15),
        model,
        colour: mesh.children[0].material.color.getHex(),
      });
    }
  }

  // Advance one car along its rectangle; corners turn smoothly.
  _perimeterPoint(loop, t) {
    const w = loop.max - loop.min;
    const d = loop.max - loop.min;
    const per = 2 * (w + d);
    let s = ((t % 1) + 1) % 1 * per;
    if (s < w) return { x: loop.min + s, z: loop.min, heading: Math.PI / 2 };
    s -= w;
    if (s < d) return { x: loop.max, z: loop.min + s, heading: Math.PI };
    s -= d;
    if (s < w) return { x: loop.max - s, z: loop.max, heading: -Math.PI / 2 };
    s -= w;
    return { x: loop.min, z: loop.max - s, heading: 0 };
  }

  update(dt) {
    for (const car of this.cars) {
      const per = 2 * ((car.loop.max - car.loop.min) * 2);
      car.t += (car.speed * dt) / per;
      const p = this._perimeterPoint(car.loop, car.t);
      car.mesh.position.x = p.x;
      car.mesh.position.z = p.z;
      car.mesh.rotation.y = turnToward(car.mesh.rotation.y, p.heading, dt * 3);
    }
  }

  // Nearest traffic car to a point, for collision nudges.
  nearest(x, z) {
    let best = null;
    let bd = Infinity;
    for (const car of this.cars) {
      const d = dist2D(x, z, car.mesh.position.x, car.mesh.position.z);
      if (d < bd) { bd = d; best = car; }
    }
    return { car: best, dist: bd };
  }
}

// --- Parked cars the player can steal, and the player car itself. ---
export class ParkedCars {
  constructor(scene, spots, seed) {
    this.scene = scene;
    this.cars = [];
    const rng = makeRng(seed + 202);
    for (const spot of spots) {
      const model = pick(rng, CAR_MODELS);
      const mesh = makeCarMesh(model, pick(rng, CAR_COLOURS));
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = spot.rot;
      scene.add(mesh);
      this.cars.push({ mesh, model, taken: false, x: spot.x, z: spot.z });
    }
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const car of this.cars) {
      if (car.taken) continue;
      const d = dist2D(x, z, car.x, car.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  remove(car) {
    car.taken = true;
    this.scene.remove(car.mesh);
  }
}

// Is the player car parked inside the fence lot? The lot is a flat
// rectangle, so a plain distance check is all the fence needs.
export function inFenceLot(x, z) {
  const f = CONFIG.places.fenceLot;
  return Math.abs(x - f.x) <= 8 && Math.abs(z - f.z) <= 6;
}

// The fence pays the car's model value plus a base fee. The branch is
// deliberately simple: no car, no sale — never an error path.
export function fencePrice(model) {
  if (!model) return 0;
  return CONFIG.economy.fenceBase + model.value;
}

export class PlayerCar {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.model = null;
    this.speed = 0;
    this.heading = 0;
    this.pos = { x: 0, z: 0 };
    this.active = false;
  }

  enter(mesh, model, x, z, heading) {
    this.mesh = mesh;
    this.model = model;
    this.pos.x = x;
    this.pos.z = z;
    this.heading = heading;
    this.speed = 0;
    this.active = true;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  // Returns the mesh so the caller can park it again on exit.
  exit() {
    this.active = false;
    this.speed = 0;
    const mesh = this.mesh;
    this.mesh = null;
    return mesh;
  }

  update(dt, input, colliders, traffic, onCrash) {
    if (!this.active || !this.mesh) return;
    const cfg = CONFIG.car;
    // moveY is -1 for W and +1 for S, so forward flips its sign.
    const forward = -input.moveY;
    const steer = input.moveX;
    if (forward > 0) this.speed += cfg.accel * dt;
    else if (forward < 0) this.speed -= (this.speed > 0.5 ? cfg.brake : cfg.reverseAccel) * dt;
    else this.speed -= Math.sign(this.speed) * cfg.drag * 6 * dt;
    if (Math.abs(this.speed) < 0.15 && forward === 0) this.speed = 0;
    const top = this.model ? this.model.top : cfg.maxSpeed;
    this.speed = clamp(this.speed, -cfg.maxReverse, top);
    const dir = this.speed >= 0 ? 1 : -1;
    // D turns the nose to the driver's right: heading decreases.
    this.heading -= steer * cfg.turnRate * dt * dir * clamp(Math.abs(this.speed) / 8, 0, 1);
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const trial = { x: nx, z: nz };
    const hitWalls = resolveAllColliders(trial, cfg.radius, colliders) > 0;
    if (hitWalls && Math.abs(this.speed) > 12 && onCrash) onCrash();
    if (hitWalls) this.speed *= 0.4;
    // Soft bump against traffic instead of a hard stop.
    const near = traffic.nearest(trial.x, trial.z);
    if (near.car && near.dist < 3.4) {
      this.speed *= 0.5;
      if (Math.abs(this.speed) > 10 && onCrash) onCrash();
    }
    this.pos.x = clamp(trial.x, -CONFIG.cityHalf + 2, CONFIG.cityHalf - 2);
    this.pos.z = clamp(trial.z, -CONFIG.cityHalf + 2, CONFIG.cityHalf - 2);
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    // Body roll and pitch sell the speed.
    this.mesh.rotation.z = -steer * 0.03 * clamp(Math.abs(this.speed) / 20, 0, 1);
  }
}
