// Neon Bay — main game loop and orchestration.
// Wires the city, cars, pedestrians, police, combat, missions, HUD and
// audio together. The player walks, drives, steals, fights and runs
// missions in one continuous open world.

import * as THREE from 'three';
import { CONFIG, CASH_SPOTS } from './config.js';
import { clamp, dist2D, turnToward, wrapAngle } from './util.js';
import { City } from './city.js';
import { TrafficManager } from './vehicles.js';
import { PedestrianManager, buildPersonMesh } from './pedestrians.js';
import { WantedSystem, PoliceManager } from './police.js';
import { Combat } from './combat.js';
import { MissionRunner } from './missions.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave, clearSave, hasSave } from './save.js';
import { stageShot, armShotReady } from './shots.js';

const SPAWN = [20, 20]; // Neon Plaza, where Rook starts (and respawns)
const GIVER_POS = [40, -120]; // Marla's office
const NEAR_CAR_DIST = 5.5; // how close the player must be to enter a car
const NEAR_GIVER_DIST = 5; // how close to Marla to start a mission
const PLAYER_RADIUS = 0.6;
const CAR_PUSH_DIST = 2.8; // on-foot player is pushed out of cars this far

// ---------------------------------------------------------------------------
// The player on foot
// ---------------------------------------------------------------------------

class Player {
  constructor(scene) {
    this.scene = scene;
    this.x = SPAWN[0];
    this.z = SPAWN[1];
    this.heading = 0;
    this.health = CONFIG.playerHealth;
    this.speed = 0;
    this.walkPhase = 0;
    this.lastDamageAt = -999;
    const mesh = buildPersonMesh(0xff7f2a, 0x22303e, 0xe8b98a);
    this.group = mesh.group;
    this.legL = mesh.legL;
    this.legR = mesh.legR;
    this.armL = mesh.armL;
    this.armR = mesh.armR;
    // Rook's cap.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.16, 0.46),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    cap.position.y = 2.02;
    this.group.add(cap);
    this.group.position.set(this.x, 0, this.z);
    scene.add(this.group);
  }

  /** Walk toward (moveX, moveZ) at walk/sprint speed; animate the limbs. */
  update(dt, moveX, moveZ, sprint, city, cars) {
    const len = Math.hypot(moveX, moveZ);
    const targetSpeed = len > 0.01 ? (sprint ? CONFIG.playerSpeed : CONFIG.playerWalkSpeed) : 0;
    this.speed += clamp(targetSpeed - this.speed, -30 * dt, 30 * dt);
    if (len > 0.01) {
      const want = Math.atan2(moveX, moveZ);
      this.heading = turnToward(this.heading, want, 10 * dt);
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
    }
    [this.x, this.z] = city.resolveCollisions(this.x, this.z, PLAYER_RADIUS);
    // Soft push out of cars so the player can't clip through them.
    for (const car of cars) {
      const d = dist2D(this.x, this.z, car.x, car.z);
      if (d < CAR_PUSH_DIST && d > 0.01) {
        const push = CAR_PUSH_DIST - d;
        this.x += ((this.x - car.x) / d) * push;
        this.z += ((this.z - car.z) / d) * push;
      }
    }
    this.walkPhase += dt * this.speed * 1.6;
    const swing = Math.sin(this.walkPhase) * (this.speed > 0.5 ? 0.6 : 0);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.7;
    this.armR.rotation.x = swing * 0.7;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
  }

