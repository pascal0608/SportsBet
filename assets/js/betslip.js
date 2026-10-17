import { isCatalogFresh, isClosed, isOfficialId, options } from './catalog.js';
import { round2 } from './format.js';
import { recordActivity } from './state.js';

export const MIN_STAKE = 0.1;

export function toggleSelection(selected, matchId, key) {
  if (selected[matchId] === key) delete selected[matchId];
  else selected[matchId] = key;
}

export function buildPicks(matches, selected, now = Date.now()) {
  return matches.filter(m => selected[m.id] && !isClosed(m, now)).map(m => {
    const o = options(m).find(o => o.key === selected[m.id]);
    return o ? {
      id: m.id, home: m.home, away: m.away, pick: o.key, label: o.label, short: o.short, matchNumber: m.matchNumber,
      odd: o.odd, deadline: m.deadline, market: m.market, sport: m.sport, competition: m.competition, resultPath: m.resultPath,
    } : null;
  }).filter(Boolean);
}

export const combinedOdd = picks => picks.reduce((a, p) => a * p.odd, 1);

export const potentialPayout = (stake, odd) => round2(stake * odd);

export function checkBet({ picks, stake, balance, catalogFetchedAt, now = Date.now() }) {
  if (picks.some(p => isOfficialId(p.id)) && !isCatalogFresh(catalogFetchedAt, now))
    return { ok: false, message: 'Catalogue de plus de 6 heures : nouveaux tickets suspendus. Relance la mise à jour GitHub, puis actualise la liste.' };
  if (!picks.length || !Number.isFinite(stake) || stake < MIN_STAKE || stake > balance)
    return { ok: false, message: 'Check your stake and balance.' };
  const rounded = round2(stake);
  if (rounded > balance) return { ok: false, message: null };
  if (!Number.isFinite(combinedOdd(picks) * rounded)) return { ok: false, message: 'The combined odds are too high.' };
  return { ok: true, stake: rounded };
}

export function placeBet(state, picks, stake, now = new Date()) {
  const odd = combinedOdd(picks);
  state.balance = round2(state.balance - stake);
  const ticket = {
    id: 'BET-' + now.getTime().toString(36).toUpperCase(),
    date: now.toLocaleString('en-GB'),
    stake,
    picks,
    odd,
    payout: round2(stake * odd),
    status: 'PENDING',
  };
  state.tickets.push(ticket);
  recordActivity(state, 'DEBITED · VALIDATED', -stake, 'Ticket ' + ticket.id, now);
  return ticket;
}
