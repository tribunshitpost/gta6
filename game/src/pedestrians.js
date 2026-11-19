// Neon Bay — pedestrians: walkers on the sidewalks who stroll, chat and
// flee when shots ring out. Built from a few boxes each, in one shared
// material set, so twenty-six walkers cost almost nothing to draw.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dist2D, makeRng, pick, range } from './util.js';

const SHIRT_COLOURS = [0xd83838, 0x38a8d8, 0xd8c838, 0x38d878, 0xe8e8e8, 0xd87ab8, 0x3848d8];
const SKIN_COLOURS = [0xe8b88a, 0xc78a5a, 0x8a5a3a, 0xf0c8a0];

export function makePedestrianMesh(rng) {
  const ped = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: pick(rng, SHIRT_COLOURS), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: pick(rng, SKIN_COLOURS), roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.95 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.28), pants);
  legs.position.y = 0.4;
  ped.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirt);
  torso.position.y = 1.1;
  torso.castShadow = true;
  ped.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  ped.add(head);
  return ped;
}

export class Pedestrians {
  constructor(scene, seed, lowFx) {
    this.scene = scene;
    this.list = [];
    const rng = makeRng(seed + 303);
    const count = lowFx ? CONFIG.pedestrians.countLowFx : CONFIG.pedestrians.count;
    for (let i = 0; i < count; i++) {
      const mesh = makePedestrianMesh(rng);
      // Walkers start on a sidewalk strip beside a random avenue.
      const avenue = pick(rng, CONFIG.avenues);
      const along = range(rng, -105, 105);
      const side = rng() > 0.5 ? 1 : -1;
      const vertical = rng() > 0.5;
      const x = vertical ? avenue + side * (CONFIG.roadHalf + 1.8) : along;
      const z = vertical ? along : avenue + side * (CONFIG.roadHalf + 1.8);
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      this.list.push({
        mesh,
        x,
        z,
        heading: rng() * Math.PI * 2,
        speed: CONFIG.pedestrians.walkSpeed * range(rng, 0.7, 1.3),
        fleeing: false,
        bobPhase: rng() * Math.PI * 2,
      });
    }
  }

  update(dt, playerPos, gunfirePos) {
    for (const p of this.list) {
      // Flee from gunfire, and from a car bearing down on the sidewalk.
      const threat = gunfirePos || playerPos;
      const d = dist2D(p.x, p.z, threat.x, threat.z);
      p.fleeing = d < 14;
      let heading = p.heading;
      if (p.fleeing) {
        const away = Math.atan2(p.x - threat.x, p.z - threat.z);
        heading = away;
        p.heading = away;
      } else if (Math.random() < dt * 0.05) {
        // Occasionally pick a new direction; most of the time keep going.
        p.heading += (Math.random() - 0.5) * 1.6;
        heading = p.heading;
      }
      const speed = p.fleeing ? p.speed * 2.4 : p.speed;
      p.x += Math.sin(heading) * speed * dt;
      p.z += Math.cos(heading) * speed * dt;
      // Walkers stay in the city and off the plaza centre.
      p.x = clamp(p.x, -CONFIG.cityHalf + 3, CONFIG.cityHalf - 3);
      p.z = clamp(p.z, -CONFIG.cityHalf + 3, CONFIG.cityHalf - 3);
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.bobPhase)) * 0.05, p.z);
      p.mesh.rotation.y = heading;
      p.bobPhase += dt * 6;
    }
  }

  // The walker nearest a point, for hit detection and crime checks.
  nearest(x, z, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const p of this.list) {
      const d = dist2D(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  remove(ped) {
    this.scene.remove(ped.mesh);
    const i = this.list.indexOf(ped);
    if (i >= 0) this.list.splice(i, 1);
  }
}
