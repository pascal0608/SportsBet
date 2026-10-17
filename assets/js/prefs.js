const PREFS_KEY = 'sports-bet-preferences';
const SELECTION_KEY = 'sports-bet-selection';
const DEFAULTS = { sound: false, stake: 1 };

const read = (storage, key) => {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
};
const write = (storage, key, value) => {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* préférence non mémorisée */ }
};

export const loadPrefs = () => ({ ...DEFAULTS, ...read(localStorage, PREFS_KEY) });
export const savePrefs = prefs => write(localStorage, PREFS_KEY, prefs);

export const loadSelection = () => {
  const s = read(sessionStorage, SELECTION_KEY);
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
};
export const saveSelection = selected => write(sessionStorage, SELECTION_KEY, selected);
