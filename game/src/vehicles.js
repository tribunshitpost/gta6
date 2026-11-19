// Cars: building them, driving them (arcade physics), and the traffic
// that fills the roads. Traffic cars loop around city blocks and stop for
// the car ahead; the player can steal any of them.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng, clamp, turnToward, dist2D } from './util.js';
import { nearestRoad, roadCoords } from './city.js';

const CAR_COLORS = [
  0xd23c3c, 0x3c7ed2, 0xe8c33c, 0x3cd27a, 0xd2d2d2,
  0x2b2b33, 0xd2691e, 0x7a3cd2, 0x3cd2c2, 0xe88ab0,
];
const WHEEL_SPOTS = [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]];
const CARDINAL_HEADINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const CAR_RADIUS = 2.2; // collision radius used for cars

/** Build a low-poly car mesh. `police` adds a light bar. Returns {group, wheels}. */
export function buildCarMesh(color, police = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.3, -0.2);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of WHEEL_SPOTS) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights + taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const wx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), headMat);
    head.position.set(wx, 0.7, 2.22);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
    tail.position.set(wx, 0.7, -2.22);
    group.add(tail);
  }

  if (police) {
    const blueBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2266ff }),
    );
    blueBar.position.set(0, 1.75, -0.2);
    group.add(blueBar);
    const redBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.26, 0.52),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    redBar.position.set(-0.6, 1.75, -0.2);
    group.add(redBar);
    // White door stripe so a police car reads as one at a glance.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.12, 0.3, 1.2),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    stripe.position.set(0, 0.75, 0.6);
    group.add(stripe);
  }
  return { group, wheels };
}

export class Car {
  constructor(scene, x, z, heading, color, opts = {}) {
    this.scene = scene;
    this.police = !!opts.police;
    this.traffic = !!opts.traffic;
    this.stolen = false;
    this.parked = false;
    this.speed = 0;
    this.steer = 0;
    this.heading = heading;
    this.x = x;
    this.z = z;
    const mesh = buildCarMesh(color, this.police);
    this.group = mesh.group;
    this.wheels = mesh.wheels;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    scene.add(this.group);
    // Traffic-loop state.
    this.loop = null;
    this.loopIndex = 0;
    this.cruise = 7 + Math.random() * 4;
    this.stopped = 0;
  }

  /** Assign a rectangular block loop for traffic driving. */
  setLoop(points) {
    this.loop = points;
    this.loopIndex = 0;
  }

