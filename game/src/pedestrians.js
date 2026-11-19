// Pedestrians: sidewalk walkers who stroll, panic and flee when scared,
// and can be knocked down. Pure crowd life for the city.
// Revision: livelier crowds — quicker walkers, a wider scare radius, a
// harder sprint when they panic, and varied skin tones so the same few
// faces don't repeat down every block.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng, clamp, dist2D, turnToward } from './util.js';
import { nearestRoad } from './city.js';

const SHIRTS = [0xe84a5f, 0x4a90e8, 0x50c878, 0xf2a541, 0x9b59b6, 0xdddddd, 0x2ecc71, 0xe67e22, 0x1abc9c];
const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1a1a1a, 0x4a6741];
const SKINS = [0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf2c9a0];
const PED_RADIUS = 0.6;
const SCARE_RADIUS = 22;

/**
 * Build a simple low-poly person. Returns the group plus the four limbs
 * (legs/arms pivot at the hip/shoulder so walk animation can swing them).
 */
export function buildPersonMesh(shirt, pants, skin = 0xe8b98a) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), shirtMat);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.78;
  group.add(head);

  // Legs pivot at the hip: shift the geometry down, then place at hip height.
  const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.26);
  legGeo.translate(0, -0.38, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.16, 0.76, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.16, 0.76, 0);
  group.add(legR);

  // Arms pivot at the shoulder the same way.
  const armGeo = new THREE.BoxGeometry(0.18, 0.6, 0.2);
  armGeo.translate(0, -0.3, 0);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.42, 1.45, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.42, 1.45, 0);
  group.add(armR);

  return { group, legL, legR, armL, armR };
}

export class Pedestrian {
  constructor(scene, x, z, rng) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.speed = 1.4 + rng() * 1.2;
    this.state = 'walk'; // walk | panic | down
    this.panicTimer = 0;
    this.target = this.pickTarget(rng);
    this.walkPhase = rng() * Math.PI * 2;
    const mesh = buildPersonMesh(
      SHIRTS[Math.floor(rng() * SHIRTS.length)],
      PANTS[Math.floor(rng() * PANTS.length)],
      SKINS[Math.floor(rng() * SKINS.length)],
    );
    this.group = mesh.group;
    this.legL = mesh.legL;
    this.legR = mesh.legR;
    this.armL = mesh.armL;
    this.armR = mesh.armR;
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  /** Pick a new sidewalk waypoint near a road intersection. */
  pickTarget(rng) {
    const x = nearestRoad((rng() - 0.5) * 340) + 9;
    const z = nearestRoad((rng() - 0.5) * 340) + 9;
    return [clamp(x, -190, 190), clamp(z, -190, 190)];
  }

  /** Start fleeing (a gunshot, a stolen car, a wanted player nearby). */
  scare() {
    if (this.state === 'down') return;
    this.state = 'panic';
    this.panicTimer = 5 + Math.random() * 3;
  }

  /** Knocked down by a bullet or a punch — stays down for the session. */
  knockDown() {
    this.state = 'down';
    this.panicTimer = 999;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.3;
  }

  update(dt, city, rng, threatX, threatZ, threatActive) {
    if (this.state === 'down') return;
    if (threatActive && dist2D(this.x, this.z, threatX, threatZ) < SCARE_RADIUS) {
      this.scare();
    }
    let speed = this.speed;
    if (this.state === 'panic') {
      this.panicTimer -= dt;
      speed = this.speed * 3.0;
      if (this.panicTimer <= 0) this.state = 'walk';
      // Flee directly away from the threat.
      const away = Math.atan2(this.x - threatX, this.z - threatZ);
      this.heading = turnToward(this.heading, away, 4 * dt);
    } else {
      if (dist2D(this.x, this.z, this.target[0], this.target[1]) < 2) {
        this.target = this.pickTarget(rng);
      }
      const want = Math.atan2(this.target[0] - this.x, this.target[1] - this.z);
      this.heading = turnToward(this.heading, want, 2 * dt);
    }
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
    [this.x, this.z] = city.resolveCollisions(this.x, this.z, PED_RADIUS);
    this.walkPhase += dt * speed * 3.2;
    const swing = Math.sin(this.walkPhase) * 0.55;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
  }
}

export class PedestrianManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(4242);
    this.peds = [];
    for (let i = 0; i < CONFIG.pedestrianCount; i++) {
      const x = nearestRoad((this.rng() - 0.5) * 340) + 9;
      const z = nearestRoad((this.rng() - 0.5) * 340) + 9;
      this.peds.push(new Pedestrian(scene, x, z, this.rng));
    }
  }

  update(dt, threatX, threatZ, threatActive) {
    for (const ped of this.peds) {
      ped.update(dt, this.city, this.rng, threatX, threatZ, threatActive);
    }
  }

  /** Nearest standing pedestrian within `maxDist`. */
  nearest(x, z, maxDist = 3) {
    let best = null;
    let bestDist = maxDist;
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const d = dist2D(x, z, ped.x, ped.z);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  /** Scare every pedestrian within `radius` of a point. */
  scareNear(x, z, radius = 24) {
    for (const ped of this.peds) {
      if (dist2D(x, z, ped.x, ped.z) < radius) ped.scare();
    }
  }
}
