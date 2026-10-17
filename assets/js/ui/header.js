import { money } from '../format.js';

const amount = document.getElementById('balance');
const live = document.getElementById('balance-live');
let shown = null, frame = 0;

export function renderBalance(value, { announce = true } = {}) {
  cancelAnimationFrame(frame);
  if (shown === null || shown === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    amount.textContent = money(value);
  } else {
    const from = shown, start = performance.now(), duration = 700;
    amount.classList.remove('is-up', 'is-down');
    void amount.offsetWidth;
    amount.classList.add(value > from ? 'is-up' : 'is-down');
    const tick = now => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      amount.textContent = money(Math.round((from + (value - from) * eased) * 100) / 100);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  if (announce && shown !== null && shown !== value) live.textContent = `Solde : ${money(value)}`;
  shown = value;
}

export function renderTicketCount(n, newWin = false) {
  document.getElementById('ticket-count').textContent = n ? String(n) : '';
  const link = document.querySelector('[data-view-link="tickets"]');
  link.toggleAttribute('data-new-win', newWin);
  link.setAttribute('aria-label', `Mes tickets${n ? `, ${n} en cours` : ''}${newWin ? ', nouveau gain à découvrir' : ''}`);
}

export function renderView(view) {
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== view;
  for (const link of document.querySelectorAll('[data-view-link]')) {
    if (link.dataset.viewLink === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
