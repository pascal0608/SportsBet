import { OFFICIAL_ID } from './catalog.js';
import { round2 } from './format.js';
import { recordActivity } from './state.js';

export function pickVerdict(state, p) {
  if (OFFICIAL_ID.test(p.id)) return state.officialResults?.[p.id]?.outcomes?.[p.pick] || null;
  const r = state.matches.find(m => m.id === p.id)?.result;
  return !r ? null : r === 'void' ? 'VOID' : r === p.pick ? 'WON' : 'LOST';
}

export function settleTickets(state, now = new Date()) {
  for (const t of state.tickets) {
    if (t.status !== 'PENDING') continue;
    const verdicts = t.picks.map(p => pickVerdict(state, p));
    if (verdicts.includes('LOST')) {
      t.status = 'LOST';
      t.payout = 0;
    } else if (verdicts.length && verdicts.every(v => v === 'WON' || v === 'VOID')) {
      t.status = 'WON';
      t.odd = t.picks.reduce((odd, p, i) => odd * (verdicts[i] === 'VOID' ? 1 : p.odd), 1);
      t.payout = round2(t.stake * t.odd);
      state.balance = round2(state.balance + t.payout);
      recordActivity(state, 'CREDITED · VALIDATED', t.payout, 'Virtual return ' + t.id, now);
    } else continue;
    t.settledAt = now.toISOString();
    t.profit = round2(t.payout - t.stake);
  }
}
