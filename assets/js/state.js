export const KEY = 'sports-bet-autonome-v1';
export const CORRUPT_KEY = KEY + '-corrompu';
export const SCHEMA_VERSION = 2;
export const STATUSES = ['PENDING', 'WON', 'LOST', 'VOID'];
export const DEFAULT_PLAYER = 'Joueur';

export const initialState = () => ({ schemaVersion: SCHEMA_VERSION, balance: 10, matches: [], tickets: [], transactions: [] });

const LEGACY_STATUS = { 'GAGNÉ': 'WON', 'PERDU': 'LOST', 'EN ATTENTE': 'PENDING', 'ANNULÉ': 'VOID' };

export function pruneOfficialResults(state) {
  if (!state.officialResults) return;
  const used = new Set(state.tickets.flatMap(t => t.picks.map(p => p.id)));
  for (const id of Object.keys(state.officialResults)) if (!used.has(id)) delete state.officialResults[id];
}

const MIGRATIONS = {
  // v1 → v2 : un ticket entièrement annulé était enregistré WON avec une cote de 1.
  1(state) {
    for (const t of state.tickets) if (t.status === 'WON' && t.odd === 1 && t.payout === t.stake) t.status = 'VOID';
    pruneOfficialResults(state);
  },
};

export function migrate(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || !Number.isFinite(state.balance)) throw Error('Invalid state');
  for (const k of ['matches', 'tickets', 'transactions']) if (!Array.isArray(state[k])) state[k] = [];
  for (const t of state.tickets) {
    t.status = LEGACY_STATUS[t.status] || t.status;
    if (typeof t.id === 'string') t.id = t.id.replace(/^SEB-/, 'BET-');
  }
  let version = Number.isInteger(state.schemaVersion) ? state.schemaVersion : 1;
  while (version < SCHEMA_VERSION) MIGRATIONS[version++](state);
  state.schemaVersion = Math.max(version, SCHEMA_VERSION);
  return state;
}

export function load(storage) {
  let raw;
  try { raw = storage.getItem(KEY); } catch { return { state: initialState(), error: 'unavailable' }; }
  if (raw == null) return { state: initialState() };
  try {
    return { state: migrate(JSON.parse(raw)) };
  } catch {
    try { storage.setItem(CORRUPT_KEY, raw); } catch { /* quota : la copie brute reste dans KEY jusqu'à la prochaine sauvegarde */ }
    return { state: initialState(), error: 'corrupt' };
  }
}

// Les marchés annexes du catalogue sont rechargés à chaque ouverture : seuls ceux d'un ticket sont conservés.
export function serializable(state) {
  const used = new Set(state.tickets.flatMap(t => t.picks.map(p => p.id)));
  return { ...state, matches: state.matches.filter(m => !m.extra || used.has(m.id)) };
}

export function persist(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(serializable(state)));
    return true;
  } catch {
    return false;
  }
}

export function recordActivity(state, type, amount, details, now = new Date()) {
  state.transactions.push({
    id: 'ACT-' + now.getTime().toString(36) + '-' + state.transactions.length,
    date: now.toLocaleString('en-GB'),
    at: now.toISOString(),
    type,
    amount,
    balance: state.balance,
    details,
  });
}

export function isValidBackup(d) {
  return !!d && Number.isFinite(d.balance) && d.balance >= 0
    && Array.isArray(d.matches) && Array.isArray(d.tickets) && Array.isArray(d.transactions)
    && !d.matches.some(m => typeof m.id !== 'string' || typeof m.home !== 'string' || typeof m.sport !== 'string' || !Array.isArray(m.outcomes) && !m.odds)
    && !d.tickets.some(t => typeof t.id !== 'string' || !Array.isArray(t.picks) || !Number.isFinite(t.stake) || !Number.isFinite(t.odd) || !Number.isFinite(t.payout) || !STATUSES.includes(t.status));
}

export function parseBackup(text) {
  const state = migrate(JSON.parse(text));
  if (!isValidBackup(state)) throw Error('Invalid backup');
  return state;
}

export const MAX_BACKUP_BYTES = 10000000;
export const BACKUP_FILENAME = 'SPORTS_BET_sauvegarde.json';

export const backupJson = state => JSON.stringify(serializable(state), null, 2);

export const playerName = state => (state.playerName || '').trim() || DEFAULT_PLAYER;
