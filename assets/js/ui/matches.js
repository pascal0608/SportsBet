import { groupMarkets, options } from '../catalog.js';
import { candidates, favKey } from '../favorites.js';
import { closingLabel, decimal, esc, isMainMarket, marketLabel, matchTitle, outcomeCode, outcomeLabel, sportIcon, sportLabel, teamsOf } from '../format.js';

export const FAVORITES = '__favoris__';
const INLINE_MAX = 3;
const SOON_MS = 60 * 60000;

function oddButton(m, o, selectedKey) {
  const code = outcomeCode(o), label = outcomeLabel(o);
  const visible = code || label;
  const name = code && label && label !== code ? `${code} · ${label}` : visible;
  return `<button type="button" class="odd" data-match="${esc(m.id)}" data-pick="${esc(o.key)}" aria-pressed="${selectedKey === o.key}" aria-label="${esc(name)}, cote ${decimal(o.odd)}">`
    + `<span class="odd__label">${esc(visible)}</span><span class="odd__value num">${decimal(o.odd)}</span></button>`;
}

const OPEN_FAMILY_MAX = 6;

function family({ label, markets }, selected) {
  const buttons = markets.flatMap(m => options(m).map(o => oddButton(m, o, selected[m.id]))).join('');
  const count = markets.reduce((n, m) => n + options(m).length, 0);
  const group = `class="odds odds--list" role="group" aria-label="${esc(label)}"`;
  if (count <= OPEN_FAMILY_MAX) return `<section class="market"><h4 class="market__title">${esc(label)}</h4><div ${group}>${buttons}</div></section>`;
  const open = markets.some(m => selected[m.id]) ? ' open' : '';
  return `<details class="market"${open}><summary class="market__title">${esc(label)} <span class="market__count">${count} choix</span></summary><div ${group}>${buttons}</div></details>`;
}

function extraMarkets(extras, selected) {
  if (!extras.length) return '';
  const open = extras.some(m => selected[m.id]) ? ' open' : '';
  return `<details class="more more--markets"${open}><summary>+${extras.length} paris<span class="sr-only"> supplémentaires</span></summary>`
    + `<div class="markets">${groupMarkets(extras).map(f => family(f, selected)).join('')}</div></details>`;
}

const STAR = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';

function favPanel(m, favorites, open) {
  const chips = candidates(m).map(f => {
    const on = favorites.has(favKey(f));
    const label = f.type === 'competition' ? `Compétition ${f.name}` : f.name;
    return `<button type="button" class="fav-chip" data-fav-type="${f.type}" data-fav-sport="${esc(f.sport)}" data-fav-name="${esc(f.name)}" aria-pressed="${on}">`
      + `${STAR}<span>${f.type === 'competition' ? '<span aria-hidden="true">🏆 </span>' : ''}${esc(f.type === 'competition' ? f.name : label)}</span>`
      + `${f.type === 'competition' ? '<span class="sr-only"> (compétition)</span>' : ''}</button>`;
  }).join('');
  return `<div class="fav-panel" id="fav-${esc(m.id)}"${open ? '' : ' hidden'}><span class="fav-panel__label">Suivre</span>${chips}</div>`;
}

export function eventCard({ main, extras }, selected, now = Date.now(), fav = { set: new Set(), open: null }) {
  return matchCard(main, selected[main.id], now, extraMarkets(extras, selected), fav);
}

export function matchCard(m, selectedKey, now = Date.now(), after = '', fav = { set: new Set(), open: null }) {
  const followed = candidates(m).some(f => fav.set.has(favKey(f)));
  const canFollow = candidates(m).length > 0;
  const open = canFollow && fav.open === m.id;
  const outs = options(m);
  const teams = teamsOf(m);
  const deadline = m.deadline || m.startDate;
  const soon = deadline && Date.parse(deadline) - now < SOON_MS;
  const star = canFollow
    ? `<button type="button" class="star" data-fav-toggle="${esc(m.id)}" aria-expanded="${open}" aria-controls="fav-${esc(m.id)}" aria-label="${followed ? 'Suivi' : 'Suivre'} : ${esc(matchTitle(m))}" data-on="${followed}">${STAR}</button>`
    : '';
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
  return `<article class="match${followed ? ' match--fav' : ''}" data-id="${esc(m.id)}"><div class="match__info"><div class="match__top">${star}<p class="match__meta">${meta}</p></div>`
    + `<h3 class="match__teams">${teams.map(t => `<span>${esc(t)}</span>`).join('')}</h3>${market}</div>${odds}${canFollow ? favPanel(m, fav.set, open) : ''}${after}</article>`;
}

export function renderMatches(el, groups, selected, limit, now = Date.now(), fav) {
  el.setAttribute('aria-busy', 'false');
  el.innerHTML = groups.slice(0, limit).map(g => eventCard(g, selected, now, fav)).join('');
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

export function renderSportChips(el, counts, total, active, favCount = 0) {
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  el.innerHTML = [`<button type="button" class="chip" data-sport="" aria-pressed="${!active}">Tous <span class="chip__count num">${total}</span></button>`,
    `<button type="button" class="chip chip--fav" data-sport="${FAVORITES}" aria-pressed="${active === FAVORITES}">${STAR}Favoris <span class="chip__count num">${favCount}</span></button>`]
    .concat(sorted.map(([label, n]) => `<button type="button" class="chip" data-sport="${esc(label)}" aria-pressed="${active === label}"><span aria-hidden="true">${sportIcon(label)}</span>${esc(label)} <span class="chip__count num">${n}</span></button>`))
    .join('');
}

export function renderCompetitions(el, counts, active) {
  const sorted = [...counts].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  el.innerHTML = '<option value="">Toutes les compétitions</option>'
    + sorted.map(([c, n]) => `<option value="${esc(c)}"${c === active ? ' selected' : ''}>${esc(c)} (${n})</option>`).join('');
}
