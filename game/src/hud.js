// Neon Bay — the HUD: cash, health, wanted stars, mission objective,
// dialogue, speed, district name and a live 2D minimap drawn on canvas.
// All DOM lives in index.html; this file only writes into it.
import { CONFIG, districtAt } from './config.js';
import { money } from './util.js';

export class HUD {
  constructor() {
    this.cashEl = document.getElementById('hud-cash');
    this.healthEl = document.getElementById('hud-health');
    this.healthBar = document.getElementById('hud-health-bar');
    this.starsEl = document.getElementById('hud-stars');
    this.objectiveEl = document.getElementById('hud-objective');
    this.dialogueEl = document.getElementById('hud-dialogue');
    this.speedEl = document.getElementById('hud-speed');
    this.districtEl = document.getElementById('hud-district');
    this.ammoEl = document.getElementById('hud-ammo');
    this.toastEl = document.getElementById('hud-toast');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map ? this.map.getContext('2d') : null;
    this._toastTimer = null;
    this._lastCash = -1;
    this._lastHealth = -1;
    this._lastStars = -1;
  }

  toast(text, ms) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, ms || 3200);
  }

  // The pause overlay is a single line the game sets and clears.
  setPaused(paused, reason) {
    const el = document.getElementById('hud-paused');
    if (!el) return;
    el.style.display = paused ? 'flex' : 'none';
    if (paused && reason) el.textContent = reason;
  }

  update(state) {
    if (this.cashEl && state.cash !== this._lastCash) {
      this.cashEl.textContent = money(state.cash);
      this._lastCash = state.cash;
    }
    if (this.healthEl && state.health !== this._lastHealth) {
      this.healthEl.textContent = Math.round(state.health) + ' HP';
      if (this.healthBar) this.healthBar.style.width = Math.max(0, state.health) + '%';
      this._lastHealth = state.health;
    }
    if (this.starsEl && state.wanted !== this._lastStars) {
      this.starsEl.textContent = '\u2605'.repeat(state.wanted) + '\u2606'.repeat(5 - state.wanted);
      this.starsEl.classList.toggle('hot', state.wanted > 0);
      this._lastStars = state.wanted;
    }
    if (this.objectiveEl) this.objectiveEl.textContent = state.objective;
    if (this.dialogueEl) {
      this.dialogueEl.textContent = state.dialogue || '';
      this.dialogueEl.style.display = state.dialogue ? 'block' : 'none';
    }
    if (this.speedEl) {
      this.speedEl.textContent = state.inCar
        ? Math.round(Math.abs(state.speed) * 3.6) + ' km/h'
        : (state.running ? 'Running' : 'On foot');
    }
    if (this.districtEl) {
      this.districtEl.textContent = districtAt(state.x, state.z).name;
    }
    if (this.ammoEl) {
      this.ammoEl.textContent = state.inCar ? (state.carName || '') : ('Ammo ' + state.ammo + '/' + CONFIG.combat.maxAmmo);
    }
    this._drawMinimap(state);
  }

  // Top-down map: roads, districts, player arrow, cars, cops, marker.
  _drawMinimap(state) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const size = 168;
    const half = CONFIG.cityHalf;
    const toMap = (x, z) => [(x / half) * (size / 2) + size / 2, (z / half) * (size / 2) + size / 2];
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(10, 14, 24, 0.82)';
    ctx.fillRect(0, 0, size, size);
    // District washes.
    for (const d of CONFIG.districts) {
      const [x, y] = toMap(d.x - d.w / 2, d.z - d.h / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y, (d.w / half) * (size / 2), (d.h / half) * (size / 2));
    }
    // Roads.
    ctx.strokeStyle = 'rgba(200, 210, 230, 0.55)';
    ctx.lineWidth = 3;
    for (const a of CONFIG.avenues) {
      const [ax] = toMap(a, 0);
      ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, size); ctx.stroke();
      const [, ay] = toMap(0, a);
      ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(size, ay); ctx.stroke();
    }
    // Water to the east.
    ctx.fillStyle = 'rgba(55, 200, 255, 0.5)';
    ctx.fillRect(size - 8, 0, 8, size);
    // Mission marker.
    if (state.target) {
      const [tx, ty] = toMap(state.target.x, state.target.z);
      const pulse = 5 + Math.sin(performance.now() / 250) * 2;
      ctx.fillStyle = '#ffc94d';
      ctx.beginPath(); ctx.arc(tx, ty, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0a14';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('!', tx, ty + 3.5);
    }
    // Traffic dots, cop dots.
    for (const c of state.traffic || []) {
      const [cx, cy] = toMap(c.x, c.z);
      ctx.fillStyle = '#c8d2e6';
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    for (const c of state.cops || []) {
      const [cx, cy] = toMap(c.x, c.z);
      ctx.fillStyle = '#ff3344';
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow, rotated to face the heading.
    const [px, py] = toMap(state.x, state.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('N', 5, 12);
  }
}
