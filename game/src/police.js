// The wanted system and the police who enforce it.
// Stars rise with crime and fall when the player stays quiet and unseen.
// Police cars chase and ram the player's car; foot cops chase the player
// on foot and try to bust them. Getting busted or wasted costs money.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dist2D, turnToward } from './util.js';
import { Car } from './vehicles.js';
import { buildPersonMesh } from './pedestrians.js';

const POLICE_CAR_COLOR = 0x1a1a1a;
const COP_SHIRT = 0x1a2a6b;
const COP_PANTS = 0x14181f;
const BUST_HOLD_SECONDS = 1.4; // a cop must stay this close to bust the player
const SPAWN_INTERVAL = 3; // seconds between police spawn attempts
const SIGHT_RANGE = 55; // within this, the player counts as "seen"

/** The star rating: how wanted the player is, and how fast it cools off. */
export class WantedSystem {
  constructor() {
    this.stars = 0;
    this.quietTimer = 0;
    this.heat = 0; // 0..1, how "seen" the player is right now
  }

  addStars(n, reason) {
    this.stars = clamp(this.stars + n, 0, 5);
    this.quietTimer = 0;
    return this.stars;
  }

  clear() {
    this.stars = 0;
    this.quietTimer = 0;
    this.heat = 0;
  }

  /**
   * One step. `seen` = any police unit is close by; `committedCrime`
   * restarts the quiet clock. A star drops after a full quiet stretch.
   */
  update(dt, seen, committedCrime) {
    if (committedCrime) this.quietTimer = 0;
    if (this.stars === 0) return;
    if (!seen && !committedCrime) {
      this.quietTimer += dt;
      if (this.quietTimer > CONFIG.wantedDecaySeconds) {
        this.stars -= 1;
        this.quietTimer = 0;
      }
    } else {
      this.quietTimer = 0;
    }
  }
}

/** A police car: a black car with a light bar that chases its target. */
export class PoliceCar extends Car {
  constructor(scene, x, z) {
    super(scene, x, z, 0, POLICE_CAR_COLOR, { police: true });
    this.ramCooldown = 0;
    this.lightPhase = 0;
  }

  /** Chase the target point; returns the distance to it. */
  updateChase(dt, city, tx, tz, playerSpeed) {
    const d = dist2D(this.x, this.z, tx, tz);
    const want = Math.atan2(tx - this.x, tz - this.z);
    this.heading = turnToward(this.heading, want, 2.2 * dt);
    // Close the gap fast, then match the player's speed up close.
    const targetSpeed = d > 6 ? Math.min(30, playerSpeed + 9) : 12;
    this.speed += clamp(targetSpeed - this.speed, -20 * dt, 12 * dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    [this.x, this.z] = city.resolveCollisions(this.x, this.z, 2.2);
    this.ramCooldown -= dt;
    this.lightPhase += dt * 6;
    this.sync();
    return d;
  }
}

/** A foot cop: chases on foot and busts the player if it stays adjacent. */
class FootCop {
  constructor(scene, x, z) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.heading = 0;
    this.speed = 7.2;
    this.bustTimer = 0;
    this.walkPhase = Math.random() * 6;
    const mesh = buildPersonMesh(COP_SHIRT, COP_PANTS, 0xd9a066);
    this.group = mesh.group;
    this.legL = mesh.legL;
    this.legR = mesh.legR;
    // Cop cap.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.16, 0.46),
      new THREE.MeshLambertMaterial({ color: 0x0e1a3a }),
    );
    cap.position.y = 2.02;
    this.group.add(cap);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  /** Chase the target; returns the distance to it. */
  update(dt, city, tx, tz) {
    const d = dist2D(this.x, this.z, tx, tz);
    const want = Math.atan2(tx - this.x, tz - this.z);
    this.heading = turnToward(this.heading, want, 4 * dt);
    if (d > 2.2) {
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      this.bustTimer = 0;
    } else {
      this.bustTimer += dt;
    }
    [this.x, this.z] = city.resolveCollisions(this.x, this.z, 0.6);
    this.walkPhase += dt * 9;
    const swing = Math.sin(this.walkPhase) * 0.6;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    return d;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

export class PoliceManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this.cops = [];
    this.spawnTimer = 0;
  }

  /** How many police cars the current star level calls for. */
  wantedCarCount(stars) {
    return Math.min(CONFIG.maxPoliceCars, stars);
  }

  /** How many foot cops the current star level calls for. */
  wantedCopCount(stars) {
    return stars >= 2 ? Math.min(CONFIG.maxPoliceFoot, stars - 1) : 0;
  }

  /** Spawn a unit on a ring around the player. */
  spawnAtRing(px, pz, radius, make) {
    const angle = Math.random() * Math.PI * 2;
    return make(px + Math.sin(angle) * radius, pz + Math.cos(angle) * radius);
  }

  /**
   * Spawn, chase and stand down. Returns true when any unit is near enough
   * that the player counts as seen. `onBusted` fires when a cop holds the
   * player long enough.
   */
  update(dt, wanted, px, pz, playerInCar, playerSpeed, onBusted) {
    const stars = wanted.stars;
    this.spawnTimer -= dt;
    if (stars > 0 && this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;
      const wantCars = this.wantedCarCount(stars);
      const wantCops = playerInCar ? 0 : this.wantedCopCount(stars);
      if (this.cars.length < wantCars) {
        this.cars.push(this.spawnAtRing(px, pz, 70, (x, z) => new PoliceCar(this.scene, x, z)));
      }
      if (this.cops.length < wantCops) {
        this.cops.push(this.spawnAtRing(px, pz, 40, (x, z) => new FootCop(this.scene, x, z)));
      }
    }
    // Chase.
    let anyNear = false;
    for (const car of this.cars) {
      const d = car.updateChase(dt, this.city, px, pz, playerSpeed);
      if (d < SIGHT_RANGE) anyNear = true;
    }
    for (const cop of this.cops) {
      const d = cop.update(dt, this.city, px, pz);
      if (d < SIGHT_RANGE) anyNear = true;
      if (cop.bustTimer > BUST_HOLD_SECONDS) {
        onBusted();
        cop.bustTimer = 0;
      }
    }
    // Stand down when the heat is gone.
    if (stars === 0) {
      for (const car of this.cars) car.dispose();
      for (const cop of this.cops) cop.dispose();
      this.cars = [];
      this.cops = [];
    }
    return anyNear;
  }

  /** Distance from the nearest police unit (car or cop) to the player. */
  nearestDistance(px, pz) {
    let best = Infinity;
    for (const unit of [...this.cars, ...this.cops]) {
      best = Math.min(best, dist2D(px, pz, unit.x, unit.z));
    }
    return best;
  }

  /**
   * Does any police car touch the player's car? Returns the ramming car's
   * position (the main loop turns it into a slowdown + camera shake).
   */
  carCollision(px, pz, radius = 3) {
    for (const car of this.cars) {
      if (dist2D(px, pz, car.x, car.z) < radius) {
        return { x: car.x, z: car.z };
      }
    }
    return null;
  }
}
