// Combat: the player's pistol and fists, enemy gang members who shoot
// back, tracers, muzzle flashes and hit feedback.
// Shooting is a raycast from the camera through the crosshair.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { dist2D, clamp, turnToward } from './util.js';
import { buildPersonMesh } from './pedestrians.js';

const ENEMY_SHIRT = 0x8a1a1a;
const ENEMY_PANTS = 0x222222;
const ENEMY_SKIN = 0xc98d5f;
const ENEMY_SIGHT = 42; // enemies engage inside this range
const TRACER_LIFETIME = 0.07;
const SHOT_COOLDOWN = 0.28;

/** One Kestrel crew member: approaches the player and shoots back. */
export class Enemy {
  constructor(scene, x, z, health = CONFIG.enemyHealth) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.health = health;
    this.maxHealth = health;
    this.heading = Math.random() * Math.PI * 2;
    this.shootTimer = 1 + Math.random() * 1.5;
    this.dead = false;
    this.walkPhase = Math.random() * 6;
    const mesh = buildPersonMesh(ENEMY_SHIRT, ENEMY_PANTS, ENEMY_SKIN);
    this.group = mesh.group;
    this.legL = mesh.legL;
    this.legR = mesh.legR;
    // Red bandana + dark jacket marks the Kestrel crew.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.14, 0.46),
      new THREE.MeshLambertMaterial({ color: 0xd21f1f }),
    );
    band.position.y = 1.86;
    this.group.add(band);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  /** One step. Returns true when this enemy fires at the player. */
  update(dt, city, px, pz, playerAlive) {
    if (this.dead) return false;
    const d = dist2D(this.x, this.z, px, pz);
    let fired = false;
    if (playerAlive && d < ENEMY_SIGHT) {
      const want = Math.atan2(px - this.x, pz - this.z);
      this.heading = turnToward(this.heading, want, 3 * dt);
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = 1.1 + Math.random() * 1.2;
        fired = true;
      }
      // Strafe to hold a fighting distance: back off when too close,
      // close in when too far.
      if (d < 10) {
        this.x -= Math.sin(this.heading) * 2.2 * dt;
        this.z -= Math.cos(this.heading) * 2.2 * dt;
      } else if (d > 26) {
        this.x += Math.sin(this.heading) * 3.4 * dt;
        this.z += Math.cos(this.heading) * 3.4 * dt;
      }
    } else if (playerAlive) {
      // Out of range: walk toward the player.
      const want = Math.atan2(px - this.x, pz - this.z);
      this.heading = turnToward(this.heading, want, 2 * dt);
      this.x += Math.sin(this.heading) * 3.4 * dt;
      this.z += Math.cos(this.heading) * 3.4 * dt;
    }
    [this.x, this.z] = city.resolveCollisions(this.x, this.z, 0.6);
    this.walkPhase += dt * 8;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    return fired;
  }

  /** Apply damage. Returns true when this hit killed the enemy. */
  takeDamage(amount) {
    if (this.dead) return false;
    this.health -= amount;
    if (this.health > 0) return false;
    this.dead = true;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.3;
    return true;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.ammo = CONFIG.pistolAmmo;
    this.ammoReserve = 48;
    this.cooldown = 0;
    this.enemies = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CONFIG.pistolRange;
    // Tracer line pool (reused, never allocated per shot).
    this.tracerMat = new THREE.LineBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.9,
    });
    this.tracerGeo = new THREE.BufferGeometry();
    this.tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(this.tracerGeo, this.tracerMat);
    this.tracer.visible = false;
    this.tracerTimer = 0;
    scene.add(this.tracer);
    // Muzzle flash: a point light that flares on each shot.
    this.flash = new THREE.PointLight(0xffc860, 0, 14);
    scene.add(this.flash);
  }

  spawnEnemies(positions) {
    this.clearEnemies();
    for (const [x, z] of positions) {
      this.enemies.push(new Enemy(this.scene, x, z));
    }
  }

  clearEnemies() {
    for (const enemy of this.enemies) enemy.dispose();
    this.enemies = [];
  }

  aliveCount() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  /** Move rounds from the reserve into the magazine. False if impossible. */
  reload() {
    if (this.ammo === CONFIG.pistolAmmo || this.ammoReserve <= 0) return false;
    const need = CONFIG.pistolAmmo - this.ammo;
    const take = Math.min(need, this.ammoReserve);
    this.ammo += take;
    this.ammoReserve -= take;
    return true;
  }

  /**
   * Fire the pistol from the camera through the screen centre.
   * `targets` is a list of {mesh, radius, onHit} hit-proxies built by main.
   * Returns 'hit' | 'miss' | 'empty' | 'cooldown'.
   */
  shoot(camera, targets) {
    if (this.cooldown > 0) return 'cooldown';
    if (this.ammo <= 0) return 'empty';
    this.ammo -= 1;
    this.cooldown = SHOT_COOLDOWN;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const meshes = targets.map((t) => t.mesh);
    const hits = this.raycaster.intersectObjects(meshes, true);
    const from = camera.position.clone();
    let end = from
      .clone()
      .add(this.raycaster.ray.direction.clone().multiplyScalar(CONFIG.pistolRange));
    let result = 'miss';
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      // Walk up from the hit child mesh to the target's root group.
      let obj = hit.object;
      while (obj && !targets.some((t) => t.mesh === obj)) obj = obj.parent;
      const target = targets.find((t) => t.mesh === obj);
      if (target && target.onHit) {
        target.onHit(hit.point);
        result = 'hit';
      }
    }
    this.showTracer(from, end);
    return result;
  }

  /** Draw the tracer line and flare the muzzle flash between two points. */
  showTracer(from, end) {
    const pos = this.tracerGeo.attributes.position.array;
    pos[0] = from.x;
    pos[1] = from.y;
    pos[2] = from.z;
    pos[3] = end.x;
    pos[4] = end.y;
    pos[5] = end.z;
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerTimer = TRACER_LIFETIME;
    this.flash.position.copy(from).add(this.raycaster.ray.direction.clone().multiplyScalar(1.2));
    this.flash.intensity = 6;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.visible = false;
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);
  }

  /** Melee: punch the nearest target within range. Returns the target or null. */
  punch(px, pz, targets, range = 2.6) {
    let best = null;
    let bestDist = range;
    for (const target of targets) {
      const d = dist2D(px, pz, target.x, target.z);
      if (d < bestDist) {
        bestDist = d;
        best = target;
      }
    }
    if (best && best.onPunch) best.onPunch();
    return best;
  }
}