  /** Is another car directly ahead of this one (within `lookAhead`)? */
  carAhead(others, lookAhead = 9) {
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    for (const other of others) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dz = other.z - this.z;
      const ahead = forwardX * dx + forwardZ * dz;
      const side = Math.abs(forwardZ * dx - forwardX * dz);
      if (ahead > 0 && ahead < lookAhead && side < 2.4) return true;
    }
    return false;
  }

  /** One traffic-AI step: follow the loop, stop for the car ahead. */
  updateTraffic(dt, city, others) {
    if (!this.loop) return;
    if (this.stopped > 0) {
      this.stopped -= dt;
      this.speed = 0;
      this.sync();
      return;
    }
    const target = this.loop[this.loopIndex];
    if (dist2D(this.x, this.z, target[0], target[1]) < 3) {
      this.loopIndex = (this.loopIndex + 1) % this.loop.length;
      return;
    }
    const wantHeading = Math.atan2(target[0] - this.x, target[1] - this.z);
    this.heading = turnToward(this.heading, wantHeading, 1.6 * dt);
    const targetSpeed = this.carAhead(others) ? 0 : this.cruise;
    this.speed += clamp(targetSpeed - this.speed, -14 * dt, 8 * dt);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    [this.x, this.z] = city.resolveCollisions(this.x, this.z, CAR_RADIUS);
    this.sync();
  }

  /** Player driving: throttle -1..1, steer -1..1. */
  updateDrive(dt, throttle, steerInput, city) {
    if (throttle > 0) {
      this.speed += CONFIG.carAccel * throttle * dt;
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= CONFIG.carBrake * dt; // brake
      else this.speed += CONFIG.carAccel * 0.6 * throttle * dt; // reverse
    } else {
      // Coast to a stop.
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 10 * dt);
    }
    this.speed = clamp(this.speed, -CONFIG.carMaxReverse, CONFIG.carMaxSpeed);
    // Steering only bites once the car is moving.
    const grip = clamp(Math.abs(this.speed) / 8, 0, 1);
    const steerTarget = steerInput * CONFIG.carTurn * grip;
    this.steer += clamp(steerTarget - this.steer, -4 * dt, 4 * dt);
    if (Math.abs(this.speed) > 0.1) {
      this.heading += this.steer * dt * Math.sign(this.speed);
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    const beforeX = this.x;
    const beforeZ = this.z;
    [this.x, this.z] = city.resolveCollisions(this.x, this.z, CAR_RADIUS);
    // A hard hit on a building scrubs speed.
    if (Math.abs(this.x - beforeX) > 0.01 || Math.abs(this.z - beforeZ) > 0.01) {
      this.speed *= 0.55;
    }
    this.sync();
  }

  /** Copy physics state onto the mesh (position, heading, wheel spin). */
  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    const spin = this.speed * 0.4 * 0.016;
    for (const wheel of this.wheels) wheel.rotation.x += spin;
    // Front wheels steer visually.
    this.wheels[0].rotation.y = this.steer * 0.25;
    this.wheels[1].rotation.y = this.steer * 0.25;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

/** A rectangular loop around one city block, on the roads. */
export function blockLoop(rng, roads) {
  const cx = roads[Math.floor(rng() * roads.length)];
  const cz = roads[Math.floor(rng() * roads.length)];
  const spacing = CONFIG.roadSpacing;
  const half = CONFIG.cityHalf;
  const points = [
    [cx, cz],
    [cx + spacing, cz],
    [cx + spacing, cz + spacing],
    [cx, cz + spacing],
  ];
  // Keep the loop inside the city.
  return points.map(([x, z]) => [
    clamp(x, -half + 20, half - 20),
    clamp(z, -half + 20, half - 20),
  ]);
}

export class TrafficManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this.rng = makeRng(777);
    const roads = roadCoords();
    for (let i = 0; i < CONFIG.trafficCount; i++) {
      const x = nearestRoad((this.rng() - 0.5) * 320);
      const z = nearestRoad((this.rng() - 0.5) * 320);
      const heading = CARDINAL_HEADINGS[Math.floor(this.rng() * CARDINAL_HEADINGS.length)];
      const color = CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)];
      const car = new Car(scene, x, z, heading, color, { traffic: true });
      car.setLoop(blockLoop(this.rng, roads));
      this.cars.push(car);
    }
  }

  update(dt) {
    for (const car of this.cars) {
      if (car.stolen || car.parked) continue;
      car.updateTraffic(dt, this.city, this.cars);
    }
  }

  /** Nearest drivable (non-police, not already stolen) car to a point. */
  nearestCar(x, z, maxDist = 5) {
    let best = null;
    let bestDist = maxDist;
    for (const car of this.cars) {
      if (car.police || car.stolen) continue;
      const d = dist2D(x, z, car.x, car.z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  /** Move a far-away traffic car near the action (keeps the streets full). */
  respawnFar(px, pz) {
    const far = this.cars.filter(
      (c) => !c.stolen && !c.parked && dist2D(px, pz, c.x, c.z) > 120,
    );
    if (!far.length) return;
    const car = far[Math.floor(Math.random() * far.length)];
    const roads = roadCoords();
    car.x = nearestRoad((Math.random() - 0.5) * 320);
    car.z = nearestRoad((Math.random() - 0.5) * 320);
    car.setLoop(blockLoop(this.rng, roads));
    car.sync();
  }
}
