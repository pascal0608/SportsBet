export const MAX_CATALOG_AGE_MS = 6 * 60 * 60000;
export const LIVE_CATALOG_AGE_MS = 45 * 60000;
export const FUTURE_TOLERANCE_MS = 300000;
export const OFFICIAL_ID = /^fdj-\d+-\d+$/;

export const isOfficialId = id => /^fdj-/.test(id);

export function options(m) {
  return m.outcomes || Object.entries(m.odds || {}).map(([key, odd]) => ({
    key,
    odd,
    label: key === '1' ? m.home : key === '2' ? m.away : 'Draw',
    short: key === 'N' ? 'X' : key,
  }));
}

export function isClosed(m, now = Date.now()) {
  return !!m.result || !!(m.deadline && Date.parse(m.deadline) <= now);
}

export function filterMatches(matches, { q = '', sport = '', competition = '', includeClosed = false } = {}, now = Date.now()) {
  q = q.trim().toLowerCase();
  return matches.filter(m => (includeClosed || !isClosed(m, now))
    && (!sport || m.sport === sport)
    && (!competition || m.competition === competition)
    && (!q || [m.home, m.away, m.competition, m.region].join(' ').toLowerCase().includes(q)));
}

export function isCatalogFresh(fetchedAt, now = Date.now()) {
  const date = Date.parse(fetchedAt);
  return Number.isFinite(date) && date <= now + FUTURE_TOLERANCE_MS && now - date <= MAX_CATALOG_AGE_MS;
}

export function isValidCatalog(data, now = Date.now()) {
  const date = Date.parse(data?.fetchedAt);
  return data.schemaVersion === 1 && Number.isFinite(date) && date <= now + FUTURE_TOLERANCE_MS
    && Array.isArray(data.matches) && !!data.results && typeof data.results === 'object'
    && !data.matches.some(m => !OFFICIAL_ID.test(m.id) || typeof m.home !== 'string' || typeof m.sport !== 'string' || !Array.isArray(m.outcomes)
      || m.outcomes.some(o => typeof o.key !== 'string' || !Number.isFinite(o.odd) || o.odd <= 1));
}

export function applyOfficialResults(state, results) {
  state.officialResults = state.officialResults || {};
  for (const [id, result] of Object.entries(results)) {
    if (!OFFICIAL_ID.test(id) || !result.outcomes || !Number.isFinite(Date.parse(result.confirmedAt))) continue;
    const outcomes = Object.fromEntries(Object.entries(result.outcomes).filter(([key, value]) => /^\d+$/.test(key) && ['WON', 'LOST', 'VOID'].includes(value)));
    if (Object.keys(outcomes).length) state.officialResults[id] = { ...result, outcomes };
  }
}

export function mergeCatalog(state, matches) {
  for (const t of state.tickets) for (const p of t.picks) {
    const m = matches.find(m => m.id === p.id) || state.matches.find(m => m.id === p.id);
    if (m) {
      p.sport = p.sport || m.sport;
      p.competition = p.competition || m.competition;
      p.resultPath = p.resultPath || m.resultPath;
      p.deadline = p.deadline || m.deadline;
    }
  }
  const old = new Map(state.matches.map(m => [m.id, m]));
  const preserve = state.matches.filter(m => !m.demo && (!m.official || state.tickets.some(t => t.picks.some(p => p.id === m.id))));
  const all = new Map(preserve.map(m => [m.id, m]));
  for (const m of matches) all.set(m.id, { ...m, result: old.get(m.id)?.result || '' });
  state.matches = [...all.values()].sort((a, b) => (a.startDate || 'z').localeCompare(b.startDate || 'z'));
}

export async function fetchCatalog(fetchImpl = fetch) {
  const response = await fetchImpl('sports-data.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('HTTP ' + response.status);
  const data = await response.json();
  if (!isValidCatalog(data)) throw Error('Invalid catalogue');
  return data;
}
