// Save / load through localStorage. Stores progression, money and the
// player's position — never anything sensitive. Every read is defensive:
// a corrupt or foreign value under the save key loads as "no save".
// Revision: save format v2 — the loader now also rejects saves with a
// non-numeric money value, and every write stamps the game build so an
// old save can never be mistaken for a current one.

import { CONFIG } from './config.js';

const SAVE_VERSION = 2;
const GAME_BUILD = 'neon-bay-1.1';

/** Load the saved game, or null when there is no (valid) save. */
export function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return null;
    if (typeof data.money !== 'number' || data.money < 0) return null;
    if (typeof data.missionIndex !== 'number' || data.missionIndex < 0) return null;
    return data;
  } catch {
    return null;
  }
}

/** Write the current run state to localStorage. Returns false on failure. */
export function writeSave(state) {
  try {
    const data = {
      version: SAVE_VERSION,
      build: GAME_BUILD,
      money: Math.floor(state.money),
      health: Math.round(state.health),
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      cashCollected: [...state.cashCollected],
      playerX: state.player.x,
      playerZ: state.player.z,
      totalEarned: Math.floor(state.totalEarned || 0),
      carsStolen: state.carsStolen || 0,
      savedAt: Date.now(),
    };
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Delete the save (used when starting a genuinely new game). */
export function clearSave() {
  try {
    localStorage.removeItem(CONFIG.saveKey);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** True when a loadable save exists. */
export function hasSave() {
  return loadSave() !== null;
}
