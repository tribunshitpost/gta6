// Save / load through localStorage. Stores progression, money and the
// player's position — never anything sensitive. Every read is defensive:
// a corrupt or foreign value under the save key loads as "no save".

import { CONFIG } from './config.js';

const SAVE_VERSION = 1;

/** Load the saved game, or null when there is no (valid) save. */
export function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return null;
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
