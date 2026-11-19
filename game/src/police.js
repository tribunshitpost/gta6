// Neon Bay — the wanted system and the police.
// Stars 0-5. Crimes add heat; heat decays when the player stays clean.
// Cruisers spawn at the city edge, chase the player, ram to slow them,
// and bust them if they stay close and slow for long enough. A bust
// costs a fine and clears the heat — never a game over on its own.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dist2D, makeRng, pick } from './util.js';
import { makeCarMesh } from './vehicles.js';

export class Police {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed + 404);
    this.wanted = 0;
    this.heatTimer = 0;
    this.bustTimer = 0;
    this.cruisers = [];
    this._spawnCooldown = 0;
  }

  addHeat(stars) {
    if (stars <= 0) return;
    const before = this.wanted;
    this.wanted = clamp(this.wanted + stars, 0, 5);
    this.heatTimer = 0;
    if (this.wanted > before) this._spawnCooldown = Math.min(this._spawnCooldown, 0.5);
  }

  clearHeat() {
    this.wanted = 0;
    this.heatTimer = 0;
    this.bustTimer = 0;
    for (const c of this.cruisers) this.scene.remove(c.mesh);
    this.cruisers = [];
  }

  // A bust costs a fine scaled by the stars, then the heat is gone.
  bustFine() {
    return this.wanted * CONFIG.police.finePerStar;
  }

  // How many cruisers the current wanted level calls for.
  wantedCruisers() {
    if (this.wanted === 0) return 0;
    if (this.wanted <= 2) return 1;
    if (this.wanted <= 3) return 2;
    if (this.wanted <= 4) return 3;
    return CONFIG.police.maxCruisers;
  }

  _spawnCruiser(playerPos) {
    const angle = this.rng() * Math.PI * 2;
    const x = playerPos.x + Math.cos(angle) * 55;
    const z = playerPos.z + Math.sin(angle) * 55;
    const mesh = makeCarMesh({ name: 'Cruiser', value: 0, top: 36 }, 0x1a2a4a);
    // Light bar on the roof: the cruiser's signature.
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2244 }),
    );
    bar.position.set(0, 1.75, -0.2);
    bar.name = 'lightbar';
    mesh.add(bar);
    const bar2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    bar2.position.set(0.6, 1.75, -0.2);
    mesh.add(bar2);
    mesh.position.set(clamp(x, -110, 110), 0, clamp(z, -110, 110));
    this.scene.add(mesh);
    this.cruisers.push({ mesh, speed: 0, ramCooldown: 0, bar });
  }

  update(dt, playerPos, playerSpeed, onBusted, onRam) {
    // Heat cools off after a quiet stretch.
    if (this.wanted > 0) {
      this.heatTimer += dt;
      if (this.heatTimer >= CONFIG.police.heatDecaySeconds) {
        this.wanted -= 1;
        this.heatTimer = 0;
        if (this.wanted === 0) this.clearHeat();
      }
    }
    // Keep the cruiser count matched to the wanted level.
    this._spawnCooldown -= dt;
    const want = this.wantedCruisers();
    if (this.cruisers.length < want && this._spawnCooldown <= 0) {
      this._spawnCruiser(playerPos);
      this._spawnCooldown = 2.5;
    }
    while (this.cruisers.length > want) {
      const c = this.cruisers.pop();
      this.scene.remove(c.mesh);
    }

    let anyClose = false;
    for (const c of this.cruisers) {
      const m = c.mesh;
      const d = dist2D(m.position.x, m.position.z, playerPos.x, playerPos.z);
      // Chase: steer straight at the player, faster at higher wanted.
      const targetHeading = Math.atan2(playerPos.x - m.position.x, playerPos.z - m.position.z);
      let diff = targetHeading - m.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      m.rotation.y += clamp(diff, -2.2 * dt, 2.2 * dt);
      const chaseSpeed = CONFIG.police.chaseSpeed * (0.85 + this.wanted * 0.08);
      c.speed = Math.min(c.speed + 14 * dt, chaseSpeed);
      m.position.x += Math.sin(m.rotation.y) * c.speed * dt;
      m.position.z += Math.cos(m.rotation.y) * c.speed * dt;
      m.position.x = clamp(m.position.x, -CONFIG.cityHalf + 2, CONFIG.cityHalf - 2);
      m.position.z = clamp(m.position.z, -CONFIG.cityHalf + 2, CONFIG.cityHalf - 2);
      // Flash the light bar red/blue.
      if (c.bar) c.bar.material.color.setHex(Math.floor(performance.now() / 300) % 2 ? 0xff2244 : 0x2244ff);
      // Ram: a close, fast cruiser shoves the player and slows them.
      c.ramCooldown -= dt;
      if (d < CONFIG.police.ramDistance && c.ramCooldown <= 0) {
        c.ramCooldown = 1.2;
        if (onRam) onRam();
      }
      if (d < CONFIG.police.bustDistance && Math.abs(playerSpeed) < 4) anyClose = true;
    }
    // Bust: held close and slow for bustTime seconds.
    if (anyClose && this.cruisers.length > 0) {
      this.bustTimer += dt;
      if (this.bustTimer >= CONFIG.police.bustTime && onBusted) {
        this.bustTimer = 0;
        onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
  }
}
