import { betType, chosen, decimal, formatDate, formatTime, marketLabel, sportLabel, ticketDate, TICKET_STATUS_LABEL } from './format.js';

// Unités logiques : 576 = largeur imprimable d'un rouleau 80 mm à 203 dpi.
export const PAPER_WIDTH = 576;
export const TEETH = 14;
const M = 32, R = PAPER_WIDTH - M, CENTER = PAPER_WIDTH / 2;
const MONO_ADVANCE = 0.6;
const cols = size => Math.floor((R - M) / (size * MONO_ADVANCE));

export function wrap(text, max) {
  const rows = [];
  let row = '';
  for (let word of String(text).split(/\s+/).filter(Boolean)) {
    while (word.length > max) {
      if (row) { rows.push(row); row = ''; }
      rows.push(word.slice(0, max));
      word = word.slice(max);
    }
    if ((row + ' ' + word).trim().length > max) { rows.push(row); row = word; } else row = (row + ' ' + word).trim();
  }
  if (row) rows.push(row);
  return rows.length ? rows : [''];
}

const fit = (text, max) => text.length > max ? text.slice(0, max - 1) + '…' : text;

// Barres décoratives : largeurs pseudo-aléatoires dérivées de l'id, sans motif de début/fin ni symbole encodé.
export function barcodeBars(id, x0, x1) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const bars = [];
  for (let x = x0; ;) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const w = 2 + h % 5, gap = 2 + (h >>> 8) % 4;
    if (x + w > x1) break;
    bars.push({ x, w });
    x += w + gap;
  }
  return bars;
}

function amounts(t) {
  const eur = n => decimal(n) + ' EUR';
  const rows = [['COTE TOTALE', decimal(t.odd)]];
  if (t.initialOdd && t.initialOdd !== t.odd) rows.unshift(['COTE INITIALE', decimal(t.initialOdd)]);
  rows.push(['MISE', eur(t.stake)]);
  if (t.status === 'WON') rows.push(['GAIN', eur(t.payout)]);
  else if (t.status === 'VOID') rows.push(['REMBOURSEMENT', eur(t.payout)]);
  else if (t.status === 'LOST') rows.push(['GAIN', eur(0)]);
  else rows.push(['GAIN POTENTIEL', eur(t.payout)]);
  return rows;
}

export function ticketLayout(t, { player = 'Joueur' } = {}) {
  const ops = [];
  let y = 0;
  const text = (s, x, size, { font = 'mono', weight = 400, align = 'left', fill } = {}) => ops.push({ kind: 'text', text: String(s), x, y, size, font, weight, align, fill });
  const rule = (style = 'dash') => ops.push({ kind: 'rule', y, x1: M, x2: R, style });
  const pair = (label, value, size = 22) => {
    text(label, M, size);
    text(fit(value, cols(size) - label.length - 2), R, size + 2, { weight: 700, align: 'right' });
  };

  ops.push({ kind: 'shamrock', x: CENTER, y: 62, size: 64 });
  y = 152; text('SPORTS BET', CENTER, 70, { font: 'display', weight: 800, align: 'center' });
  y = 190; text('— JEU PRIVÉ —', CENTER, 22, { weight: 700, align: 'center' });
  y = 214; rule();

  const date = ticketDate(t);
  y = 250; text('DATE ' + (date ? formatDate(date) : String(t.date || '').split(',')[0]), M, 22);
  text('HEURE ' + (date ? formatTime(date) : (String(t.date || '').split(',')[1] || '').trim().slice(0, 5)), R, 22, { align: 'right' });
  y += 32; pair('TICKET', t.id);
  y += 32; pair('JOUEUR', String(player).toUpperCase());
  y += 24; rule();

  y += 52; text(betType(t.picks.length).toUpperCase(), CENTER, 46, { font: 'display', weight: 800, align: 'center' });
  y += 24; rule();
  y += 38;

  t.picks.forEach((p, i) => {
    const context = `${i + 1}. ${sportLabel(p.sport)}${p.competition ? ' · ' + p.competition : ''}`.toUpperCase();
    for (const row of wrap(context, cols(18))) { text(row, M, 18); y += 26; }
    y += 4;
    for (const row of wrap(p.home + (p.away ? ' - ' + p.away : ''), cols(23))) { text(row, M, 23, { weight: 700 }); y += 31; }
    text(marketLabel(p.market), M, 20); y += 32;
    const choiceRows = wrap('> ' + chosen(p), cols(25) - 7);
    text(decimal(p.odd), R, 27, { weight: 700, align: 'right' });
    for (const row of choiceRows) { text(row, M, 25, { weight: 700 }); y += 33; }
    y += 2;
    if (i < t.picks.length - 1) { y -= 6; rule('dot'); y += 38; }
  });

  y += 6; rule('solid'); y += 44;
  for (const [label, value] of amounts(t)) { pair(label, value, 22); y += 38; }

  y += 2;
  ops.push({ kind: 'box', x: M, y, w: R - M, h: 76 });
  y += 56; text(TICKET_STATUS_LABEL[t.status] || t.status, CENTER, 50, { font: 'display', weight: 800, align: 'center', fill: 'paper' });
  y += 52;

  const top = y;
  for (const b of barcodeBars(t.id, M + 48, R - 48)) ops.push({ kind: 'bar', x: b.x, y: top, w: b.w, h: 72 });
  y += 72 + 34; text(t.id, CENTER, 20, { align: 'center' });
  y += 58; text('BONNE CHANCE !', CENTER, 42, { font: 'display', weight: 800, align: 'center' });
  y += 44;

  return { width: PAPER_WIDTH, height: y + TEETH, ops };
}

export function paperPath(width, height, teeth = TEETH) {
  const step = teeth * 1.6, base = height - teeth;
  let d = `M0 0H${width}V${base}`;
  let x = width;
  for (let up = false; x > 0; up = !up) {
    x = Math.max(0, x - step / 2);
    d += `L${x.toFixed(1)} ${up ? base : height}`;
  }
  return d + 'Z';
}

export const LEAF_PATH = 'M0 0C-14-10-30-20-30-34C-30-44-22-50-15-50C-8-50-2-46 0-40C2-46 8-50 15-50C22-50 30-44 30-34C30-20 14-10 0 0Z';
export const STEM_PATH = 'M0 0C2 14 6 30 16 46';
export const SHAMROCK_BOX = 104;
