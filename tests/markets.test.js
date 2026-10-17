import test from 'node:test';
import assert from 'node:assert/strict';
import { groupByEvent, groupMarkets } from '../assets/js/catalog.js';
import { checkBet, readSlip, toggleSelection } from '../assets/js/betslip.js';
import { serializable } from '../assets/js/state.js';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const later = new Date(NOW + 3600e3).toISOString();
const market = (event, id, label, extra, keys = ['1', '2']) => ({
  id: `fdj-${event}-${id}`, eventId: event, home: 'Stormers-Bristol', away: '', sport: 'Rugby', competition: 'Champions Cup',
  market: label, deadline: later, official: true, ...(extra ? { extra: true } : {}),
  outcomes: keys.map(k => ({ key: `${id}${k}`, label: k, short: k, odd: 1.9 })),
});
const catalog = [
  market(1, 10, '1/N/2', false, ['1', 'N', '2']),
  market(1, 11, 'Plus/Moins Essais', true),
  market(1, 12, 'Plus/Moins Essais', true),
  market(1, 13, 'Handicap -12', true),
  market(1, 14, 'Handicap -18', true),
  market(2, 20, '1/N/2', false, ['1', 'N', '2']),
];

test('les marchés annexes sont regroupés sous leur match', () => {
  const groups = groupByEvent(catalog);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].main.id, 'fdj-1-10');
  assert.deepEqual(groups[0].extras.map(m => m.id), ['fdj-1-11', 'fdj-1-12', 'fdj-1-13', 'fdj-1-14']);
  assert.deepEqual(groupMarkets(groups[0].extras).map(f => [f.label, f.markets.length]), [['Plus/Moins Essais', 2], ['Handicap', 2]]);
});

test('marché principal clos : le premier marché annexe ouvert prend sa place', () => {
  const groups = groupByEvent(catalog.slice(1, 3));
  assert.equal(groups[0].main.id, 'fdj-1-11');
  assert.equal(groups[0].extras.length, 1);
});

test('une seule sélection par match : un autre marché du même match remplace la sélection', () => {
  const selected = {};
  toggleSelection(selected, 'fdj-1-10', '101', catalog);
  toggleSelection(selected, 'fdj-2-20', '201', catalog);
  const changed = toggleSelection(selected, 'fdj-1-11', '111', catalog);
  assert.deepEqual(selected, { 'fdj-2-20': '201', 'fdj-1-11': '111' });
  assert.deepEqual(changed.sort(), ['fdj-1-10', 'fdj-1-11']);
});

test('deux sélections du même match sont refusées à la validation', () => {
  const { picks } = readSlip(catalog, { 'fdj-1-10': '101', 'fdj-1-11': '111' }, NOW);
  const check = checkBet({ picks, stake: 1, balance: 10, catalogFetchedAt: new Date(NOW).toISOString(), now: NOW });
  assert.equal(check.reason, 'same-event');
});

test('sauvegarde : les marchés annexes ne sont conservés que s\'ils figurent sur un ticket', () => {
  const state = { balance: 10, matches: catalog, transactions: [], tickets: [{ id: 'BET-1', picks: [{ id: 'fdj-1-13' }] }] };
  assert.deepEqual(serializable(state).matches.map(m => m.id), ['fdj-1-10', 'fdj-1-13', 'fdj-2-20']);
  assert.equal(state.matches.length, catalog.length);
});
