import { isCatalogFresh, isClosed, isOfficialId, options } from './catalog.js';
import { round2 } from './format.js';
import { recordActivity } from './state.js';

export const MIN_STAKE = 0.1;

export function toggleSelection(selected, matchId, key) {
  if (selected[matchId] === key) delete selected[matchId];
  else selected[matchId] = key;
}

const matchName = m => m.home + (m.away ? ' - ' + m.away : '');

export function readSlip(matches, selected, now = Date.now()) {
  const byId = new Map(matches.map(m => [m.id, m]));
  const picks = [], unavailable = [];
  for (const [id, key] of Object.entries(selected)) {
    const m = byId.get(id);
    const o = m && options(m).find(o => o.key === key);
    if (!o || isClosed(m, now)) {
      unavailable.push({ id, name: m ? matchName(m) : null });
      continue;
    }
    picks.push({
      id: m.id, home: m.home, away: m.away, pick: o.key, label: o.label, short: o.short, matchNumber: m.matchNumber,
      odd: o.odd, deadline: m.deadline, market: m.market, sport: m.sport, competition: m.competition, resultPath: m.resultPath,
    });
  }
  return { picks, unavailable };
}

export const combinedOdd = picks => picks.reduce((a, p) => a * p.odd, 1);

export const potentialPayout = (stake, odd) => round2(stake * odd);

const refuse = (reason, message) => ({ ok: false, reason, message });

export function checkBet({ picks, unavailable = [], stake, balance, catalogFetchedAt, now = Date.now() }) {
  if (unavailable.length) {
    const names = unavailable.map(u => u.name || 'match retiré du catalogue').join(', ');
    return refuse('closed', `Paris clos : ${names}. Retire ${unavailable.length > 1 ? 'ces sélections' : 'cette sélection'} du ticket.`);
  }
  if (!picks.length) return refuse('empty', 'Ajoute au moins une sélection.');
  if (picks.some(p => isOfficialId(p.id)) && !isCatalogFresh(catalogFetchedAt, now))
    return refuse('stale', 'Catalogue de plus de 6 h : nouveaux tickets suspendus. Actualise la liste.');
  const rounded = Number.isFinite(stake) ? round2(stake) : NaN;
  if (!(rounded >= MIN_STAKE)) return refuse('stake', 'Mise minimale : 0,10 €.');
  if (rounded > balance) return refuse('balance', 'Solde insuffisant pour cette mise.');
  if (!Number.isFinite(combinedOdd(picks) * rounded)) return refuse('odds', 'Cote combinée trop élevée.');
  return { ok: true, stake: rounded };
}

export function placeBet(state, picks, stake, now = new Date()) {
  const odd = combinedOdd(picks);
  state.balance = round2(state.balance - stake);
  const ticket = {
    id: 'BET-' + now.getTime().toString(36).toUpperCase(),
    date: now.toLocaleString('en-GB'),
    createdAt: now.toISOString(),
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
