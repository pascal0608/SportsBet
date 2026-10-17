import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRUPT_KEY, KEY, load, migrate, parseBackup, SCHEMA_VERSION } from '../assets/js/state.js';

const memory = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: k => k in data ? data[k] : null, setItem: (k, v) => { data[k] = String(v); } };
};

const v1 = () => ({
  balance: 7.5,
  matches: [{ id: 'm1', home: 'H', away: 'A', sport: 'Football', odds: { 1: 2, N: 3, 2: 4 }, result: '' }],
  tickets: [
    { id: 'SEB-OLD', date: '01/10/2026, 10:00:00', stake: 1, picks: [{ id: 'fdj-1-1', pick: '11', odd: 2 }], odd: 2, payout: 2, status: 'GAGNÉ' },
    { id: 'BET-VOID', date: '02/10/2026, 10:00:00', stake: 3, picks: [{ id: 'fdj-2-2', pick: '21', odd: 1.8 }], odd: 1, payout: 3, status: 'WON' },
    { id: 'BET-WAIT', date: '03/10/2026, 10:00:00', stake: 1, picks: [{ id: 'fdj-3-3', pick: '31', odd: 1.5 }], odd: 1.5, payout: 1.5, status: 'EN ATTENTE' },
  ],
  transactions: [],
  officialResults: {
    'fdj-1-1': { outcomes: { 11: 'WON' }, confirmedAt: '2026-10-01T12:00:00Z' },
    'fdj-9-9': { outcomes: { 91: 'LOST' }, confirmedAt: '2026-10-01T12:00:00Z' },
  },
  catalogFetchedAt: '2026-10-17T09:00:00Z',
});

test('migration v1 → v2 : statuts hérités, préfixe SEB-, ticket annulé, purge des résultats', () => {
  const s = migrate(v1());
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(s.tickets.map(t => [t.id, t.status]), [['BET-OLD', 'WON'], ['BET-VOID', 'VOID'], ['BET-WAIT', 'PENDING']]);
  assert.deepEqual(Object.keys(s.officialResults), ['fdj-1-1']);
  assert.equal(s.balance, 7.5);
  assert.equal(s.catalogFetchedAt, '2026-10-17T09:00:00Z');
});

test('migration idempotente', () => {
  const once = migrate(v1());
  const twice = migrate(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
});

test('chargement : stockage vide, valide, corrompu', () => {
  assert.equal(load(memory()).state.balance, 10);
  const ok = load(memory({ [KEY]: JSON.stringify(v1()) }));
  assert.equal(ok.error, undefined);
  assert.equal(ok.state.tickets.length, 3);
  const store = memory({ [KEY]: '{oops' });
  const bad = load(store);
  assert.equal(bad.error, 'corrupt');
  assert.equal(store.data[CORRUPT_KEY], '{oops');
  assert.equal(store.data[KEY], '{oops');
});

test('restauration : une sauvegarde v1 avec statuts hérités est acceptée', () => {
  const s = parseBackup(JSON.stringify(v1()));
  assert.equal(s.tickets[0].status, 'WON');
  assert.throws(() => parseBackup('{"balance":"x"}'));
  assert.throws(() => parseBackup(JSON.stringify({ ...v1(), tickets: [{ id: 'X', picks: [], stake: 1, odd: 1, payout: 1, status: 'BIZARRE' }] })));
});

test('sauvegarde → restauration : état identique', () => {
  const s = migrate(v1());
  assert.deepEqual(parseBackup(JSON.stringify(s, null, 2)), s);
});
