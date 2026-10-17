export function ticketLayout(t) {
  const ops = [], W = 600, L = 30, R = 570;
  let y = 0;
  const text = (s, x, top, size = 20, font = 'mono', align = 'left') => ops.push({ kind: 'text', text: String(s), x, y: top, size, font, align });
  const line = top => ops.push({ kind: 'line', x: L, y: top, x2: R });
  const wrapped = (s, max) => {
    const rows = [];
    let row = '';
    for (let word of String(s).split(/\s+/)) {
      while (word.length > max) {
        if (row) { rows.push(row); row = ''; }
        rows.push(word.slice(0, max));
        word = word.slice(max);
      }
      if ((row + ' ' + word).trim().length > max) { rows.push(row); row = word; } else row = (row + ' ' + word).trim();
    }
    if (row) rows.push(row);
    return rows;
  };
  text('SPORTS BET', 255, 75, 62, 'logo', 'center'); text('YOUR BET - OUR PASSION', 255, 110, 21, 'mono', 'center'); text('⚽', 535, 89, 66, 'symbol', 'center'); line(140);
  const parts = String(t.date).split(',');
  text('DATE : ' + parts[0], L, 172, 20); text('TIME : ' + (parts[1] || '').trim(), R, 172, 20, 'mono', 'right');
  text('TICKET N° : ' + t.id, L, 202, 18); text('PRIVATE GAME', R, 202, 18, 'mono', 'right');
  text('SHOP : SB-CLT-01', L, 232, 20); text('CREDIT', R, 232, 18, 'mono', 'right'); line(252);
  text('COMBINED BET (' + t.picks.length + ')', 300, 294, 32, 'bold', 'center'); line(319); y = 361;
  t.picks.forEach((p, i) => {
    text(p.sport === 'Rugby' ? '🏉' : '⚽', 51, y + 12, 38, 'symbol', 'center');
    const name = p.home + (p.away ? ' - ' + p.away : '');
    for (const row of wrapped(name, 28)) { text(row, 91, y, 27, 'bold'); y += 32; }
    text(p.market || 'Match Result (1X2)', 91, y, 20); y += 31;
    const rows = wrapped('N°' + (p.matchNumber || i + 1) + '  Pick : ' + (p.short || (['1', '2', 'N'].includes(p.pick) ? p.pick : '')) + ' ' + (p.label || (p.pick === '1' ? p.home : p.pick === '2' ? p.away : 'Draw')), 29);
    for (const row of rows) { text(row, 91, y, 20); y += 28; }
    text(Number(p.odd).toFixed(2), R, y - 28, 29, 'bold', 'right'); y += 17; line(y); y += 43;
  });
  const total = (label, value) => { text(label, L, y, 23); text(value, R, y, 29, 'bold', 'right'); y += 36; };
  total('TOTAL ODDS', t.odd.toFixed(2)); total('VIRTUAL STAKE', t.stake.toFixed(2) + ' EUR'); total('POTENTIAL WINNINGS', t.payout.toFixed(2) + ' EUR'); line(y); y += 45;
  text(t.status === 'PENDING' ? 'VALIDATED' : t.status === 'WON' ? 'WON' : 'LOST', 300, y, 36, 'bold', 'center'); y += 32; line(y); y += 24;
  let x = 75;
  for (let i = 0; i < 170 && x < 525; i++) {
    const width = 1 + ((t.id.charCodeAt(i % t.id.length) + i) % 3);
    if (i % 2 === 0) ops.push({ kind: 'bar', x, y, w: width, h: 60 });
    x += width + 1;
  }
  y += 86; text(t.id, 300, y, 20, 'mono', 'center'); y += 40;
  text('GOOD LUCK ! THANK YOU FOR YOUR PICKS', 300, y, 18, 'mono', 'center'); y += 29;
  text('ALL PICKS ARE FINAL', 300, y, 18, 'mono', 'center'); y += 29;
  text('PLEASE CHECK YOUR TICKET', 300, y, 18, 'mono', 'center'); y += 40;
  ops.push({ kind: 'rect', x: L, y: y - 23, w: 540, h: 39 }); text('SportBet.irl', 300, y + 3, 22, 'bold', 'center');
  return { width: W, height: y + 43, ops };
}
