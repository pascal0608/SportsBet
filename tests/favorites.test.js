import test from 'node:test';
import assert from 'node:assert/strict';
import { candidates, favoriteSet, isFavoriteMatch, toggleFavorite } from '../assets/js/favorites.js';
import { migrate } from '../assets/js/state.js';

const nantes = { id: 'fdj-1-1', home: 'Nantes-Dunkerque', away: '', sport: 'Football', competition: 'Ligue 2 BKT', outcomes: [{ key: 'a', label: 'Nantes', short: '1' }, { key: 'b', label: 'N', short: 'X' }, { key: 'c', label: 'Dunkerque', short: '2' }] };
const multibuts = { id: 'fdj-2-2', home: 'Multibuts Serie A', away: '', sport: 'Football', competition: 'MultiButs', outcomes: [{ key: 'a', label: 'Plus 5.5', short: 'Plus 5.5' }] };
const hockey = { id: 'm1', home: 'Rouen', away: 'Grenoble', sport: 'Ice hockey', odds: { 1: 2, N: 3, 2: 2 } };

test('candidats : deux équipes et la compétition, ou la compétition seule', () => {
  assert.deepEqual(candidates(nantes).map(f => `${f.type}:${f.name}`), ['team:Nantes', 'team:Dunkerque', 'competition:Ligue 2 BKT']);
  assert.deepEqual(candidates(multibuts).map(f => `${f.type}:${f.name}`), ['competition:MultiButs']);
  assert.deepEqual(candidates(hockey).map(f => `${f.type}:${f.sport}:${f.name}`), ['team:Hockey sur glace:Rouen', 'team:Hockey sur glace:Grenoble']);
});

test('ajout / retrait et correspondance insensible à la casse, aux accents et au libellé du sport', () => {
  const state = {};
  assert.equal(toggleFavorite(state, { type: 'team', sport: 'Football', name: 'nantes ' }), true);
  assert.equal(isFavoriteMatch(favoriteSet(state), nantes), true);
  assert.equal(isFavoriteMatch(favoriteSet(state), multibuts), false);
  toggleFavorite(state, { type: 'team', sport: 'Hockey s/g', name: 'Rouen' });
  assert.equal(isFavoriteMatch(favoriteSet(state), hockey), true);
  assert.equal(toggleFavorite(state, { type: 'team', sport: 'Football', name: 'NANTES' }), false);
  assert.equal(state.favorites.length, 1);
});

test('une compétition suivie ne concerne que son sport', () => {
  const state = {};
  toggleFavorite(state, { type: 'competition', sport: 'Rugby', name: 'Ligue 2 BKT' });
  assert.equal(isFavoriteMatch(favoriteSet(state), nantes), false);
});

test('migration : favoris invalides écartés, absence tolérée', () => {
  const s = migrate({ balance: 1, matches: [], tickets: [], transactions: [], favorites: [{ type: 'team', sport: 'Football', name: 'Lens' }, { type: 'x' }, null] });
  assert.deepEqual(s.favorites, [{ type: 'team', sport: 'Football', name: 'Lens' }]);
  assert.equal('favorites' in migrate({ balance: 1 }), false);
});
