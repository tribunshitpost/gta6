// Neon Bay — pistol combat on foot.
// A shot is a short-range hitscan: the nearest pedestrian, cruiser or
// mission target within range and in front of the player takes damage.
// Shooting is a crime, so every shot raises the wanted level.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { dist2D } from './util.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.ammo = CONFIG.combat.maxAmmo;
    this.cooldown = 0;
    this.tracer = null;
    this._tracerLife = 0;
    this.shotsFired = 0;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.tracer) {
      this._tracerLife -= dt;
      if (this._tracerLife <= 0) {
        this.scene.remove(this.tracer);
        this.tracer = null;
      }
    }
  }

  get canShoot() {
    return this.cooldown <= 0 && this.ammo > 0;
  }

  // Fire from the player's position along their facing. Returns a small
  // report the caller uses for sound, HUD and wanted heat.
  shoot(origin, heading, targets) {
    if (!this.canShoot) return { fired: false, hit: null };
    this.cooldown = CONFIG.combat.pistolCooldown;
    this.ammo -= 1;
    this.shotsFired += 1;
    const dirX = Math.sin(heading);
    const dirZ = Math.cos(heading);
    const range = CONFIG.combat.pistolRange;
    let best = null;
    let bestDist = range;
    for (const t of targets) {
      const dx = t.x - origin.x;
      const dz = t.z - origin.z;
      const along = dx * dirX + dz * dirZ;
      if (along < 1 || along > bestDist) continue;
      const side = Math.abs(dx * dirZ - dz * dirX);
      if (side > 1.6) continue;
      bestDist = along;
      best = t;
    }
    const endX = origin.x + dirX * (best ? bestDist : range);
    const endZ = origin.z + dirZ * (best ? bestDist : range);
    this._showTracer(origin, endX, endZ);
    if (best && best.onHit) best.onHit(CONFIG.combat.pistolDamage);
    return { fired: true, hit: best };
  }

  _showTracer(origin, endX, endZ) {
    if (this.tracer) this.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(origin.x, 1.4, origin.z),
      new THREE.Vector3(endX, 1.3, endZ),
    ]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8 }));
    this.scene.add(this.tracer);
    this._tracerLife = 0.08;
  }

  reload() {
    this.ammo = CONFIG.combat.maxAmmo;
  }

  // A floating damage marker: a small red sphere that pops and fades.
  spawnHitMarker(x, y, z) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.9 }),
    );
    marker.position.set(x, y, z);
    this.scene.add(marker);
    window.setTimeout(() => this.scene.remove(marker), 350);
  }
}
