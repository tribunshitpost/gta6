// HUD: all DOM overlay — health, money, wanted stars, objective,
// minimap canvas, prompts, damage flash, and the menu screens.
// The 3D world never touches the DOM; this module owns it.

import { CONFIG, PLACES } from './config.js';
import { fmtMoney, fmtSpeed } from './util.js';

const MINIMAP_SIZE = 180; // canvas pixels (square)
const MAX_WANTED_STARS = 5;

const START_HTML = `
  <p class="tagline">An open-world crime story in a sun-soaked bay city.</p>
  <p>You are <b>Rook</b>, a driver fresh off the bus in Neon Bay. Marla Voss
  runs the city's quiet jobs — and she needs a driver she can trust.
  Steal cars, outrun the police, run her missions, and make the city yours.</p>
  <div class="controls">
    <div><b>W A S D</b> — move / drive</div>
    <div><b>Mouse</b> — look (click to lock)</div>
    <div><b>E</b> — enter / exit car, steal car, start mission</div>
    <div><b>Click</b> — shoot &nbsp; <b>F</b> — punch &nbsp; <b>R</b> — reload</div>
    <div><b>Shift</b> — sprint &nbsp; <b>C</b> — camera &nbsp; <b>P</b> — pause</div>
    <div><b>M</b> — mute &nbsp; <b>H</b> — help</div>
  </div>
  <p class="hint">Stealing a car or hurting someone raises your wanted level.
  Lay low and the heat fades. Find the green cash bundles around the city.</p>
`;

