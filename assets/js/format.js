export const round2 = n => Math.round(n * 100) / 100;

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const TIME_ZONE = 'Europe/Paris';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dec = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit' });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export const money = n => eur.format(n);
export const signedMoney = n => (n > 0 ? '+' : n < 0 ? '−' : '') + eur.format(Math.abs(n));
export const decimal = n => dec.format(n);
export const formatOdd = decimal;
export const formatDate = d => dateFmt.format(d);
export const formatTime = d => timeFmt.format(d);
export const formatDateTime = d => `${dateFmt.format(d)} ${timeFmt.format(d)}`;

export const parseAmount = s => {
  const n = Number(String(s).trim().replace(/\s/g, '').replace(',', '.'));
  return String(s).trim() === '' ? NaN : n;
};

export function closingLabel(iso, now = Date.now()) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const day = dayKey.format(d);
  if (day === dayKey.format(now)) return `Auj. ${formatTime(d)}`;
  if (day === dayKey.format(now + 864e5)) return `Demain ${formatTime(d)}`;
  return `${dayFmt.format(d)} · ${formatTime(d)}`;
}

export function ago(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `il y a ${h} h${min % 60 && h < 6 ? ' ' + String(min % 60).padStart(2, '0') : ''}`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function parseLegacyDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(?:à\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  return Number.isFinite(d.getTime()) ? d : null;
}

export function ticketDate(t) {
  const d = t.createdAt ? new Date(t.createdAt) : parseLegacyDate(t.date);
  return d && Number.isFinite(d.getTime()) ? d : null;
}

export const displayDate = (t, fallback = t.date) => {
  const d = ticketDate(t);
  return d ? formatDateTime(d) : String(fallback || '');
};

const SPORTS = {
  'Football': ['Football', '⚽'],
  'Basketball': ['Basketball', '🏀'],
  'Hockey s/g': ['Hockey sur glace', '🏒'],
  'Ice hockey': ['Hockey sur glace', '🏒'],
  'Hockey sur glace': ['Hockey sur glace', '🏒'],
  'Volley-ball': ['Volley-ball', '🏐'],
  'Volleyball': ['Volley-ball', '🏐'],
  'Rugby': ['Rugby', '🏉'],
  'Handball': ['Handball', '🤾'],
  'Foot américain': ['Football américain', '🏈'],
  'American football': ['Football américain', '🏈'],
  'Football américain': ['Football américain', '🏈'],
  'Tennis': ['Tennis', '🎾'],
  'Tennis de Table': ['Tennis de table', '🏓'],
  'Table tennis': ['Tennis de table', '🏓'],
  'Tennis de table': ['Tennis de table', '🏓'],
  'MMA': ['MMA', '🥋'],
  'Boxe': ['Boxe', '🥊'],
  'Boxing': ['Boxe', '🥊'],
  'Badminton': ['Badminton', '🏸'],
  'Nascar': ['Nascar', '🏁'],
  'Formule 1': ['Formule 1', '🏎️'],
  'Baseball': ['Baseball', '⚾'],
  'Cyclisme': ['Cyclisme', '🚴'],
  'Cycling': ['Cyclisme', '🚴'],
  'Golf': ['Golf', '⛳'],
  'Snooker': ['Snooker', '🎱'],
  'Fléchettes': ['Fléchettes', '🎯'],
  'Other': ['Autre', '🏅'],
  'Autre': ['Autre', '🏅'],
};
export const sportLabel = s => SPORTS[s]?.[0] || String(s || 'Autre');
export const sportIcon = s => SPORTS[s]?.[1] || '🏅';

const MARKETS = { '1/N/2': '1N2', 'Match winner': '1N2', 'Face à Face': 'Face à face', 'Plus/Moins': 'Plus / Moins' };
export const marketLabel = s => s ? MARKETS[s] || s.trim() : '1N2';
export const isMainMarket = s => !s || s === '1/N/2' || s === 'Match winner';

const isDraw = label => label === 'Draw' || label === 'N';
export const outcomeLabel = o => isDraw(o.label) ? 'Nul' : String(o.label ?? '');
export const outcomeCode = o => ({ '1': '1', 'X': 'N', 'N': 'N', '2': '2' })[o.short] || '';

export function chosen(p) {
  if (p.label) return isDraw(p.label) ? 'Nul' : p.label;
  return p.pick === '1' ? p.home : p.pick === '2' ? p.away : 'Nul';
}

export function teamsOf(m) {
  if (m.away) return [m.home, m.away];
  const outs = m.outcomes || [];
  const one = outs.find(o => o.short === '1'), two = outs.find(o => o.short === '2');
  return one && two ? [one.label, two.label] : [m.home];
}

export const matchTitle = m => m.home + (m.away ? ' - ' + m.away : '');

export const STATUS_LABEL = { PENDING: 'En cours', WON: 'Gagné', LOST: 'Perdu', VOID: 'Annulé' };
export const TICKET_STATUS_LABEL = { PENDING: 'VALIDÉ', WON: 'GAGNÉ', LOST: 'PERDU', VOID: 'ANNULÉ' };

export const betType = n => n > 1 ? `Combiné x${n}` : 'Simple';

export function activityLabel(t) {
  const d = String(t.details || '');
  let m;
  if ((m = /^Ticket (\S+)$/.exec(d))) return `Mise · ticket ${m[1]}`;
  if ((m = /^Virtual return (\S+)$/.exec(d))) return `Gain · ticket ${m[1]}`;
  if ((m = /^Refund (\S+)$/.exec(d))) return `Remboursement · ticket ${m[1]}`;
  if (d === 'Virtual credit added') return 'Crédit ajouté';
  if (d === 'New simulation session') return 'Nouvelle session';
  return d;
}

export const activityDate = t => {
  const d = t.at ? new Date(t.at) : parseLegacyDate(t.date);
  return d && Number.isFinite(d.getTime()) ? formatDateTime(d) : String(t.date || '');
};
