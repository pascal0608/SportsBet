import test from 'node:test';
import assert from 'node:assert/strict';
import { settleTickets } from '../assets/js/settle.js';

const NOW = new Date('2026-10-17T12:00:00Z');

const official = (n, pick, odd) => ({ id: `fdj-${n}-${n}`, home: 'A' + n, away: '', pick, odd });
const manual = (n, pick, odd) => ({ id: 'm' + n, home: 'H' + n, away: 'A' + n, pick, odd });

function setup(picks, { results = {}, matches = [], stake = 2 } = {}) {
  const odd = picks.reduce((a, p) => a * p.odd, 1);
  return {
    balance: 10,
    matches,
    transactions: [],
    officialResults: results,
    tickets: [{ id: 'BET-T', date: '', stake, picks, odd, payout: Math.round(stake * odd * 100) / 100, status: 'PENDING' }],
  };
}
const res = (pick, verdict) => ({ outcomes: { [pick]: verdict }, confirmedAt: NOW.toISOString() });

test('une sélection perdue rend le ticket perdu, même si une autre est en attente', () => {
  const s = setup([official(1, '11', 2), official(2, '21', 3)], { results: { 'fdj-1-1': res('11', 'LOST') } });
  settleTickets(s, NOW);
  const t = s.tickets[0];
  assert.equal(t.status, 'LOST');
  assert.equal(t.payout, 0);
  assert.equal(t.profit, -2);
  assert.equal(s.balance, 10);
  assert.equal(s.transactions.length, 0);
});

test('toutes gagnées : gain = mise × produit des cotes, crédité une seule fois', () => {
  const s = setup([official(1, '11', 1.5), official(2, '21', 2.2)], { results: { 'fdj-1-1': res('11', 'WON'), 'fdj-2-2': res('21', 'WON') } });
  settleTickets(s, NOW);
  settleTickets(s, NOW);
  assert.equal(s.tickets[0].status, 'WON');
  assert.equal(s.tickets[0].payout, 6.6);
  assert.equal(s.balance, 16.6);
  assert.equal(s.transactions.length, 1);
  assert.equal(s.transactions[0].amount, 6.6);
  assert.equal(s.tickets[0].settledAt, NOW.toISOString());
});

test('gagné + annulé : la cote annulée compte pour 1', () => {
  const s = setup([official(1, '11', 1.5), official(2, '21', 2.2)], { results: { 'fdj-1-1': res('11', 'WON'), 'fdj-2-2': res('21', 'VOID') } });
  settleTickets(s, NOW);
  assert.equal(s.tickets[0].status, 'WON');
  assert.equal(s.tickets[0].odd, 1.5);
  assert.equal(s.tickets[0].initialOdd, 1.5 * 2.2);
  assert.equal(s.tickets[0].payout, 3);
});

test('toutes annulées : ticket VOID, mise remboursée', () => {
  const s = setup([official(1, '11', 1.5), official(2, '21', 2.2)], { results: { 'fdj-1-1': res('11', 'VOID'), 'fdj-2-2': res('21', 'VOID') } });
  const settled = settleTickets(s, NOW);
  assert.equal(settled.length, 1);
  assert.equal(s.tickets[0].status, 'VOID');
  assert.equal(s.tickets[0].payout, 2);
  assert.equal(s.tickets[0].profit, 0);
  assert.equal(s.balance, 12);
  assert.match(s.transactions[0].details, /^Refund BET-T$/);
});

test('résultat absent ou partiel : le ticket reste en attente sans rien modifier', () => {
  const s = setup([official(1, '11', 1.5), official(2, '21', 2.2)], { results: { 'fdj-1-1': res('11', 'WON'), 'fdj-2-2': { outcomes: { '22': 'LOST' } } } });
  const before = JSON.stringify(s);
  settleTickets(s, NOW);
  assert.equal(JSON.stringify(s), before);
});

test('sélection officielle : seul officialResults fait foi', () => {
  const p = official(1, '11', 2);
  const s = setup([p], { matches: [{ id: p.id, home: 'A1', sport: 'Football', outcomes: [], result: '11' }] });
  settleTickets(s, NOW);
  assert.equal(s.tickets[0].status, 'PENDING');
});

test('sélection manuelle : seul le résultat saisi fait foi', () => {
  const won = setup([manual(1, '1', 2)], { matches: [{ id: 'm1', home: 'H1', away: 'A1', sport: 'Football', odds: {}, result: '1' }] });
  settleTickets(won, NOW);
  assert.equal(won.tickets[0].status, 'WON');
  const lost = setup([manual(1, '1', 2)], { matches: [{ id: 'm1', home: 'H1', away: 'A1', sport: 'Football', odds: {}, result: '2' }] });
  settleTickets(lost, NOW);
  assert.equal(lost.tickets[0].status, 'LOST');
  const missing = setup([manual(1, '1', 2)]);
  settleTickets(missing, NOW);
  assert.equal(missing.tickets[0].status, 'PENDING');
});

test('un ticket déjà réglé n\'est jamais retraité', () => {
  const s = setup([official(1, '11', 2)], { results: { 'fdj-1-1': res('11', 'WON') } });
  s.tickets[0].status = 'LOST';
  s.tickets[0].payout = 0;
  settleTickets(s, NOW);
  assert.equal(s.tickets[0].status, 'LOST');
  assert.equal(s.balance, 10);
});