  /** Move the player back to the plaza, unharmed and visible. */
  resetToSpawn() {
    this.health = CONFIG.playerHealth;
    this.x = SPAWN[0];
    this.z = SPAWN[1];
    this.group.position.set(this.x, 0, this.z);
    this.group.visible = true;
  }
}

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      900,
    );
    this.clock = new THREE.Clock();
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.city = new City(this.scene);
    this.traffic = new TrafficManager(this.scene, this.city);
    this.peds = new PedestrianManager(this.scene, this.city);
    this.wanted = new WantedSystem();
    this.police = new PoliceManager(this.scene, this.city);
    this.combat = new Combat(this.scene);
    this.missions = new MissionRunner(this.scene);
    this.player = new Player(this.scene);

    this.state = 'menu'; // menu | playing | paused | busted | wasted
    this.money = 0;
    this.totalEarned = 0;
    this.carsStolen = 0;
    this.inCar = null;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.camMode = 0; // 0 near, 1 far, 2 top
    this.time = 0;
    this.crimeTimer = 0;
    this.prevAlive = 0;
    this.allDoneShown = false;
    this.shotMode = null;

    this.bindMissionHooks();
    this.hud._onContinue = () => this.startGame(true);
    this.hud._onNewGame = () => this.startGame(false);

    window.addEventListener('resize', () => this.onResize());
    this.hud.showStart(hasSave());
    this.hud.setVisible(false);
    this.bindShotMode();
    // Screenshot mode: skip the menu and drop straight into the scene.
    if (this.shotMode === 'start') {
      armShotReady(50);
    } else if (this.shotMode) {
      setTimeout(() => {
        if (this.state === 'menu') this.startGame(false);
      }, 400);
    }
    this.renderer.setAnimationLoop(() => this.frame());
  }

  bindMissionHooks() {
    this.missions.onMissionComplete = (mission, reward) => {
      this.money += reward;
      this.totalEarned += reward;
      this.audio.missionDone();
      this.hud.toast(`Mission complete: ${mission.title}  +$${reward}`);
      this.saveGame();
      if (this.missions.allDone() && !this.allDoneShown) {
        this.allDoneShown = true;
        setTimeout(() => {
          if (this.state === 'playing') {
            this.state = 'paused';
            this.hud.showAllMissionsDone(() => {
              this.state = 'playing';
              this.hud.hideMenu();
            });
          }
        }, 2500);
      }
    };
    this.missions.onEnemySpawn = (spots) => {
      this.combat.spawnEnemies(spots);
      this.prevAlive = this.combat.aliveCount();
    };
    this.missions.onWantedBump = () => {
      this.wanted.addStars(2, 'mission heat');
      this.hud.toast('The harbour patrol is onto you — 2 stars!');
    };
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  bindShotMode() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) this.shotMode = shot;
  }

  // --- starting, saving, respawning --------------------------------------

  startGame(continueSave) {
    this.audio.ensure();
    this.audio.click();
    if (continueSave) {
      const data = loadSave();
      if (data) this.applySaveData(data);
    } else {
      clearSave();
      this.money = 0;
      this.totalEarned = 0;
      this.carsStolen = 0;
      this.player.health = CONFIG.playerHealth;
      this.player.x = SPAWN[0];
      this.player.z = SPAWN[1];
      this.missions.missionIndex = 0;
      this.missions.missionsDone = 0;
      this.missions.active = false;
    }
    this.state = 'playing';
    this.hud.hideMenu();
    this.hud.setVisible(true);
    if (this.shotMode) stageShot(this.shotMode, this);
  }

  applySaveData(data) {
    this.money = data.money || 0;
    this.totalEarned = data.totalEarned || 0;
    this.carsStolen = data.carsStolen || 0;
    this.player.health = data.health || CONFIG.playerHealth;
    this.player.x = data.playerX ?? SPAWN[0];
    this.player.z = data.playerZ ?? SPAWN[1];
    this.player.group.position.set(this.player.x, 0, this.player.z);
    this.missions.applySave(data);
    this.hud.toast('Save loaded — welcome back, Rook.');
  }

  saveGame() {
    writeSave({
      money: this.money,
      health: this.player.health,
      missionIndex: this.missions.missionIndex,
      missionsDone: this.missions.missionsDone,
      cashCollected: this.missions.cashTaken,
      player: this.player,
      totalEarned: this.totalEarned,
      carsStolen: this.carsStolen,
    });
  }

  /** After a bust or a trip to the hospital: pay the fine, start over at the plaza. */
  respawn(reason) {
    const fine = reason === 'busted' ? CONFIG.bustedFine : CONFIG.wastedFine;
    this.money = Math.max(0, this.money - fine);
    this.wanted.clear();
    this.combat.clearEnemies();
    this.player.resetToSpawn();
    if (this.inCar) {
      this.inCar.stolen = false;
      this.inCar = null;
    }
    this.state = 'playing';
    this.hud.hideMenu();
    this.saveGame();
  }

  commitCrime(stars) {
    this.wanted.addStars(stars, 'crime');
    this.crimeTimer = 0;
  }

  damagePlayer(amount, source) {
    if (this.state !== 'playing') return;
    this.player.health -= amount;
    this.player.lastDamageAt = this.time;
    this.hud.damageFlash();
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.audio.busted();
      this.state = 'wasted';
      this.hud.showWasted(() => this.respawn('wasted'));
    }
  }

  // --- interactions ------------------------------------------------------

  tryEnterCar() {
    const car = this.traffic.nearestCar(this.player.x, this.player.z, NEAR_CAR_DIST);
    if (!car) return false;
    const wasParked = car.parked;
    this.inCar = car;
    car.stolen = true;
    car.speed = 0;
    this.player.group.visible = false;
    if (!wasParked) {
      this.carsStolen += 1;
      this.commitCrime(1);
      this.hud.toast('Car stolen! Wanted level up — lose the cops!');
      this.audio.denied();
      this.peds.scareNear(car.x, car.z, 15);
    } else {
      this.audio.click();
    }
    return true;
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    car.stolen = false;
    car.parked = true;
    car.traffic = false;
    car.speed = 0;
    // Step out on the driver's side.
    this.player.x = car.x + Math.cos(car.heading) * 3.2;
    this.player.z = car.z - Math.sin(car.heading) * 3.2;
    [this.player.x, this.player.z] = this.city.resolveCollisions(
      this.player.x,
      this.player.z,
      PLAYER_RADIUS,
    );
    this.player.group.position.set(this.player.x, 0, this.player.z);
    this.player.group.visible = true;
    this.inCar = null;
    this.audio.click();
  }

  /** Build the raycast targets for the pistol: living enemies + pedestrians. */
  shootTargets() {
    const targets = [];
    for (const enemy of this.combat.enemies) {
      if (enemy.dead) continue;
      targets.push({
        mesh: enemy.group,
        x: enemy.x,
        z: enemy.z,
        onHit: () => {
          if (enemy.takeDamage(CONFIG.pistolDamage)) {
            this.commitCrime(1);
            this.missions.onEnemyKilled();
            this.hud.toast('Kestrel crew member down');
          }
        },
      });
    }
    for (const ped of this.peds.peds) {
      if (ped.state === 'down') continue;
      targets.push({
        mesh: ped.group,
        x: ped.x,
        z: ped.z,
        onHit: () => {
          ped.knockDown();
          this.commitCrime(1);
          this.peds.scareNear(ped.x, ped.z, 18);
          this.hud.toast('Pedestrian down — the police noticed!');
        },
      });
    }
    return targets;
  }

  /** Build the melee targets for a punch. Same victims, no mesh needed. */
  punchTargets() {
    const targets = [];
    for (const enemy of this.combat.enemies) {
      if (enemy.dead) continue;
      targets.push({
        x: enemy.x,
        z: enemy.z,
        onPunch: () => {
          if (enemy.takeDamage(CONFIG.punchDamage)) {
            this.commitCrime(1);
            this.missions.onEnemyKilled();
          }
        },
      });
    }
    for (const ped of this.peds.peds) {
      if (ped.state === 'down') continue;
      targets.push({
        x: ped.x,
        z: ped.z,
        onPunch: () => {
          ped.knockDown();
          this.commitCrime(1);
          this.peds.scareNear(ped.x, ped.z, 18);
        },
      });
    }
    return targets;
  }

  // --- per-frame ----------------------------------------------------------

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const input = this.input;
    const mouse = input.consumeMouse();

    if (this.state === 'menu') {
      // Slow cinematic orbit behind the title screen.
      this.camYaw += dt * 0.05;
      this.updateCamera(dt, true);
      this.traffic.update(dt);
      this.peds.update(dt, 0, 0, false);
      this.renderer.render(this.scene, this.camera);
      input.endFrame();
      return;
    }

    if (this.state === 'playing') {
      this.updatePlaying(dt, mouse);
    }

    // In pause / busted / wasted the world is visible but the action freezes.
    if (this.state === 'paused' || this.state === 'busted' || this.state === 'wasted') {
      this.updateCamera(dt, false);
      this.renderer.render(this.scene, this.camera);
      input.endFrame();
      return;
    }

    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }

  updatePlaying(dt, mouse) {
    const input = this.input;
    // Camera look.
    this.camYaw -= mouse.dx * 0.0032;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.0022, 0.05, 1.1);
    if (input.wasPressed('KeyC')) {
      this.camMode = (this.camMode + 1) % 3;
      this.audio.click();
    }
    if (input.wasPressed('KeyM')) {
      this.audio.setMuted(!this.audio.muted);
      this.hud.toast(this.audio.muted ? 'Sound muted' : 'Sound on');
    }
    if (input.wasPressed('KeyH')) {
      this.state = 'paused';
      this.hud.showHelp(() => {
        this.state = 'playing';
        this.hud.hideMenu();
      });
      return;
    }
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      this.pauseGame();
      return;
    }
    this.audio.ensure();

    const px = this.inCar ? this.inCar.x : this.player.x;
    const pz = this.inCar ? this.inCar.z : this.player.z;
    const playerSpeed = this.inCar ? Math.abs(this.inCar.speed) : Math.abs(this.player.speed);

    // --- enter / exit / mission start ---
    if (input.wasPressed('KeyE')) this.handleInteract();

    // --- driving / walking ---
    if (this.inCar) {
      this.updateDriving(dt);
    } else {
      this.updateOnFoot(dt, mouse, px, pz);
    }

    // --- world life ---
    this.traffic.update(dt);
    const threatActive = this.wanted.stars > 0;
    this.peds.update(dt, px, pz, threatActive || this.inCar !== null);
    this.combat.update(dt);
    this.updateEnemies(dt, px, pz);

    // --- missions ---
    const events = this.missions.update(dt, {
      px,
      pz,
      inCar: !!this.inCar,
      car: this.inCar,
    });
    for (const event of events) {
      if (event === 'cash') {
        this.money += CONFIG.cashBundleValue;
        this.totalEarned += CONFIG.cashBundleValue;
        this.audio.pickup();
        this.hud.toast(`Cash found! +$${CONFIG.cashBundleValue}`);
      }
    }

    // --- wanted + police ---
    const anyNear = this.police.update(dt, this.wanted, px, pz, !!this.inCar, playerSpeed, () => {
      this.audio.busted();
      this.state = 'busted';
      this.hud.showBusted(() => this.respawn('busted'));
    });
    this.wanted.update(dt, anyNear, this.crimeTimer === 0);
    this.crimeTimer += dt;
    if (this.crimeTimer > 1) this.crimeTimer = 1;
    this.audio.setSiren(this.wanted.stars > 0, dt);

    // Keep the streets full.
    if (Math.random() < dt * 0.05) this.traffic.respawnFar(px, pz);

    // --- camera + HUD ---
    this.updateCamera(dt, false);
    this.hud.update(dt, this.hudState(px, pz));
  }

  /** Open the pause menu (Resume / Save / Quit to Title). */
  pauseGame() {
    this.state = 'paused';
    this.hud.showPause(
      () => {
        this.state = 'playing';
        this.hud.hideMenu();
      },
      () => {
        this.saveGame();
        this.hud.toast('Game saved');
      },
      () => {
        this.saveGame();
        this.state = 'menu';
        this.hud.setVisible(false);
        this.hud.showStart(hasSave());
      },
    );
  }

  /** E key: exit a car, talk to Marla, or get into the nearest car. */
  handleInteract() {
    if (this.inCar) {
      this.exitCar();
      return;
    }
    const nearGiver =
      !this.missions.active &&
      !this.missions.allDone() &&
      dist2D(this.player.x, this.player.z, GIVER_POS[0], GIVER_POS[1]) < NEAR_GIVER_DIST;
    if (nearGiver) {
      this.missions.startMission();
      this.audio.missionDone();
      return;
    }
    this.tryEnterCar();
  }

  /** One driving step, including police rams. */
  updateDriving(dt) {
    // Screenshot mode autopilot: keep the car cruising down the road.
    const axes =
      this.shotMode === 'drive' ? { forward: 1, strafe: 0 } : this.input.moveAxes();
    this.inCar.updateDrive(dt, axes.forward, -axes.strafe, this.city);
    this.audio.setEngine(Math.abs(this.inCar.speed) / CONFIG.carMaxSpeed, true);
    const ram = this.police.carCollision(this.inCar.x, this.inCar.z, 3.6);
    if (ram) {
      this.inCar.speed *= 0.92;
      this.camPitch += (Math.random() - 0.5) * 0.01;
    }
  }

  /** One on-foot step: move, shoot, punch, reload, and slowly heal when calm. */
  updateOnFoot(dt, mouse, px, pz) {
    const input = this.input;
    const axes = input.moveAxes();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    // Forward on screen = away from the camera.
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    const fwdX = -sin;
    const fwdZ = -cos;
    const rightX = cos;
    const rightZ = -sin;
    const moveX = fwdX * axes.forward + rightX * axes.strafe;
    const moveZ = fwdZ * axes.forward + rightZ * axes.strafe;
    this.player.update(dt, moveX, moveZ, sprint, this.city, this.traffic.cars);
    this.audio.setEngine(0, false);

    if (mouse.clicked) {
      const result = this.combat.shoot(this.camera, this.shootTargets());
      if (result === 'hit' || result === 'miss') {
        this.audio.gunshot();
        if (result === 'miss') this.peds.scareNear(px, pz, 14);
        if (result === 'hit') this.commitCrime(0); // crime already counted per target
      } else if (result === 'empty') {
        this.audio.denied();
        this.hud.toast('Out of ammo — press R to reload');
      }
    }
    if (input.wasPressed('KeyF')) {
      const hit = this.combat.punch(px, pz, this.punchTargets());
      this.audio.punch();
      if (hit) this.peds.scareNear(px, pz, 12);
    }
    if (input.wasPressed('KeyR')) {
      if (this.combat.reload()) {
        this.audio.click();
        this.hud.toast('Reloaded');
      }
    }
    // Slow health regen when calm and unhurt for a while.
    const calm =
      this.wanted.stars === 0 &&
      this.time - this.player.lastDamageAt > 10 &&
      this.player.health < CONFIG.playerHealth;
    if (calm) {
      this.player.health = Math.min(CONFIG.playerHealth, this.player.health + 2 * dt);
    }
  }

  /** Enemies shoot back; a hit lands with range-based probability. */
  updateEnemies(dt, px, pz) {
    for (const enemy of this.combat.enemies) {
      if (enemy.dead) continue;
      const fired = enemy.update(dt, this.city, px, pz, this.state === 'playing');
      if (fired) {
        this.audio.gunshot();
        const d = dist2D(enemy.x, enemy.z, px, pz);
        const hitChance = clamp(0.45 - d / 120, 0.08, 0.4);
        if (Math.random() < hitChance) this.damagePlayer(CONFIG.enemyDamage, 'enemy');
      }
    }
    this.prevAlive = this.combat.aliveCount();
  }

  /** The full HUD state, built fresh each frame. */
  hudState(px, pz) {
    const step = this.missions.currentStep();
    let objectivePos = null;
    if (this.missions.active && step && step.pos) {
      objectivePos = [step.pos[0], step.pos[2]];
    } else if (!this.missions.active && !this.missions.allDone()) {
      objectivePos = [GIVER_POS[0], GIVER_POS[1]];
    }
    const cashSpots = [];
    CASH_SPOTS.forEach(([x, z], i) => {
      if (!this.missions.cashTaken.has(i)) cashSpots.push({ x, z });
    });
    let prompt = '';
    if (!this.inCar) {
      const nearGiver =
        !this.missions.active &&
        !this.missions.allDone() &&
        dist2D(this.player.x, this.player.z, GIVER_POS[0], GIVER_POS[1]) < NEAR_GIVER_DIST;
      if (nearGiver) {
        prompt = `Press E — Talk to Marla, start "${this.missions.currentMission().title}"`;
      } else {
        const car = this.traffic.nearestCar(this.player.x, this.player.z, NEAR_CAR_DIST);
        if (car) prompt = car.parked ? 'Press E — Get in your car' : 'Press E — Steal this car';
      }
    } else {
      prompt = 'Press E — Exit car';
    }
    return {
      health: this.player.health,
      money: this.money,
      wanted: this.wanted.stars,
      objective: this.missions.objectiveText(),
      objectiveDist: this.missions.distanceToObjective(px, pz),
      objectivePos,
      prompt,
      banner: this.missions.banner,
      bannerTimer: this.missions.bannerTimer,
      inCar: !!this.inCar,
      carSpeed: this.inCar ? this.inCar.speed : 0,
      ammo: this.combat.ammo,
      ammoReserve: this.combat.ammoReserve,
      cashSpots,
      trafficCars: this.traffic.cars.filter((c) => !c.stolen),
      policeCars: this.police.cars,
      enemies: this.combat.enemies.filter((e) => !e.dead),
      px,
      pz,
      heading: this.inCar ? this.inCar.heading : this.player.heading,
    };
  }

  /** Chase camera (or orbit in the menu): follows the player, pulls in at walls. */
  updateCamera(dt, menuMode) {
    const target = this.inCar
      ? new THREE.Vector3(this.inCar.x, 1.6, this.inCar.z)
      : new THREE.Vector3(this.player.x, 1.7, this.player.z);
    let dist = this.camDist;
    let yaw = this.camYaw;
    let pitch = this.camPitch;
    if (menuMode) {
      dist = 95;
      pitch = 0.5;
      target.set(0, 10, 0);
    } else if (this.camMode === 1) {
      dist = 14;
    } else if (this.camMode === 2) {
      dist = 26;
      pitch = 1.0;
    }
    if (this.inCar && !menuMode) {
      // Chase cam follows the car's heading, blended with the mouse yaw.
      const carYaw = Math.atan2(Math.sin(this.inCar.heading), Math.cos(this.inCar.heading));
      yaw = wrapAngle(carYaw + Math.PI + (this.camYaw - (carYaw + Math.PI)) * 0.35);
      pitch = Math.max(pitch, 0.22);
    }
    // Pull the camera in if a building is in the way.
    for (let attempt = 0; attempt < 3; attempt++) {
      const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
      const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
      let blocked = false;
      for (const box of this.city.colliders) {
        if (cx > box.minX - 0.5 && cx < box.maxX + 0.5 && cz > box.minZ - 0.5 && cz < box.maxZ + 0.5) {
          blocked = true;
          break;
        }
      }
      if (!blocked) break;
      dist *= 0.6;
    }
    const cy = target.y + Math.sin(pitch) * dist;
    const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    this.camera.position.set(cx, Math.max(cy, 1.2), cz);
    this.camera.lookAt(target);
  }
}

// Boot.
const game = new Game();
window.__neonBay = game;
