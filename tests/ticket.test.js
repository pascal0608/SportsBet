import test from 'node:test';
import assert from 'node:assert/strict';
import { barcodeBars, PAPER_WIDTH, ticketLayout, wrap } from '../assets/js/ticket-layout.js';
import { printDuration } from '../assets/js/ticket-printer.js';

const ticket = (status = 'PENDING', extra = {}) => ({
  id: 'BET-MGUX2K3A',
  date: '17/10/2026, 14:05:03',
  stake: 2,
  odd: 6.37,
  payout: 12.74,
  status,
  picks: [
    { id: 'fdj-1313464-35570035', home: 'Nantes-Dunkerque', away: '', pick: '162030982', label: 'Nantes', short: '1', odd: 1.63, matchNumber: 174, market: '1/N/2', sport: 'Football', competition: 'Ligue 2 BKT', resultPath: '/resultats/paris-termines/football/x' },
    { id: 'fdj-2-2', home: 'Lens-Lille', away: '', pick: '21', label: 'N', short: 'X', odd: 3.91, matchNumber: 175, market: '1/N/2', sport: 'Football', competition: 'Ligue 1' },
  ],
  ...extra,
});
const texts = l => l.ops.filter(o => o.kind === 'text').map(o => o.text);

test('le ticket ne contient aucun élément interdit (CDC 6.4)', () => {
  const all = texts(ticketLayout(ticket(), { player: 'Pascal' })).join('\n');
  assert.doesNotMatch(all, /FDJ|PARIONS|SIMULATION|SHOP|SB-CLT|N°\s*17[45]|\b174\b|\b175\b|resultats/i);
  assert.match(all, /JEU PRIVÉ/);
  assert.match(all, /BONNE CHANCE/);
  assert.match(all, /BET-MGUX2K3A/);
  assert.match(all, /PASCAL/);
  assert.match(all, /COMBINÉ X2/);
});

test('contenu : sélections, totaux et statut en français', () => {
  const all = texts(ticketLayout(ticket())).join('\n');
  for (const s of ['1. FOOTBALL · LIGUE 2 BKT', 'Nantes-Dunkerque', '1N2', '> Nantes', '1,63', '> Nul', 'COTE TOTALE', '6,37', '2,00 EUR', 'GAIN POTENTIEL', '12,74 EUR', 'VALIDÉ', 'DATE 17/10/2026']) assert.ok(all.includes(s), s);
  assert.match(texts(ticketLayout(ticket('VOID', { payout: 2 }))).join('\n'), /ANNULÉ[\s\S]*|REMBOURSEMENT/);
  assert.ok(texts(ticketLayout(ticket('WON'))).includes('GAGNÉ'));
  assert.ok(texts(ticketLayout(ticket('LOST'))).includes('PERDU'));
});

test('simple ou combiné selon le nombre de sélections', () => {
  const single = ticket();
  single.picks = single.picks.slice(0, 1);
  assert.ok(texts(ticketLayout(single)).includes('SIMPLE'));
});

test('aucun texte ne dépasse la largeur du papier', () => {
  const long = ticket();
  long.picks[0].home = 'Borussia Mönchengladbach-Fortuna Düsseldorf Union Berlin Extra Long';
  for (const o of ticketLayout(long).ops.filter(o => o.kind === 'text' && o.font === 'mono')) {
    const w = o.text.length * o.size * 0.6;
    const left = o.align === 'right' ? o.x - w : o.align === 'center' ? o.x - w / 2 : o.x;
    assert.ok(left >= 0 && left + w <= PAPER_WIDTH + 1, `${o.text} déborde`);
  }
});

test('code-barres décoratif : déterministe et borné', () => {
  const a = barcodeBars('BET-1', 80, 496), b = barcodeBars('BET-1', 80, 496), c = barcodeBars('BET-2', 80, 496);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every(bar => bar.x >= 80 && bar.x + bar.w <= 496));
});

test('retour à la ligne des textes longs', () => {
  assert.deepEqual(wrap('aaa bbb ccc', 7), ['aaa bbb', 'ccc']);
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
});

test('durée d\'impression : 1,8 s + 0,25 s par sélection, plafonnée à 4 s', () => {
  assert.equal(printDuration(1), 2050);
  assert.equal(printDuration(4), 2800);
  assert.equal(printDuration(20), 4000);
});

test('ticket gagnant : tampon placé là où il recouvre le moins de texte, sans changer la hauteur', () => {
  for (const status of ['PENDING', 'LOST', 'VOID']) assert.equal(ticketLayout(ticket(status)).ops.some(o => o.kind === 'stamp'), false, status);
  const layout = ticketLayout(ticket('WON', { payout: 31.85 }));
  const stamp = layout.ops.find(o => o.kind === 'stamp');
  assert.equal(stamp.text, 'GAGNÉ');
  assert.equal(stamp.sub, undefined);
  assert.equal(layout.height, ticketLayout(ticket('PENDING')).height);
  const a = Math.abs(stamp.angle) * Math.PI / 180;
  const halfW = (stamp.w * Math.cos(a) + stamp.h * Math.sin(a)) * stamp.scale / 2, halfH = (stamp.w * Math.sin(a) + stamp.h * Math.cos(a)) * stamp.scale / 2;
  assert.ok(stamp.x - halfW >= 0 && stamp.x + halfW <= PAPER_WIDTH, 'largeur');
  assert.ok(stamp.y - halfH >= 0 && stamp.y + halfH <= layout.height, 'hauteur');
  const centerY = layout.height / 2, naive = { ...stamp, x: PAPER_WIDTH / 2, y: centerY };
  const ink = st => layout.ops.filter(o => o.kind === 'text').reduce((sum, o) => {
    const w = o.text.length * o.size * (o.font === 'display' ? .5 : .6);
    const x = o.align === 'right' ? o.x - w : o.align === 'center' ? o.x - w / 2 : o.x;
    const ox = Math.min(st.x + halfW, x + w) - Math.max(st.x - halfW, x), oy = Math.min(st.y + halfH, o.y) - Math.max(st.y - halfH, o.y - o.size * .78);
    return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
  }, 0);
  assert.ok(ink(stamp) < ink(naive) / 3, `tampon pas assez dégagé : ${Math.round(ink(stamp))} vs ${Math.round(ink(naive))} au centre`);
});
