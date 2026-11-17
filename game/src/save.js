// Save game: money, story progress and settings, in localStorage.
// A missing or corrupt save just means a fresh start.

const KEY = 'velora-bay-save-v1';

export function defaultSave() {
  return { money: 250, missionIndex: 0, sideJobsDone: 0, bestScore: 0, muted: false };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return { ...defaultSave(), ...data };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the game plays on without saving.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
