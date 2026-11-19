// Neon Bay — versioned saves in localStorage, with autosave.
// The save shape carries a version number: if a future build changes the
// shape, load() refuses the old shape instead of misreading it.
import { CONFIG } from './config.js';

export function defaultSave() {
  return {
    version: CONFIG.saveVersion,
    cash: CONFIG.player.startCash,
    health: CONFIG.player.maxHealth,
    missionsDone: [],
    bestWanted: 0,
    carsFenced: 0,
    totalEarned: 0,
    playSeconds: 0,
    playerX: -6,
    playerZ: -6,
    savedAt: Date.now(),
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== CONFIG.saveVersion) return null;
    // Fill any missing field from the defaults so old-but-same-version
    // saves never crash the game.
    const base = defaultSave();
    for (const key of Object.keys(base)) {
      if (data[key] === undefined) data[key] = base[key];
    }
    return data;
  } catch {
    return null;
  }
}

// Returns true when the write landed, false when storage is unavailable.
export function writeSave(state) {
  try {
    const data = {
      version: CONFIG.saveVersion,
      cash: Math.round(state.cash),
      health: Math.round(state.health),
      missionsDone: [...state.missionsDone],
      bestWanted: state.bestWanted,
      carsFenced: state.carsFenced,
      totalEarned: Math.round(state.totalEarned),
      playSeconds: Math.round(state.playSeconds),
      playerX: state.player.pos.x,
      playerZ: state.player.pos.z,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(CONFIG.saveKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(CONFIG.saveKey);
    return true;
  } catch {
    return false;
  }
}
