import { options } from '../catalog.js';
import { closingLabel, decimal, esc, isMainMarket, marketLabel, matchTitle, outcomeCode, outcomeLabel, sportIcon, sportLabel, teamsOf } from '../format.js';

const INLINE_MAX = 3;
const SOON_MS = 60 * 60000;

function oddButton(m, o, selectedKey) {
  const code = outcomeCode(o), label = outcomeLabel(o);
  const visible = code || label;
  const name = code && label && label !== code ? `${code} · ${label}` : visible;
  return `<button type="button" class="odd" data-match="${esc(m.id)}" data-pick="${esc(o.key)}" aria-pressed="${selectedKey === o.key}" aria-label="${esc(name)}, cote ${decimal(o.odd)}">`
    + `<span class="odd__label">${esc(visible)}</span><span class="odd__value num">${decimal(o.odd)}</span></button>`;
}

export function matchCard(m, selectedKey, now = Date.now()) {
  const outs = options(m);
  const teams = teamsOf(m);
  const deadline = m.deadline || m.startDate;
  const soon = deadline && Date.parse(deadline) - now < SOON_MS;
  const meta = [
    `<span class="match__sport"><span aria-hidden="true">${sportIcon(m.sport)}</span> ${esc(sportLabel(m.sport))}</span>`,
    m.competition ? `<span>${esc(m.competition)}</span>` : '<span>Match perso</span>',
    deadline ? `<span class="match__close${soon ? ' match__close--soon' : ''}">Clôture <time datetime="${esc(deadline)}">${esc(closingLabel(deadline, now))}</time></span>` : '',
  ].filter(Boolean).join('<span aria-hidden="true">·</span>');
  const market = isMainMarket(m.market) ? '' : `<span class="match__market">${esc(marketLabel(m.market))}</span>`;
  const group = `role="group" aria-label="Cotes ${esc(matchTitle(m))}"`;
  const odds = outs.length <= INLINE_MAX
    ? `<div class="odds" ${group}>${outs.map(o => oddButton(m, o, selectedKey)).join('')}</div>`
    : `<details class="more"${outs.some(o => o.key === selectedKey) ? ' open' : ''}><summary>Voir les ${outs.length} choix</summary><div class="odds odds--list" ${group}>${outs.map(o => oddButton(m, o, selectedKey)).join('')}</div></details>`;
  return `<article class="match" data-id="${esc(m.id)}"><div class="match__info"><p class="match__meta">${meta}</p>`
    + `<h3 class="match__teams">${teams.map(t => `<span>${esc(t)}</span>`).join('')}</h3>${market}</div>${odds}</article>`;
}

export function renderMatches(el, matches, selected, limit, now = Date.now()) {
  el.setAttribute('aria-busy', 'false');
  el.innerHTML = matches.slice(0, limit).map(m => matchCard(m, selected[m.id], now)).join('');
}

export function renderMatchesEmpty(el, { title, text, action, actionLabel }) {
  el.setAttribute('aria-busy', 'false');
  el.innerHTML = `<div class="empty-state"><svg aria-hidden="true"><use href="#i-trefle"/></svg><strong>${esc(title)}</strong><p>${esc(text)}</p>`
    + (action ? `<button type="button" class="btn btn--outline-light" data-action="${esc(action)}">${esc(actionLabel)}</button>` : '') + '</div>';
}

export function renderSkeleton(el, n = 5) {
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = Array.from({ length: n }, () => '<div class="match match--skeleton" aria-hidden="true"><div><span class="skeleton" style="width:45%;height:14px"></span><span class="skeleton" style="width:70%;height:22px;margin-top:10px"></span><span class="skeleton" style="width:55%;height:22px;margin-top:6px"></span></div><div class="odds"><span class="skeleton" style="height:56px"></span><span class="skeleton" style="height:56px"></span><span class="skeleton" style="height:56px"></span></div></div>').join('');
}

export function updateOdds(root, matchId, selectedKey) {
  for (const b of root.querySelectorAll('.odd')) {
    if (b.dataset.match === matchId) b.setAttribute('aria-pressed', String(b.dataset.pick === selectedKey));
  }
}

export function renderSportChips(el, counts, total, active) {
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  el.innerHTML = [`<button type="button" class="chip" data-sport="" aria-pressed="${!active}">Tous <span class="chip__count num">${total}</span></button>`]
    .concat(sorted.map(([label, n]) => `<button type="button" class="chip" data-sport="${esc(label)}" aria-pressed="${active === label}"><span aria-hidden="true">${sportIcon(label)}</span>${esc(label)} <span class="chip__count num">${n}</span></button>`))
    .join('');
}

export function renderCompetitions(el, counts, active) {
  const sorted = [...counts].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  el.innerHTML = '<option value="">Toutes les compétitions</option>'
    + sorted.map(([c, n]) => `<option value="${esc(c)}"${c === active ? ' selected' : ''}>${esc(c)} (${n})</option>`).join('');
}
