// Missions and free-roam pickups.
// The mission runner tracks the current story mission and step, shows a
// world beacon at the objective, and pays out on completion. The main
// loop owns the money and the wanted level; this module only reports
// what happened through events and callbacks.

import * as THREE from 'three';
import { MISSIONS, CASH_SPOTS, CONFIG } from './config.js';
import { dist2D } from './util.js';

const GIVER_POS = [40, 0, -120]; // Marla's office (idle beacon target)
const DOCKYARD_BASE = [-120, 120]; // where the Kestrel crew spawns
const CASH_PICKUP_RADIUS = 2.2;

export class MissionRunner {
  constructor(scene) {
    this.scene = scene;
    this.missionIndex = 0;
    this.missionsDone = 0;
    this.stepIndex = 0;
    this.active = false;
    this.eliminated = 0;
    this.banner = ''; // short text shown when a step changes
    this.bannerTimer = 0;
    this.onMissionComplete = null; // (mission, reward) => void
    this.onStepComplete = null; // () => void
    this.onEnemySpawn = null; // (positions) => void
    this.onWantedBump = null; // () => void

    // Objective beacon: a glowing pillar + a floating diamond.
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd24a,
      transparent: true,
      opacity: 0.35,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 40, 16, 1, true), beaconMat);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd24a }),
    );
    this.gem.visible = false;
    scene.add(this.gem);
    this.gemPhase = 0;

    // Cash bundles: spinning green stacks around the city.
    this.cashMeshes = [];
    this.cashTaken = new Set();
    const cashGeo = new THREE.BoxGeometry(1.4, 0.5, 1.0);
    const cashMat = new THREE.MeshLambertMaterial({
      color: 0x37c978,
      emissive: 0x1a7a3a,
      emissiveIntensity: 0.5,
    });
    for (let i = 0; i < CASH_SPOTS.length; i++) {
      const mesh = new THREE.Mesh(cashGeo, cashMat);
      mesh.position.set(CASH_SPOTS[i][0], 0.9, CASH_SPOTS[i][1]);
      scene.add(mesh);
      this.cashMeshes.push(mesh);
    }
  }

  currentMission() {
    return MISSIONS[this.missionIndex] || null;
  }

  currentStep() {
    const mission = this.currentMission();
    if (!mission) return null;
    return mission.steps[this.stepIndex] || null;
  }

  allDone() {
    return this.missionIndex >= MISSIONS.length;
  }

  /** Begin the current mission. False when there is none or one is running. */
  startMission() {
    const mission = this.currentMission();
    if (!mission || this.active) return false;
    this.active = true;
    this.stepIndex = 0;
    this.eliminated = 0;
    this.showBanner(`MISSION: ${mission.title} — ${mission.giver}`);
    this.applyStepEffects();
    return true;
  }

  showBanner(text, seconds = 4) {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  /** Side effects when a step begins: spawn enemies, or raise the heat. */
  applyStepEffects() {
    const step = this.currentStep();
    if (!step) return;
    if (step.type === 'eliminate' && this.onEnemySpawn) {
      // Kestrel crew positions fanned out around the dockyard.
      const spots = [];
      for (let i = 0; i < step.count; i++) {
        spots.push([
          DOCKYARD_BASE[0] + ((i % 3) * 14 - 14 + (i * 7) % 9),
          DOCKYARD_BASE[1] + (Math.floor(i / 3) * 16 - 8),
        ]);
      }
      this.onEnemySpawn(spots);
    }
    if (step.type === 'deliver' && this.onWantedBump) {
      this.onWantedBump();
    }
  }

  /** Called when an enemy dies during an eliminate step. */
  onEnemyKilled() {
    const step = this.currentStep();
    if (!step || step.type !== 'eliminate') return;
    this.eliminated += 1;
    if (this.eliminated >= step.count) this.completeStep();
  }

  completeStep() {
    const mission = this.currentMission();
    this.stepIndex += 1;
    if (this.onStepComplete) this.onStepComplete();
    if (this.stepIndex >= mission.steps.length) {
      this.completeMission();
    } else {
      this.showBanner('Objective updated');
      this.applyStepEffects();
    }
  }

  completeMission() {
    const mission = this.currentMission();
    const reward = CONFIG.missionRewards[this.missionIndex] || 200;
    this.active = false;
    this.missionsDone += 1;
    this.missionIndex += 1;
    this.stepIndex = 0;
    this.eliminated = 0;
    this.showBanner(`MISSION COMPLETE: ${mission.title} — +$${reward}`, 5);
    if (this.onMissionComplete) this.onMissionComplete(mission, reward);
  }

  /** Where the beacon should point right now (null = hidden). */
  beaconTarget() {
    const step = this.currentStep();
    if (this.active && step && step.pos) return step.pos;
    if (!this.active && !this.allDone()) return GIVER_POS;
    return null;
  }

  /**
   * Per-frame mission logic. `ctx` carries the live game state the runner
   * needs: player position, whether the player is in a car, and the car.
   * Returns event strings for the main loop to act on ('cash' per pickup).
   */
  update(dt, ctx) {
    const events = [];
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.gemPhase += dt;

    // Spin the cash bundles; collect any the player walks into.
    for (let i = 0; i < this.cashMeshes.length; i++) {
      const mesh = this.cashMeshes[i];
      if (this.cashTaken.has(i)) {
        mesh.visible = false;
        continue;
      }
      mesh.rotation.y += dt * 2;
      mesh.position.y = 0.9 + Math.sin(this.gemPhase * 2 + i) * 0.15;
      if (dist2D(ctx.px, ctx.pz, CASH_SPOTS[i][0], CASH_SPOTS[i][1]) < CASH_PICKUP_RADIUS) {
        this.cashTaken.add(i);
        mesh.visible = false;
        events.push('cash');
      }
    }

    // Beacon follows the current objective position.
    const target = this.beaconTarget();
    if (target) {
      this.beacon.visible = true;
      this.gem.visible = true;
      this.beacon.position.set(target[0], 20, target[2]);
      this.gem.position.set(target[0], 5 + Math.sin(this.gemPhase * 2.5) * 0.5, target[2]);
      this.gem.rotation.y += dt * 2;
    } else {
      this.beacon.visible = false;
      this.gem.visible = false;
    }

    // Step completion checks.
    const step = this.currentStep();
    if (!this.active || !step) return events;
    if (step.type === 'steal' && ctx.inCar) {
      this.completeStep();
    } else if (
      (step.type === 'goto' ||
        step.type === 'pickup' ||
        step.type === 'deliver' ||
        step.type === 'return') &&
      step.pos
    ) {
      const reached = dist2D(ctx.px, ctx.pz, step.pos[0], step.pos[2]) < step.radius;
      if (reached && (!step.drive || ctx.inCar)) this.completeStep();
    }
    return events;
  }

  /** Text for the HUD objective line. */
  objectiveText() {
    if (this.allDone()) return 'All missions complete — Neon Bay is yours. Free roam!';
    const mission = this.currentMission();
    if (!this.active) {
      return `Go to Marla's office (gold beacon) and press E to start: ${mission.title}`;
    }
    const step = this.currentStep();
    if (!step) return mission.title;
    if (step.type === 'eliminate') {
      const remaining = step.count - this.eliminated;
      return `${mission.title}: ${step.text.replace(/\(\d+ remaining\)/, `(${remaining} remaining)`)}`;
    }
    return `${mission.title}: ${step.text}`;
  }

  /** Distance in metres to the current objective (null when there is none). */
  distanceToObjective(px, pz) {
    const step = this.currentStep();
    if (this.active && step && step.pos) {
      return Math.round(dist2D(px, pz, step.pos[0], step.pos[2]));
    }
    if (!this.active && !this.allDone()) {
      return Math.round(dist2D(px, pz, GIVER_POS[0], GIVER_POS[2]));
    }
    return null;
  }

  /** Restore mission progress and collected cash from a save. */
  applySave(data) {
    if (!data) return;
    this.missionIndex = data.missionIndex || 0;
    this.missionsDone = data.missionsDone || 0;
    if (Array.isArray(data.cashCollected)) {
      for (const i of data.cashCollected) this.cashTaken.add(i);
    }
  }
}
