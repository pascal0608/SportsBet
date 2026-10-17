import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPicks, checkBet, combinedOdd, placeBet, toggleSelection } from '../assets/js/betslip.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const fresh = new Date(NOW - 10 * 60000).toISOString();
const officialPick = { id: 'fdj-1-1', odd: 2 };
const manualPick = { id: 'm1', odd: 2 };

test('cote combinée = produit non arrondi', () => {
  assert.equal(combinedOdd([{ odd: 1.63 }, { odd: 3.91 }]), 1.63 * 3.91);
  assert.equal(combinedOdd([]), 1);
});

test('mise hors bornes ou panier vide : refus', () => {
  const base = { picks: [manualPick], balance: 5, catalogFetchedAt: fresh, now: NOW };
  assert.equal(checkBet({ ...base, stake: 0.05 }).ok, false);
  assert.equal(checkBet({ ...base, stake: 5.5 }).ok, false);
  assert.equal(checkBet({ ...base, stake: NaN }).ok, false);
  assert.equal(checkBet({ ...base, picks: [], stake: 1 }).ok, false);
  assert.deepEqual(checkBet({ ...base, stake: 1.234 }), { ok: true, stake: 1.23 });
});

test('catalogue périmé, invalide ou futur : refus si une sélection est officielle', () => {
  const base = { picks: [officialPick], stake: 1, balance: 5, now: NOW };
  assert.equal(checkBet({ ...base, catalogFetchedAt: fresh }).ok, true);
  assert.equal(checkBet({ ...base, catalogFetchedAt: new Date(NOW - 6 * 3600e3 - 1).toISOString() }).ok, false);
  assert.equal(checkBet({ ...base, catalogFetchedAt: new Date(NOW + 6 * 60000).toISOString() }).ok, false);
  assert.equal(checkBet({ ...base, catalogFetchedAt: undefined }).ok, false);
});

test('panier uniquement manuel : pas de contrôle de fraîcheur', () => {
  assert.equal(checkBet({ picks: [manualPick], stake: 1, balance: 5, catalogFetchedAt: undefined, now: NOW }).ok, true);
});

test('validation : débit, ticket en attente, gain arrondi, transaction', () => {
  const state = { balance: 10, tickets: [], transactions: [], matches: [] };
  const picks = [{ ...manualPick, odd: 1.63 }, { ...officialPick, odd: 3.91 }];
  const t = placeBet(state, picks, 2.5, new Date(NOW));
  assert.equal(state.balance, 7.5);
  assert.equal(t.status, 'PENDING');
  assert.equal(t.payout, Math.round(2.5 * 1.63 * 3.91 * 100) / 100);
  assert.match(t.id, /^BET-[0-9A-Z]+$/);
  assert.equal(state.tickets[0], t);
  assert.equal(state.transactions[0].amount, -2.5);
  assert.equal(state.transactions[0].balance, 7.5);
});

test('sélection : même issue = retrait, autre issue = remplacement', () => {
  const sel = {};
  toggleSelection(sel, 'm1', '1');
  assert.deepEqual(sel, { m1: '1' });
  toggleSelection(sel, 'm1', '2');
  assert.deepEqual(sel, { m1: '2' });
  toggleSelection(sel, 'm1', '2');
  assert.deepEqual(sel, {});
});

test('les matchs clos sont exclus des sélections', () => {
  const matches = [
    { id: 'fdj-1-1', home: 'A', sport: 'Football', deadline: new Date(NOW - 1000).toISOString(), outcomes: [{ key: '11', odd: 2 }] },
    { id: 'fdj-2-2', home: 'B', sport: 'Football', deadline: new Date(NOW + 60000).toISOString(), outcomes: [{ key: '21', odd: 3 }] },
  ];
  const picks = buildPicks(matches, { 'fdj-1-1': '11', 'fdj-2-2': '21' }, NOW);
  assert.deepEqual(picks.map(p => p.id), ['fdj-2-2']);
});
