import { betType, chosen, decimal, esc, marketLabel, money, sportIcon } from '../format.js';

const $ = id => document.getElementById(id);
let lastKey = '';

function pickItem(p) {
  const match = p.home + (p.away ? ' - ' + p.away : '');
  return `<li class="slip-pick"><span class="slip-pick__match"><span aria-hidden="true">${sportIcon(p.sport)}</span> ${esc(match)} · ${esc(marketLabel(p.market))}</span>`
    + `<span class="slip-pick__choice">${esc(chosen(p))}</span><span class="slip-pick__odd num">${decimal(p.odd)}</span>`
    + `<button type="button" class="icon-btn" data-remove="${esc(p.id)}" aria-label="Retirer ${esc(match)}"><svg aria-hidden="true"><use href="#i-close"/></svg></button></li>`;
}

function closedItem(u) {
  const name = u.name || 'Match retiré du catalogue';
  return `<li class="slip-pick slip-pick--closed"><span class="slip-pick__match">${esc(name)}</span><span class="slip-pick__choice">Paris clos</span><span class="slip-pick__odd">Clos</span>`
    + `<button type="button" class="icon-btn" data-remove="${esc(u.id)}" aria-label="Retirer ${esc(name)}"><svg aria-hidden="true"><use href="#i-close"/></svg></button></li>`;
}

export function renderSlip({ picks, unavailable, odd, stake, gain, check }) {
  const count = picks.length + unavailable.length;
  const key = picks.map(p => p.id + p.pick).join() + '|' + unavailable.map(u => u.id).join();
  if (key !== lastKey) {
    $('slip-picks').innerHTML = picks.map(pickItem).join('') + unavailable.map(closedItem).join('');
    lastKey = key;
  }
  $('slip-empty').hidden = count > 0;
  $('slip-clear').hidden = count === 0;
  $('slip-type').textContent = picks.length ? betType(picks.length) : '';
  $('slip-odd').textContent = picks.length ? decimal(odd) : '—';
  $('slip-gain').textContent = money(gain);
  $('slip-reason').textContent = count && !check.ok ? check.message : '';
  $('validate').disabled = !count || !check.ok;
  for (const b of document.querySelectorAll('[data-stake]')) b.setAttribute('aria-pressed', String(Number(b.dataset.stake) === stake));

  const slip = $('slip');
  slip.dataset.empty = String(count === 0);
  $('slip-handle-count').textContent = String(count);
  $('slip-handle-odd').textContent = picks.length ? decimal(odd) : '';
  if (!count) setSlipOpen(false);
}

export function setSlipOpen(open) {
  $('slip').dataset.open = String(open);
  $('slip-handle').setAttribute('aria-expanded', String(open));
}

export const isSlipOpen = () => $('slip').dataset.open === 'true';
