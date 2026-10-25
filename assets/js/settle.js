import { OFFICIAL_ID } from './catalog.js';
import { round2 } from './format.js';
import { recordActivity } from './state.js';

export function pickVerdict(state, p) {
  if (OFFICIAL_ID.test(p.id)) return state.officialResults?.[p.id]?.outcomes?.[p.pick] || null;
  const r = state.matches.find(m => m.id === p.id)?.result;
  return !r ? null : r === 'void' ? 'VOID' : r === p.pick ? 'WON' : 'LOST';
}

export function settleTickets(state, now = new Date()) {
  const settled = [];
  for (const t of state.tickets) {
    if (t.status !== 'PENDING') continue;
    const verdicts = t.picks.map(p => pickVerdict(state, p));
    if (verdicts.includes('LOST')) {
      t.status = 'LOST';
      t.payout = 0;
    } else if (verdicts.length && verdicts.every(v => v === 'WON' || v === 'VOID')) {
      const originalRawOdd = t.picks.reduce((acc, p) => acc * p.odd, 1);
      const adjustedRawOdd = t.picks.reduce((acc, p, i) => acc * (verdicts[i] === 'VOID' ? 1 : p.odd), 1);
      // Conserve la réduction enregistrée sur chaque ticket.
      const factor = originalRawOdd > 0 ? t.odd / originalRawOdd : 1;
      const odd = verdicts.every(v => v === 'VOID') ? 1 : adjustedRawOdd * factor;
      if (odd !== t.odd) t.initialOdd ??= t.odd;
      t.odd = odd;
      t.status = verdicts.every(v => v === 'VOID') ? 'VOID' : 'WON';
      t.payout = round2(t.stake * odd);
      state.balance = round2(state.balance + t.payout);
      recordActivity(state, 'CREDITED · VALIDATED', t.payout, (t.status === 'VOID' ? 'Refund ' : 'Virtual return ') + t.id, now);
    } else continue;
    t.settledAt = now.toISOString();
    t.profit = round2(t.payout - t.stake);
    settled.push(t);
  }
  return settled;
}
