export const KEY = 'sports-bet-autonome-v1';

export const initialState = () => ({ balance: 10, matches: [], tickets: [], transactions: [] });

const LEGACY_STATUS = { 'GAGNÉ': 'WON', 'PERDU': 'LOST', 'EN ATTENTE': 'PENDING' };

export function migrate(state) {
  for (const t of state.tickets) {
    t.status = LEGACY_STATUS[t.status] || t.status;
    t.id = t.id.replace(/^SEB-/, 'BET-');
  }
  state.transactions = state.transactions || [];
  return state;
}

export function load(storage) {
  let state;
  try { state = JSON.parse(storage.getItem(KEY)) || initialState(); } catch { state = initialState(); }
  return migrate(state);
}

export function persist(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function recordActivity(state, type, amount, details, now = new Date()) {
  state.transactions.push({
    id: 'ACT-' + now.getTime().toString(36) + '-' + state.transactions.length,
    date: now.toLocaleString('en-GB'),
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
    && !d.tickets.some(t => typeof t.id !== 'string' || !Array.isArray(t.picks) || !Number.isFinite(t.stake) || !Number.isFinite(t.odd) || !Number.isFinite(t.payout) || !['PENDING', 'WON', 'LOST'].includes(t.status));
}

export const MAX_BACKUP_BYTES = 10000000;
export const BACKUP_FILENAME = 'SPORTS_BET_sauvegarde.json';

export const backupJson = state => JSON.stringify(state, null, 2);
