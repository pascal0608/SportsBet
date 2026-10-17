import { betType, chosen, decimal, displayDate, esc, marketLabel, money, signedMoney, STATUS_LABEL } from '../format.js';

const VERDICT_MARK = { WON: '✓', LOST: '✕', VOID: '↺', PENDING: '' };
const VERDICT_TEXT = { WON: 'gagné', LOST: 'perdu', VOID: 'annulé', PENDING: 'en attente' };

function gainCell(t) {
  if (t.status === 'WON') return ['Gain', money(t.payout)];
  if (t.status === 'VOID') return ['Remboursé', money(t.payout)];
  if (t.status === 'LOST') return ['Gain', money(Math.round(t.stake * t.odd * 100) / 100)];
  return ['Gain potentiel', money(t.payout)];
}

function card(t, verdictOf, isNewWin) {
  const [gainLabel, gainValue] = gainCell(t);
  const picks = t.picks.map(p => {
    const v = verdictOf(p) || 'PENDING';
    return `<li class="ticket-card__pick"><span class="verdict verdict--${v}" aria-hidden="true">${VERDICT_MARK[v]}</span>`
      + `<span>${esc(chosen(p))}<small>${esc(p.home + (p.away ? ' - ' + p.away : ''))} · ${esc(marketLabel(p.market))}</small><span class="sr-only">, ${VERDICT_TEXT[v]}</span></span>`
      + `<span class="num">${decimal(p.odd)}</span></li>`;
  }).join('');
  const fresh = isNewWin(t);
  return `<article class="ticket-card${fresh ? ' ticket-card--new-win' : ''}" data-status="${esc(t.status)}" aria-label="Ticket ${esc(t.id)}, ${esc(STATUS_LABEL[t.status] || t.status)}">`
    + `<div class="ticket-card__head"><span class="status status--${esc(t.status)}">${esc(STATUS_LABEL[t.status] || t.status)}</span>`
    + (fresh ? '<span class="ticket-card__new">Nouveau gain !</span>' : '')
    + `<span class="ticket-card__type">${esc(betType(t.picks.length))}</span><span class="ticket-card__date">${esc(displayDate(t))}</span></div>`
    + `<ul class="ticket-card__picks">${picks}</ul>`
    + `<div class="ticket-card__foot"><dl class="kv"><dt>Mise</dt><dd class="num">${money(t.stake)}</dd></dl>`
    + `<dl class="kv"><dt>Cote</dt><dd class="num">${decimal(t.odd)}</dd></dl>`
    + `<dl class="kv kv--gain"><dt>${gainLabel}</dt><dd class="num">${gainValue}</dd></dl>`
    + `<div class="ticket-card__actions">`
    + (t.status === 'WON' && !fresh ? `<button type="button" class="btn btn--celebrate btn--sm" data-replay-ticket="${esc(t.id)}"><svg aria-hidden="true"><use href="#i-refresh"/></svg>Rejouer<span class="sr-only"> la célébration du ticket ${esc(t.id)}</span></button>` : '')
    + `<button type="button" class="btn ${fresh ? 'btn--accent' : 'btn--secondary'} btn--sm" data-open-ticket="${esc(t.id)}"><svg aria-hidden="true"><use href="#i-ticket"/></svg>${fresh ? 'Découvrir mon gain' : 'Voir le ticket'}</button></div></div>`
    + `<p class="sr-only">Numéro ${esc(t.id)}</p></article>`;
}

export function renderHistory(tickets, filter, verdictOf, isNewWin = () => false) {
  const counts = { PENDING: 0, WON: 0, LOST: 0, ALL: tickets.length };
  for (const t of tickets) if (t.status in counts) counts[t.status]++;
  for (const b of document.querySelectorAll('[data-filter]')) {
    const f = b.dataset.filter;
    b.setAttribute('aria-pressed', String(f === filter));
    b.innerHTML = `${{ PENDING: 'En cours', WON: 'Gagnés', LOST: 'Perdus', ALL: 'Tous' }[f]} <span class="chip__count num">${counts[f]}</span>`;
  }

  const settled = tickets.filter(t => t.status !== 'PENDING');
  const staked = settled.reduce((a, t) => a + t.stake, 0), returned = settled.reduce((a, t) => a + t.payout, 0);
  document.getElementById('tickets-summary').innerHTML = settled.length
    ? `Bilan des tickets réglés : <strong>${signedMoney(Math.round((returned - staked) * 100) / 100)}</strong>`
    : '';

  const list = [...tickets].reverse().filter(t => filter === 'ALL' || t.status === filter);
  const el = document.getElementById('history');
  el.innerHTML = list.length
    ? list.map(t => card(t, verdictOf, isNewWin)).join('')
    : `<div class="empty-state"><svg aria-hidden="true"><use href="#i-ticket"/></svg><strong>${tickets.length ? 'Aucun ticket dans cette catégorie.' : 'Aucun ticket pour le moment.'}</strong><p>${tickets.length ? 'Change de filtre pour voir tes autres tickets.' : 'Compose ton premier ticket depuis l’onglet Paris.'}</p>${tickets.length ? '' : '<a class="btn btn--accent" href="#paris">Voir les paris</a>'}</div>`;
}
