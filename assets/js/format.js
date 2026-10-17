export const round2 = n => Math.round(n * 100) / 100;

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = n => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export const englishSport = s => ({ 'Volley-ball': 'Volleyball', 'Tennis de Table': 'Table tennis', 'Boxe': 'Boxing', 'Cyclisme': 'Cycling', 'Foot américain': 'American football', 'Hockey s/g': 'Ice hockey' }[s] || s);

export const englishMarket = s => ({ '1/N/2': 'Match result', 'Face à Face': 'Head to head', 'Vainqueur': 'Winner', 'Vainqueur de la compétition': 'Competition winner', 'Plus/Moins': 'Over/Under' }[s] || s);

export function chosen(p) {
  return p.label || (p.pick === '1' ? p.home : p.pick === '2' ? p.away : 'Draw');
}
