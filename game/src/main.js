// Neon Bay — the game itself: boot, loop, player, camera, and the wiring
// between every system. The loop is fixed-step friendly: each frame the
// player, car, traffic, pedestrians, police, missions and HUD all update
// once, in that order, and then the frame is rendered.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { buildCity, buildBuildings, buildProps, buildStreetFurniture, parkingSpots } from './city.js';
import { Traffic, ParkedCars, PlayerCar, inFenceLot, fencePrice } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { loadSave, writeSave, defaultSave } from './save.js';
import { parseShot, applyShot } from './shots.js';
import { clamp, dist2D, makeRng, money, resolveAllColliders, turnToward } from './util.js';

function makePlayerMesh() {
  const player = new THREE.Group();
  player.name = 'player';
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2a6ad8, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x22222e, roughness: 0.95 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.32), pants);
  legs.position.y = 0.43;
  player.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), jacket);
  torso.position.y = 1.2;
  torso.castShadow = true;
  player.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  player.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0xd83838 }));
  cap.position.y = 2.0;
  player.add(cap);
  return player;
}

export class Game {
  constructor() {
    const shot = parseShot();
    this.shot = shot;
    this.lowFx = shot.lowFx;
    this.seed = Number.isFinite(shot.seed) ? shot.seed : 7;
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.lowFx });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.lowFx;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.clock = new THREE.Clock();

    // --- World. ---
    const city = buildCity(this.scene, this.seed, this.lowFx);
    this.cityGroup = city.group;
    this.scene.add(city.group);
    this.colliders = city.colliders;
    this.buildingCount = buildBuildings(this.cityGroup, this.colliders, city.rng, this.lowFx);
    buildProps(this.cityGroup, this.colliders, city.rng, this.lowFx);
    buildStreetFurniture(this.cityGroup, this.colliders, city.rng, this.lowFx);
    this.traffic = new Traffic(this.scene, this.seed, this.lowFx);
    this.peds = new Pedestrians(this.scene, this.seed, this.lowFx);
    this.parked = new ParkedCars(this.scene, parkingSpots(city.rng), this.seed);
    this.police = new Police(this.scene, this.seed);
    this.combat = new Combat(this.scene);
    this.playerCar = new PlayerCar(this.scene);

    // --- Player state (restored from a save when one exists). ---
    const saved = loadSave();
    this.state = {
      cash: CONFIG.player.startCash,
      health: CONFIG.player.maxHealth,
      missionsDone: [],
      bestWanted: 0,
      carsFenced: 0,
      totalEarned: 0,
      playSeconds: 0,
      ...(saved || {}),
    };
    this.player = {
      mesh: makePlayerMesh(),
      pos: { x: this.state.playerX ?? -6, z: this.state.playerZ ?? -6 },
      heading: 0,
      vy: 0,
      y: 0,
      onGround: true,
      running: false,
    };
    this.player.mesh.position.set(this.player.pos.x, 0, this.player.pos.z);
    this.scene.add(this.player.mesh);

    this.missions = new Missions(this.scene, {
      onHeat: (stars) => this.police.addHeat(stars),
      onStart: (m) => { this.audio.missionStart(); this.hud.toast('Mission: ' + m.title); },
      onStage: () => this.audio.pickup(),
      onComplete: (m, reward, index) => {
        this.state.cash += reward;
        this.state.totalEarned += reward;
        if (!this.state.missionsDone.includes(m.id)) this.state.missionsDone.push(m.id);
        this.audio.missionDone();
        this.hud.toast('Mission complete: ' + m.title + ' +' + money(reward));
        this.autosave();
      },
      onFail: () => this.audio.denied(),
    });

    this.pickups = this._makePickups();
    this.cameraMode = 'follow';
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.32;
    this.cameraDist = 9;
    this.orbitTarget = { x: 0, z: 0 };
    this.orbitRadius = 55;
    this.orbitHeight = 26;
    this._orbitAngle = 0.6;
    this.playing = false;
    this.paused = false;
    this.exitCooldown = 0;
    this.enterCooldown = 0;
    this.gunfirePos = null;
    this._gunfireTimer = 0;
    this._saveTimer = 0;
    this._shotApplied = false;
    window.__game = this;
    window.__neonbay = { version: CONFIG.version, seed: this.seed };
  }

  // --- Cash and health pickups, on open ground, never inside a collider. ---
  _makePickups() {
    const rng = makeRng(this.seed + 505);
    const spots = [
      { x: 10, z: 10, kind: 'cash' }, { x: -12, z: 6, kind: 'health' },
      { x: -67, z: -22, kind: 'cash' }, { x: 22, z: -67, kind: 'health' },
      { x: 67, z: 22, kind: 'cash' }, { x: -22, z: 67, kind: 'cash' },
      { x: 90, z: -45, kind: 'health' }, { x: -90, z: -67, kind: 'cash' },
      { x: 45, z: 67, kind: 'health' }, { x: -45, z: 90, kind: 'cash' },
    ];
    const list = [];
    for (const s of spots) {
      const isCash = s.kind === 'cash';
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshBasicMaterial({ color: isCash ? 0x2ad858 : 0xff4455 }),
      );
      mesh.position.set(s.x, 1, s.z);
      this.scene.add(mesh);
      list.push({ ...s, mesh, taken: false, respawn: 0, spin: rng() * Math.PI * 2 });
    }
    return list;
  }

  startPlaying() {
    if (this.playing) return;
    this.playing = true;
    this.audio.unlock();
    const title = document.getElementById('title-screen');
    if (title) title.style.display = 'none';
    this.hud.toast('Welcome to Neon Bay — press 1, 2 or 3 for a mission', 4200);
  }

  autosave() {
    const ok = writeSave({ ...this.state, player: this.player });
    if (ok) this.hud.toast('Progress saved', 1400);
    return ok;
  }

  // --- Entering and exiting cars, with a cooldown so E never bounces
  // the player straight back into the car they just left. ---
  enterCar(parkedCar) {
    if (this.enterCooldown > 0) return;
    const mesh = parkedCar.mesh;
    this.parked.remove(parkedCar);
    this.scene.add(mesh);
    this.playerCar.enter(mesh, parkedCar.model, parkedCar.x, parkedCar.z, parkedCar.mesh.rotation.y);
    this.player.mesh.visible = false;
    this.cameraMode = 'chase';
    this.police.addHeat(1);
    this.audio.horn();
    this.hud.toast('You took the ' + parkedCar.model.name + ' — the law noticed (+1 star)');
  }

  exitCar() {
    if (!this.playerCar.active || this.exitCooldown > 0) return;
    const mesh = this.playerCar.exit();
    const heading = this.playerCar.heading;
    // Step out to the driver's side, clear of the car body.
    const sx = this.playerCar.pos.x + Math.cos(heading) * 2.6;
    const sz = this.playerCar.pos.z - Math.sin(heading) * 2.6;
    this.player.pos.x = sx;
    this.player.pos.z = sz;
    this.player.heading = heading;
    this.player.mesh.visible = true;
    this.player.mesh.position.set(sx, 0, sz);
    // Leave the car parked where it stopped, as a stealable car again.
    mesh.position.set(this.playerCar.pos.x, 0, this.playerCar.pos.z);
    mesh.rotation.y = heading;
    this.parked.cars.push({ mesh, model: this.playerCar.model, taken: false, x: this.playerCar.pos.x, z: this.playerCar.pos.z });
    this.cameraMode = 'follow';
    this.exitCooldown = 1.0;
    this.enterCooldown = 0.6;
    this.hud.toast('You left the car');
  }

  // --- The fence: sell the car you are driving, if parked in the lot. ---
  tryFence() {
    if (!this.playerCar.active) return;
    if (!inFenceLot(this.playerCar.pos.x, this.playerCar.pos.z)) {
      this.hud.toast('Drive into the yellow Foundry fence lot to sell a car');
      return;
    }
    const price = fencePrice(this.playerCar.model);
    const name = this.playerCar.model ? this.playerCar.model.name : 'car';
    const mesh = this.playerCar.exit();
    this.scene.remove(mesh);
    this.state.cash += price;
    this.state.totalEarned += price;
    this.state.carsFenced += 1;
    this.player.mesh.visible = true;
    const px = this.playerCar.pos.x;
    const pz = this.playerCar.pos.z;
    this.player.pos.x = px + 3;
    this.player.pos.z = pz;
    this.player.mesh.position.set(px + 3, 0, pz);
    this.cameraMode = 'follow';
    this.exitCooldown = 1.0;
    this.audio.cash();
    this.hud.toast('Fenced the ' + name + ' for ' + money(price));
    this.autosave();
  }

  // --- Busted and down: fines, respawns, and mission consequences. ---
  onBusted() {
    const fine = this.police.bustFine();
    this.state.cash = Math.max(0, this.state.cash - fine);
    this.state.health = 50;
    this.police.clearHeat();
    if (this.playerCar.active) {
      const mesh = this.playerCar.exit();
      this.scene.remove(mesh);
    }
    this.missions.abandon('You were busted by the Neon Bay police.');
    this.player.mesh.visible = true;
    const g = CONFIG.places.garage;
    this.player.pos.x = g.x;
    this.player.pos.z = g.z;
    this.player.mesh.position.set(g.x, 0, g.z);
    this.cameraMode = 'follow';
    this.audio.busted();
    this.hud.toast('BUSTED — fined ' + money(fine) + '. The heat is off, for now.');
    this.autosave();
  }

  onDown() {
    this.state.cash = Math.max(0, this.state.cash - 200);
    this.state.health = CONFIG.player.maxHealth;
    this.missions.abandon('You were taken down in the streets.');
    this.police.clearHeat();
    const g = CONFIG.places.garage;
    this.player.pos.x = g.x;
    this.player.pos.z = g.z;
    this.player.mesh.position.set(g.x, 0, g.z);
    this.cameraMode = 'follow';
    this.audio.denied();
    this.hud.toast('You woke up at Mara\u2019s Garage, $200 lighter.');
    this.autosave();
  }

  // --- Shooting: build the target list from living pedestrians and
  // cruisers, then let Combat resolve the shot. ---
  tryShoot() {
    if (this.playerCar.active) return;
    const origin = { x: this.player.pos.x, z: this.player.pos.z };
    const targets = [];
    for (const p of this.peds.list) {
      targets.push({
        x: p.x, z: p.z,
        onHit: () => {
          this.combat.spawnHitMarker(p.x, 1.4, p.z);
          this.peds.remove(p);
          this.police.addHeat(1);
          this.hud.toast('A pedestrian went down — witnesses called it in (+1 star)');
        },
      });
    }
    for (const c of this.police.cruisers) {
      targets.push({
        x: c.mesh.position.x, z: c.mesh.position.z,
        onHit: () => {
          c.speed *= 0.4;
          this.police.addHeat(1);
          this.combat.spawnHitMarker(c.mesh.position.x, 1.4, c.mesh.position.z);
        },
      });
    }
    const result = this.combat.shoot(origin, this.player.heading, targets);
    if (result.fired) {
      this.audio.gunshot();
      this.police.addHeat(1);
      this.gunfirePos = { x: origin.x, z: origin.z };
      this._gunfireTimer = 6;
    }
  }

  _updatePickups(dt) {
    const pos = this.playerCar.active ? this.playerCar.pos : this.player.pos;
    for (const p of this.pickups) {
      if (p.taken) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          p.taken = false;
          p.mesh.visible = true;
        }
        continue;
      }
      p.spin += dt * 2;
      p.mesh.rotation.y = p.spin;
      p.mesh.position.y = 1 + Math.sin(p.spin * 1.5) * 0.15;
      if (dist2D(pos.x, pos.z, p.x, p.z) < 2.2) {
        p.taken = true;
        p.mesh.visible = false;
        p.respawn = 60;
        if (p.kind === 'cash') {
          this.state.cash += CONFIG.economy.pickupCash;
          this.state.totalEarned += CONFIG.economy.pickupCash;
          this.audio.cash();
          this.hud.toast('Picked up ' + money(CONFIG.economy.pickupCash));
        } else {
          this.state.health = Math.min(CONFIG.player.maxHealth, this.state.health + CONFIG.economy.pickupHealth);
          this.audio.pickup();
          this.hud.toast('Health +' + CONFIG.economy.pickupHealth);
        }
      }
    }
  }

  // --- The per-frame update. ---
  update(dt) {
    this.exitCooldown = Math.max(0, this.exitCooldown - dt);
    this.enterCooldown = Math.max(0, this.enterCooldown - dt);
    this._gunfireTimer = Math.max(0, this._gunfireTimer - dt);
    if (this._gunfireTimer <= 0) this.gunfirePos = null;
    this.state.playSeconds += dt;
    this._saveTimer += dt;
    if (this._saveTimer > 30) {
      this._saveTimer = 0;
      writeSave({ ...this.state, player: this.player });
    }

    const input = this.input;
    if (input.hit('KeyP') || input.hit('Escape')) {
      this.paused = !this.paused;
      this.hud.setPaused(this.paused, 'PAUSED — press P to keep playing');
      if (this.paused) this.audio.suspend();
    }
    if (this.paused) { input.endFrame(); return; }
    if (input.hit('KeyM')) {
      const on = this.audio.toggleMusic();
      this.hud.toast(on ? 'Music on' : 'Music off');
    }
    if (input.hit('KeyH')) {
      document.getElementById('hud-help').classList.toggle('hidden');
    }

    // Mission keys.
    const missionIndex = input.missionKey();
    if (missionIndex >= 0 && this.playing) {
      if (this.missions.active === null) this.missions.start(missionIndex, this.state.missionsDone);
      else this.hud.toast('Finish the current mission first');
    }

    // Camera orbit with the mouse.
    const drag = input.consumeDrag();
    this.cameraYaw -= drag.dx * 0.005;
    this.cameraPitch = clamp(this.cameraPitch + drag.dy * 0.003, 0.05, 1.1);
    this.cameraDist = clamp(this.cameraDist + input.consumeWheel() * 0.01, 6, 16);

    if (this.playerCar.active) {
      // --- Driving. ---
      this.playerCar.update(dt, input, this.colliders, this.traffic, () => {
        this.audio.crash();
        this.state.health = Math.max(0, this.state.health - 6);
      });
      if (input.hit('KeyE')) this.exitCar();
      if (input.hit('KeyF')) this.tryFence();
    } else {
      // --- On foot. ---
      const speed = input.down('ShiftLeft') || input.down('ShiftRight')
        ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;
      this.player.running = speed > CONFIG.player.walkSpeed;
      // moveY is -1 for W and +1 for S, so forward flips its sign.
      const forward = -input.moveY;
      const strafe = input.moveX;
      const sin = Math.sin(this.cameraYaw);
      const cos = Math.cos(this.cameraYaw);
      // Forward is the camera's view direction (sin, cos); right is its
      // cross product with up, (-cos, sin). W walks away from the camera.
      let mx = (sin * forward - cos * strafe);
      let mz = (cos * forward + sin * strafe);
      const len = Math.hypot(mx, mz);
      if (len > 0) { mx /= len; mz /= len; }
      const trial = {
        x: this.player.pos.x + mx * speed * dt,
        z: this.player.pos.z + mz * speed * dt,
      };
      resolveAllColliders(trial, CONFIG.player.radius, this.colliders);
      trial.x = clamp(trial.x, -CONFIG.cityHalf + 1, CONFIG.cityHalf - 1);
      trial.z = clamp(trial.z, -CONFIG.cityHalf + 1, CONFIG.cityHalf - 1);
      this.player.pos.x = trial.x;
      this.player.pos.z = trial.z;
      if (len > 0) {
        const targetHeading = Math.atan2(mx, mz);
        this.player.heading = turnToward(this.player.heading, targetHeading, dt * 10);
      }
      // Jump and gravity.
      if (input.hit('Space') && this.player.onGround) {
        this.player.vy = CONFIG.player.jumpSpeed;
        this.player.onGround = false;
      }
      this.player.vy -= 22 * dt;
      this.player.y += this.player.vy * dt;
      if (this.player.y <= 0) {
        this.player.y = 0;
        this.player.vy = 0;
        this.player.onGround = true;
      }
      const bob = len > 0 ? Math.sin(performance.now() / 90) * 0.05 : 0;
      this.player.mesh.position.set(this.player.pos.x, this.player.y + bob, this.player.pos.z);
      this.player.mesh.rotation.y = this.player.heading;
      // Car theft and shooting.
      if (input.hit('KeyE')) {
        const near = this.parked.nearest(this.player.pos.x, this.player.pos.z, 3.5);
        if (near) this.enterCar(near);
        else this.hud.toast('No car close enough — walk up to a parked car and press E');
      }
      if (input.consumeClick() || input.hit('KeyF')) this.tryShoot();
      if (input.hit('KeyR')) this.combat.reload();
    }

    // --- World systems. ---
    this.traffic.update(dt);
    this.peds.update(dt, this.playerCar.active ? this.playerCar.pos : this.player.pos, this.gunfirePos);
    this.combat.update(dt);
    const speedNow = this.playerCar.active ? Math.abs(this.playerCar.speed) : 0;
    this.police.update(dt, this.playerCar.active ? this.playerCar.pos : this.player.pos, speedNow,
      () => this.onBusted(),
      () => {
        this.audio.crash();
        this.state.health = Math.max(0, this.state.health - 8);
        if (this.playerCar.active) this.playerCar.speed *= 0.4;
      });
    this.missions.update(dt, this.playerCar.active ? this.playerCar.pos : this.player.pos);
    this._updatePickups(dt);
    if (this.police.wanted > this.state.bestWanted) this.state.bestWanted = this.police.wanted;
    if (this.state.health <= 0) this.onDown();

    // --- Audio follows the game. ---
    this.audio.setEngine(this.playerCar.active ? Math.abs(this.playerCar.speed) / 38 : 0, this.playerCar.active);
    this.audio.setSiren(this.police.wanted > 0 && this.playing);

    // --- Camera. ---
    this._updateCamera(dt);

    // --- HUD. ---
    const pos = this.playerCar.active ? this.playerCar.pos : this.player.pos;
    this.hud.update({
      cash: this.state.cash,
      health: this.state.health,
      wanted: this.police.wanted,
      objective: this.missions.objectiveText,
      dialogue: this.missions.currentLine,
      speed: speedNow,
      inCar: this.playerCar.active,
      carName: this.playerCar.model ? this.playerCar.model.name : '',
      ammo: this.combat.ammo,
      running: this.player.running,
      x: pos.x,
      z: pos.z,
      heading: this.playerCar.active ? this.playerCar.heading : this.player.heading,
      target: this.missions.targetPos(),
      traffic: this.traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
      cops: this.police.cruisers.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    });
    input.endFrame();
  }

  _updateCamera(dt) {
    const pos = this.playerCar.active ? this.playerCar.pos : this.player.pos;
    const heading = this.playerCar.active ? this.playerCar.heading : this.cameraYaw;
    if (this.cameraMode === 'orbit') {
      this._orbitAngle += dt * 0.07;
      const tx = this.orbitTarget.x;
      const tz = this.orbitTarget.z;
      this.camera.position.set(
        tx + Math.cos(this._orbitAngle) * this.orbitRadius,
        this.orbitHeight,
        tz + Math.sin(this._orbitAngle) * this.orbitRadius,
      );
      this.camera.lookAt(tx, 4, tz);
      return;
    }
    const back = this.cameraMode === 'chase' ? heading : this.cameraYaw;
    const dist = this.cameraMode === 'chase' ? 11 : this.cameraDist;
    const height = this.cameraMode === 'chase' ? 4.2 : 3.2 + this.cameraPitch * 6;
    const cx = pos.x - Math.sin(back) * dist;
    const cz = pos.z - Math.cos(back) * dist;
    const target = new THREE.Vector3(cx, height, cz);
    this.camera.position.lerp(target, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(pos.x, 1.8, pos.z);
  }

  // --- The frame loop, with the shot scenes applied once. ---
  run() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (!this._shotApplied) {
        this._shotApplied = true;
        const scene = applyShot(this, this.shot.shot);
        const title = document.getElementById('title-screen');
        if (scene && scene.keepTitle && title) title.style.display = 'flex';
        if (scene && !scene.keepTitle && title) title.style.display = 'none';
      }
      if (this.playing || this.shot.shot) this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}

// --- Boot: wire the title screen, then run. ---
const game = new Game();
window.addEventListener('resize', () => {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.audio.suspend();
});
const startButton = document.getElementById('start-button');
if (startButton) {
  startButton.addEventListener('click', () => game.startPlaying());
}
const continueButton = document.getElementById('continue-button');
if (continueButton) {
  const saved = loadSave();
  if (!saved) continueButton.style.display = 'none';
  continueButton.addEventListener('click', () => game.startPlaying());
}
const lowFxButton = document.getElementById('lowfx-button');
if (lowFxButton) {
  lowFxButton.addEventListener('click', () => {
    window.location.search = '?lowfx=1';
  });
}
game.run();