const HELP_HTML = `
  <div class="controls">
    <div><b>W A S D</b> — move on foot / drive a car</div>
    <div><b>Mouse</b> — look around (click the game to lock the mouse)</div>
    <div><b>E</b> — get in / out of a car, steal a parked or traffic car, talk to Marla</div>
    <div><b>Left click</b> — shoot your pistol (aim with the crosshair)</div>
    <div><b>F</b> — punch &nbsp; <b>R</b> — reload &nbsp; <b>Shift</b> — sprint</div>
    <div><b>C</b> — switch camera &nbsp; <b>P</b> / <b>Esc</b> — pause &nbsp; <b>M</b> — mute</div>
  </div>
  <p>Follow the gold beacon to Marla's office to start a mission. Green bundles
  are hidden cash ($25 each). Stealing and violence raise your wanted level —
  police cars ram you, foot cops try to bust you. Stay quiet and the stars fade.</p>
`;

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.visible = true;
    this.minimap = document.getElementById('minimap');
    this.mm = this.minimap.getContext('2d');
    this.healthFill = document.getElementById('health-fill');
    this.healthText = document.getElementById('health-text');
    this.moneyText = document.getElementById('money');
    this.starsEl = document.getElementById('stars');
    this.objectiveEl = document.getElementById('objective');
    this.objectiveText = document.getElementById('objective-text');
    this.objectiveDist = document.getElementById('objective-dist');
    this.promptEl = document.getElementById('prompt');
    this.bannerEl = document.getElementById('banner');
    this.speedEl = document.getElementById('speed');
    this.ammoEl = document.getElementById('ammo');
    this.crosshair = document.getElementById('crosshair');
    this.flash = document.getElementById('damage-flash');
    this.toastEl = document.getElementById('toast');
    this.menuEl = document.getElementById('menu');
    this.menuTitle = document.getElementById('menu-title');
    this.menuBody = document.getElementById('menu-body');
    this.menuButtons = document.getElementById('menu-buttons');
    this.toastTimer = 0;
    this.bannerText = '';
  }

  setVisible(v) {
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
  }

  // --- menus -----------------------------------------------------------

  showMenu(html, buttons) {
    this.menuEl.classList.remove('hidden');
    this.menuBody.innerHTML = html;
    this.menuButtons.innerHTML = '';
    for (const button of buttons) {
      const btn = document.createElement('button');
      btn.textContent = button.label;
      btn.addEventListener('click', () => button.onClick());
      this.menuButtons.appendChild(btn);
    }
  }

  hideMenu() {
    this.menuEl.classList.add('hidden');
  }

  setMenuTitle(t) {
    this.menuTitle.textContent = t;
  }

  showStart(hasSave) {
    this.setMenuTitle('NEON BAY');
    const buttons = [];
    if (hasSave) {
      buttons.push({ label: 'Continue', onClick: () => this._onContinue && this._onContinue() });
    }
    buttons.push({ label: 'New Game', onClick: () => this._onNewGame && this._onNewGame() });
    this.showMenu(START_HTML, buttons);
  }

  showPause(onResume, onSave, onQuit) {
    this.setMenuTitle('PAUSED');
    this.showMenu(
      `<p>Take a breath, Rook. The city will wait.</p>
       <p class="hint">Progress auto-saves when you finish a mission.</p>`,
      [
        { label: 'Resume', onClick: onResume },
        { label: 'Save Game', onClick: onSave },
        { label: 'Quit to Title', onClick: onQuit },
      ],
    );
  }

  showBusted(onRespawn) {
    this.setMenuTitle('BUSTED');
    this.showMenu(
      `<p>The Neon Bay police hauled you in. You paid the fine and walked free —
      minus some cash and your dignity.</p>`,
      [{ label: 'Back to the streets', onClick: onRespawn }],
    );
  }

  showWasted(onRespawn) {
    this.setMenuTitle('WASTED');
    this.showMenu(
      `<p>You woke up at St. Marina Hospital, patched up and lighter in the wallet.
      The city doesn't wait — neither should you.</p>`,
      [{ label: 'Back to the streets', onClick: onRespawn }],
    );
  }

  showHelp(onClose) {
    this.setMenuTitle('HOW TO PLAY');
    this.showMenu(HELP_HTML, [{ label: 'Close', onClick: onClose }]);
  }

  showAllMissionsDone(onClose) {
    this.setMenuTitle('NEON BAY IS YOURS');
    this.showMenu(
      `<p>You finished every job Marla had. The docks are quiet, the streets know your
      name, and the whole bay is open to you. Free roam — keep collecting cash,
      stealing cars, and outrunning the law.</p>`,
      [{ label: 'Keep playing', onClick: onClose }],
    );
  }

  // --- transient messages ----------------------------------------------

  toast(text, seconds = 3) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = seconds;
  }

  damageFlash() {
    this.flash.style.opacity = '0.55';
    setTimeout(() => {
      this.flash.style.opacity = '0';
    }, 120);
  }

  // --- per-frame update -------------------------------------------------

  update(dt, state) {
    this.updateVitals(state);
    this.updateObjective(state);
    this.updatePrompt(state);
    this.updateReadouts(state);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.add('hidden');
    }
    this.drawMinimap(state);
  }

  updateVitals(state) {
    const hp = Math.max(0, Math.round(state.health));
    this.healthFill.style.width = hp + '%';
    this.healthFill.style.background = hp > 50 ? '#37c978' : hp > 25 ? '#f2a541' : '#e84a5f';
    this.healthText.textContent = hp;
    this.moneyText.textContent = fmtMoney(state.money);
    let stars = '';
    for (let i = 0; i < MAX_WANTED_STARS; i++) stars += i < state.wanted ? '★' : '☆';
    this.starsEl.textContent = stars;
    this.starsEl.classList.toggle('hot', state.wanted > 0);
  }

  updateObjective(state) {
    // The objective line is two spans (text + distance), so update each
    // in place instead of replacing the parent's content.
    this.objectiveText.textContent = state.objective;
    this.objectiveDist.textContent = state.objectiveDist != null ? state.objectiveDist + 'm' : '';
    if (state.banner && state.bannerTimer > 0) {
      if (this.bannerText !== state.banner) {
        this.bannerText = state.banner;
        this.bannerEl.textContent = state.banner;
        this.bannerEl.classList.remove('hidden');
      }
    } else {
      this.bannerText = '';
      this.bannerEl.classList.add('hidden');
    }
  }

  updatePrompt(state) {
    if (state.prompt) {
      this.promptEl.textContent = state.prompt;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }
  }

  updateReadouts(state) {
    if (state.inCar) {
      this.speedEl.textContent = fmtSpeed(state.carSpeed);
      this.speedEl.classList.remove('hidden');
      this.ammoEl.classList.add('hidden');
      this.crosshair.classList.add('hidden');
    } else {
      this.speedEl.classList.add('hidden');
      this.ammoEl.textContent = `🔫 ${state.ammo} / ${state.ammoReserve}`;
      this.ammoEl.classList.remove('hidden');
      this.crosshair.classList.remove('hidden');
    }
  }

  // --- minimap ----------------------------------------------------------

  /** World (x, z) -> minimap canvas pixels. */
  toMap(x, z) {
    const half = CONFIG.cityHalf;
    const s = MINIMAP_SIZE;
    return [((x + half) / (half * 2)) * s, ((z + half) / (half * 2)) * s];
  }

  drawMinimap(state) {
    const g = this.mm;
    const s = MINIMAP_SIZE;
    const half = CONFIG.cityHalf;
    g.clearRect(0, 0, s, s);
    // Sea, then land (the bay is the southern strip).
    g.fillStyle = '#1d4e68';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#3a3f47';
    const [landX, landY] = this.toMap(-half, -half);
    g.fillRect(landX, landY, s, s * 0.89);
    // Roads.
    g.strokeStyle = '#565b64';
    g.lineWidth = 4;
    for (let c = -half + 40; c <= half - 40; c += 40) {
      const [x1, y1] = this.toMap(c, -half);
      const [x2, y2] = this.toMap(c, half);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      const [x3, y3] = this.toMap(-half, c);
      const [x4, y4] = this.toMap(half, c);
      g.beginPath();
      g.moveTo(x3, y3);
      g.lineTo(x4, y4);
      g.stroke();
    }
    // Named places (small purple squares).
    g.fillStyle = '#c9a0dc';
    for (const place of PLACES) {
      const [x, y] = this.toMap(place.pos[0], place.pos[1]);
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    // Uncollected cash bundles (green squares).
    g.fillStyle = '#37c978';
    for (const spot of state.cashSpots) {
      const [mx, my] = this.toMap(spot.x, spot.z);
      g.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    // Objective beacon (pulsing gold dot).
    if (state.objectivePos) {
      const [x, y] = this.toMap(state.objectivePos[0], state.objectivePos[1]);
      const pulse = 4 + Math.sin(performance.now() / 250) * 1.5;
      g.fillStyle = '#ffd24a';
      g.beginPath();
      g.arc(x, y, pulse, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7a5b00';
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
    }
    // Traffic cars (white), police (blue), enemies (red).
    g.fillStyle = '#ffffff';
    for (const car of state.trafficCars) {
      const [x, y] = this.toMap(car.x, car.z);
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.fillStyle = '#4a90e8';
    for (const car of state.policeCars) {
      const [x, y] = this.toMap(car.x, car.z);
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    g.fillStyle = '#ff3b30';
    for (const enemy of state.enemies) {
      const [x, y] = this.toMap(enemy.x, enemy.z);
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow, rotated to face the heading.
    const [px, py] = this.toMap(state.px, state.pz);
    g.save();
    g.translate(px, py);
    g.rotate(state.heading);
    g.fillStyle = '#ffd24a';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.strokeStyle = '#000';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
    // North marker.
    g.fillStyle = '#ffffff';
    g.font = 'bold 10px sans-serif';
    g.fillText('N', 4, 12);
  }
}
