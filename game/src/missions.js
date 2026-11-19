// Neon Bay — the story: three missions with original dialogue.
// Each mission is a small state machine: idle -> to-pickup -> to-deliver
// -> done. The marker is a tall glowing beacon plus a minimap blip, and
// every step speaks through the dialogue box. Hot Pursuit is the odd one
// out: it starts with the heat already on and ends at a hideout.
import * as THREE from 'three';
import { CONFIG, MISSIONS } from './config.js';
import { dist2D } from './util.js';

const MISSION_SPOTS = [
  // First Light: fountain pickup -> Coral Row Motel delivery.
  { pickup: CONFIG.places.fountain, deliver: CONFIG.places.coralDrop },
  // Hot Pursuit: escape to the Palmetto hideout.
  { pickup: CONFIG.places.palmettoHideout, deliver: CONFIG.places.palmettoHideout },
  // Dockside Debt: dock office pickup -> Foundry fence lot delivery.
  { pickup: CONFIG.places.dockOffice, deliver: CONFIG.places.fenceLot },
];

export class Missions {
  constructor(scene, callbacks) {
    this.scene = scene;
    this.cb = callbacks;
    this.active = null;
    this.stage = 'idle';
    this.marker = null;
    this.markerRing = null;
    this.dialogue = [];
    this.dialogueTimer = 0;
    this.currentLine = '';
    this._pulse = 0;
  }

  get activeMission() {
    return this.active === null ? null : MISSIONS[this.active];
  }

  get objectiveText() {
    if (this.active === null) return 'Press 1, 2 or 3 to start a mission';
    const m = MISSIONS[this.active];
    if (this.stage === 'pickup') return m.pickupLabel;
    if (this.stage === 'deliver') return m.deliverLabel;
    return m.title + ' — complete';
  }

  start(index, doneList) {
    if (this.active !== null) return false;
    if (index < 0 || index >= MISSIONS.length) return false;
    const m = MISSIONS[index];
    this.active = index;
    this.stage = 'pickup';
    const spots = MISSION_SPOTS[index];
    this._placeMarker(spots.pickup);
    const lines = [
      m.giver + ': "' + m.intro + '"',
      'Mission started: ' + m.title + ' — ' + m.pickupLabel,
    ];
    if (index === 1) {
      // Hot Pursuit opens with the police already after the player.
      this.cb.onHeat(2);
      lines.push('Deke: "They\'re already on us. Drive like the bay is on fire."');
    }
    this._say(lines);
    if (this.cb.onStart) this.cb.onStart(m);
    return true;
  }

  _say(lines) {
    this.dialogue = [...lines];
    this._nextLine();
  }

  _nextLine() {
    this.currentLine = this.dialogue.shift() || '';
    this.dialogueTimer = this.currentLine ? 5 : 0;
  }

  _placeMarker(place) {
    this._clearMarker();
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 30, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc94d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.set(place.x, 15, place.z);
    this.scene.add(this.marker);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(place.x, 0.15, place.z);
    this.scene.add(ring);
    this.markerRing = ring;
  }

  _clearMarker() {
    if (this.marker) { this.scene.remove(this.marker); this.marker = null; }
    if (this.markerRing) { this.scene.remove(this.markerRing); this.markerRing = null; }
  }

  // The world position the HUD arrow and minimap should point at.
  targetPos() {
    if (this.active === null) return null;
    const spots = MISSION_SPOTS[this.active];
    return this.stage === 'pickup' ? spots.pickup : spots.deliver;
  }

  update(dt, playerPos) {
    this._pulse += dt;
    if (this.marker) {
      this.marker.material.opacity = 0.2 + 0.12 * Math.sin(this._pulse * 3);
      this.marker.rotation.y += dt * 0.6;
    }
    if (this.currentLine) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this._nextLine();
    }
    if (this.active === null) return;
    const target = this.targetPos();
    if (!target) return;
    if (dist2D(playerPos.x, playerPos.z, target.x, target.z) < 5) {
      this._arrive();
    }
  }

  _arrive() {
    const m = MISSIONS[this.active];
    if (this.stage === 'pickup') {
      if (this.active === 1) {
        // Hot Pursuit has no pickup: reaching the hideout ends it.
        this._complete();
        return;
      }
      this.stage = 'deliver';
      const spots = MISSION_SPOTS[this.active];
      this._placeMarker(spots.deliver);
      const line = this.active === 0
        ? 'Mara: "Package secured. Now get it to Coral Row — no detours."'
        : 'Captain Sorren: "That\'s the money. Bring it to the Foundry, and don\'t stop for anyone."';
      this._say([line, m.deliverLabel]);
      if (this.cb.onStage) this.cb.onStage(m, 'deliver');
    } else if (this.stage === 'deliver') {
      this._complete();
    }
  }

  _complete() {
    const m = MISSIONS[this.active];
    const reward = CONFIG.economy.missionReward[this.active];
    this._clearMarker();
    this._say([m.giver + ': "' + m.doneLine + '"', 'Mission complete: +' + reward + ' dollars']);
    const finished = this.active;
    this.active = null;
    this.stage = 'idle';
    if (this.cb.onComplete) this.cb.onComplete(m, reward, finished);
  }

  // The player abandoned the mission (busted, or pressed the key again).
  abandon(reason) {
    if (this.active === null) return;
    const m = MISSIONS[this.active];
    this._clearMarker();
    this._say(['Mission failed: ' + m.title + ' — ' + reason]);
    this.active = null;
    this.stage = 'idle';
    if (this.cb.onFail) this.cb.onFail(m, reason);
  }
}
