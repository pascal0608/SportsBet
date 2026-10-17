import { sportLabel, teamsOf } from './format.js';

export const MAX_FAVORITES = 100;
const TYPES = ['team', 'competition'];

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const favKey = f => `${f.type}|${norm(sportLabel(f.sport))}|${norm(f.name)}`;

export const isValidFavorite = f => !!f && TYPES.includes(f.type) && typeof f.sport === 'string' && typeof f.name === 'string' && f.name.trim() !== '';

// Équipes (si le marché les nomme) et compétition d'un match.
export function candidates(m) {
  const sport = sportLabel(m.sport);
  const teams = teamsOf(m);
  return [
    ...(teams.length === 2 ? teams.filter(Boolean).map(name => ({ type: 'team', sport, name })) : []),
    ...(m.competition ? [{ type: 'competition', sport, name: m.competition }] : []),
  ];
}

export const favoriteSet = state => new Set((state.favorites || []).map(favKey));

export const isFavoriteMatch = (set, m) => set.size > 0 && candidates(m).some(f => set.has(favKey(f)));

export function toggleFavorite(state, fav) {
  const list = state.favorites ||= [];
  const key = favKey(fav);
  const i = list.findIndex(f => favKey(f) === key);
  if (i >= 0) {
    list.splice(i, 1);
    return false;
  }
  if (list.length >= MAX_FAVORITES) throw Error('Trop de favoris');
  list.push({ type: fav.type, sport: sportLabel(fav.sport), name: fav.name.trim() });
  return true;
}
