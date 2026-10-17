import { applyOfficialResults, countBy, fetchCatalog, filterMatches, freshness, groupByEvent, isClosed, mergeCatalog } from './catalog.js';
import { checkBet, combinedOdd, placeBet, potentialPayout, readSlip, toggleSelection } from './betslip.js';
import { pickVerdict, settleTickets } from './settle.js';
import { BACKUP_FILENAME, backupJson, KEY, load, MAX_BACKUP_BYTES, parseBackup, persist, playerName, pruneOfficialResults, recordActivity } from './state.js';
import { ago, money, parseAmount, round2, sportLabel } from './format.js';
import { isCelebrated, loadPrefs, loadSelection, markCelebrated, savePrefs, saveSelection } from './prefs.js';
import { createPrinter } from './ticket-printer.js';
import { toast } from './ui/toasts.js';
import { confirmDialog, initDialogs } from './ui/dialogs.js';
import { renderBalance, renderTicketCount, renderView } from './ui/header.js';
import { FAVORITES, renderCompetitions, renderMatches, renderMatchesEmpty, renderSkeleton, renderSportChips, updateOdds } from './ui/matches.js';
import { favoriteSet, isFavoriteMatch, toggleFavorite } from './favorites.js';
import { isSlipOpen, renderSlip, setSlipOpen } from './ui/betslip.js';
import { renderHistory } from './ui/history.js';
import { renderAccount, renderManualResults } from './ui/account.js';

const PAGE = 30;
const AUTO_REFRESH_MS = 10 * 60000;
const MIN_CREDIT = 0.1, MAX_CREDIT = 10000;
const $ = id => document.getElementById(id);

const loaded = load(localStorage);
const app = {
  state: loaded.state,
  prefs: loadPrefs(),
  selected: loadSelection(),
  filters: { sport: '', competition: '', q: '' },
  limit: PAGE,
  historyFilter: 'ALL',
  favOpen: null,
  catalog: { loading: false, loadedOnce: false, error: false, partial: false },
  saveWarned: false,
};

function save() {
  const ok = persist(localStorage, app.state);
  if (!ok && !app.saveWarned) toast('Sauvegarde impossible dans ce navigateur. Exporte tes données depuis Mon compte.', 'error');
  app.saveWarned = !ok;
  return ok;
}

// Applique une modification de l'état et l'annule entièrement si elle ne peut pas être sauvegardée.
function commit(mutate, failure) {
  const snapshot = JSON.stringify(app.state);
  const result = mutate(app.state);
  if (persist(localStorage, app.state)) return result ?? true;
  app.state = JSON.parse(snapshot);
  toast(failure, 'error');
  return false;
}

const setStake = value => { $('stake').value = String(value).replace('.', ','); };
const stakeValue = () => parseAmount($('stake').value);

function slipModel() {
  const { picks, unavailable } = readSlip(app.state.matches, app.selected);
  const stake = stakeValue();
  const odd = combinedOdd(picks);
  const check = checkBet({ picks, unavailable, stake, balance: app.state.balance, catalogFetchedAt: app.state.catalogFetchedAt });
  const gain = picks.length && Number.isFinite(stake) && stake > 0 ? potentialPayout(round2(stake), odd) : 0;
  return { picks, unavailable, odd, stake, gain, check };
}

function renderFreshness() {
  const el = $('freshness');
  const { level, age } = freshness(app.state.catalogFetchedAt);
  const partial = app.catalog.partial ? ' · partiel' : '';
  const text = {
    fresh: `Mis à jour ${ago(age)}${partial}`,
    late: `Mis à jour ${ago(age)} · cotes pas en direct${partial}`,
    stale: 'Catalogue de plus de 6 h · paris suspendus',
    unknown: app.catalog.loading ? 'Chargement…' : 'Catalogue indisponible',
  }[level];
  el.className = `badge badge--${level === 'unknown' ? (app.catalog.loading ? 'fresh' : 'error') : level}`;
  el.textContent = text;
  $('refresh').disabled = app.catalog.loading;
}

function renderCatalog() {
  const now = Date.now();
  const favs = favoriteSet(app.state);
  const favOnly = app.filters.sport === FAVORITES;
  const open = groupByEvent(app.state.matches.filter(m => !isClosed(m, now))).map(g => g.main);
  const followed = open.filter(m => isFavoriteMatch(favs, m));
  const sportCounts = countBy(open, m => sportLabel(m.sport));
  if (app.filters.sport && !favOnly && !sportCounts.has(app.filters.sport)) app.filters.sport = '';
  renderSportChips($('sport-chips'), sportCounts, open.length, app.filters.sport, followed.length);
  const inSport = favOnly ? followed : app.filters.sport ? open.filter(m => sportLabel(m.sport) === app.filters.sport) : open;
  const compCounts = countBy(inSport, m => m.competition);
  if (app.filters.competition && !compCounts.has(app.filters.competition)) app.filters.competition = '';
  renderCompetitions($('competition'), compCounts, app.filters.competition);

  const list = favOnly
    ? groupByEvent(filterMatches(app.state.matches, { ...app.filters, sport: '' }, now)).filter(g => isFavoriteMatch(favs, g.main))
    : groupByEvent(filterMatches(app.state.matches, app.filters, now));
  const el = $('matches');
  const more = $('more-matches');
  more.hidden = list.length <= app.limit;
  more.textContent = `Afficher plus de matchs (${Math.max(0, list.length - app.limit)} restants)`;
  $('match-count').textContent = list.length ? `${list.length} match${list.length > 1 ? 's' : ''} ouvert${list.length > 1 ? 's' : ''}` : '';

  if (list.length) return renderMatches(el, list, app.selected, app.limit, now, { set: favs, open: app.favOpen });
  if (!app.catalog.loadedOnce) return renderSkeleton(el);
  if (!open.length && app.catalog.error) return renderMatchesEmpty(el, { title: 'Catalogue indisponible', text: 'Vérifie ta connexion puis réessaie.', action: 'refresh', actionLabel: 'Réessayer' });
  if (favOnly && !favs.size) return renderMatchesEmpty(el, { title: 'Aucun favori pour l’instant', text: 'Touche l’étoile d’un match pour suivre une équipe ou une compétition.' });
  if (favOnly && !followed.length) return renderMatchesEmpty(el, { title: 'Rien pour tes favoris', text: 'Aucun match ouvert pour tes équipes et compétitions suivies.', action: 'reset-filters', actionLabel: 'Voir tous les matchs' });
  if (!open.length) return renderMatchesEmpty(el, { title: 'Aucun match ouvert', text: 'Le catalogue ne contient pas de match ouvert pour le moment.', action: 'refresh', actionLabel: 'Actualiser' });
  renderMatchesEmpty(el, { title: 'Aucun match ne correspond', text: 'Essaie une autre recherche ou un autre sport.', action: 'reset-filters', actionLabel: 'Réinitialiser les filtres' });
}

const renderBetslip = () => renderSlip(slipModel());

const isNewWin = t => t.status === 'WON' && !isCelebrated(app.prefs, t.id);

function renderTickets() {
  renderTicketCount(app.state.tickets.filter(t => t.status === 'PENDING').length, app.state.tickets.some(isNewWin));
  renderHistory(app.state.tickets, app.historyFilter, p => pickVerdict(app.state, p), isNewWin);
}

// Première ouverture d'un ticket gagnant : célébration complète, ensuite version calme.
function openTicket(ticket) {
  if (!ticket) return;
  const party = ticket.status === 'WON' ? (isCelebrated(app.prefs, ticket.id) ? 'calm' : 'full') : null;
  printer.open(ticket, { animate: false, celebrate: party });
  if (party === 'full') {
    markCelebrated(app.prefs, ticket.id);
    renderTickets();
  }
}

function renderAll() {
  renderBalance(app.state.balance);
  renderFreshness();
  renderCatalog();
  renderBetslip();
  renderTickets();
  if ($('account-dialog').open) renderAccount(app.state, app.prefs);
  if ($('manage-dialog').open) renderManualResults(app.state);
}

function announceSettled(settled) {
  for (const t of settled.slice(0, 3)) {
    if (t.status === 'WON') toast(`Ticket gagné : +${money(t.payout)}`, 'success', { action: { label: 'Voir', onClick: () => openTicket(t) } });
    else if (t.status === 'VOID') toast(`Ticket annulé : ${money(t.payout)} remboursés`);
    else toast(`Ticket perdu (${t.id})`);
  }
  if (settled.length > 3) toast(`${settled.length - 3} autres tickets réglés.`);
}

async function loadCatalog({ quiet = false } = {}) {
  if (app.catalog.loading) return;
  app.catalog.loading = true;
  renderFreshness();
  try {
    const data = await fetchCatalog();
    applyOfficialResults(app.state, data.results);
    app.state.catalogFetchedAt = data.fetchedAt;
    mergeCatalog(app.state, data.matches);
    const settled = settleTickets(app.state);
    pruneOfficialResults(app.state);
    save();
    app.catalog.error = false;
    app.catalog.partial = !!(data.failedCompetitions?.length || data.incompleteCompetitions?.length);
    announceSettled(settled);
  } catch (e) {
    app.catalog.error = true;
    if (!quiet) toast('Actualisation impossible. Les dernières données sont conservées.', 'error');
    if (e.message === 'Invalid catalogue') console.warn('sports-data.json rejeté : format inattendu.');
  } finally {
    app.catalog.loading = false;
    app.catalog.loadedOnce = true;
    renderAll();
  }
}

function validate() {
  const { picks, unavailable } = readSlip(app.state.matches, app.selected);
  const check = checkBet({ picks, unavailable, stake: stakeValue(), balance: app.state.balance, catalogFetchedAt: app.state.catalogFetchedAt });
  if (!check.ok) return toast(check.message, 'error');
  const ticket = commit(state => placeBet(state, picks, check.stake), 'Sauvegarde impossible : ticket non validé. Exporte tes données puis libère de l’espace.');
  if (!ticket) return renderAll();
  app.selected = {};
  saveSelection(app.selected);
  app.prefs.stake = check.stake;
  savePrefs(app.prefs);
  setSlipOpen(false);
  renderAll();
  toast('Ticket validé. Bonne chance !', 'success');
  printer.open(ticket, { animate: true });
}

function addCredit(raw) {
  const n = parseAmount(raw);
  if (!Number.isFinite(n) || n < MIN_CREDIT || n > MAX_CREDIT) return toast('Montant entre 0,10 € et 10 000 €.', 'error');
  const amount = round2(n);
  const ok = commit(state => {
    state.balance = round2(state.balance + amount);
    recordActivity(state, 'CREDITED · VALIDATED', amount, 'Virtual credit added');
  }, 'Sauvegarde impossible : crédit non ajouté.');
  if (ok) { toast(`${money(amount)} ajoutés au solde.`, 'success'); renderAll(); }
}

async function resetSession() {
  const yes = await confirmDialog({ title: 'Nouvelle session ?', text: 'Tous les tickets et l’activité seront effacés et le solde repartira à 10 €. Pense à sauvegarder tes données avant.', ok: 'Tout effacer', danger: true });
  if (!yes) return;
  const ok = commit(state => {
    state.balance = 10;
    state.tickets = [];
    state.transactions = [];
    recordActivity(state, 'VALIDATED', 0, 'New simulation session');
    state.matches = state.matches.map(m => ({ ...m, result: '' }));
    pruneOfficialResults(state);
  }, 'Sauvegarde impossible : session conservée.');
  if (!ok) return;
  app.selected = {};
  saveSelection(app.selected);
  renderAll();
  toast('Nouvelle session : 10 € de crédit.', 'success');
}

function backup() {
  const url = URL.createObjectURL(new Blob([backupJson(app.state)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = BACKUP_FILENAME;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Sauvegarde téléchargée.', 'success');
}

async function restore(file) {
  let next;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw Error('Fichier trop volumineux');
    next = parseBackup(await file.text());
  } catch {
    return toast('Fichier de sauvegarde invalide.', 'error');
  }
  const yes = await confirmDialog({ title: 'Restaurer cette sauvegarde ?', text: `Les données de ce navigateur seront remplacées (${next.tickets.length} tickets, solde ${money(next.balance)}).`, ok: 'Restaurer' });
  if (!yes) return;
  const previous = app.state;
  app.state = next;
  if (!persist(localStorage, app.state)) {
    app.state = previous;
    return toast('Sauvegarde impossible : restauration annulée.', 'error');
  }
  app.selected = {};
  saveSelection(app.selected);
  renderAll();
  toast('Sauvegarde restaurée.', 'success');
  loadCatalog({ quiet: true });
}

function addManualMatch(e) {
  e.preventDefault();
  const home = $('match-home').value.trim(), away = $('match-away').value.trim();
  const odds = { '1': parseAmount($('match-odd-1').value), N: parseAmount($('match-odd-n').value), '2': parseAmount($('match-odd-2').value) };
  if (!home || !away || Object.values(odds).some(n => !Number.isFinite(n) || n < 1.01)) return toast('Renseigne les deux équipes et trois cotes d’au moins 1,01.', 'error');
  const ok = commit(state => {
    state.matches.push({ id: 'm' + Date.now(), home, away, sport: $('match-sport').value, odds, result: '', demo: false });
  }, 'Sauvegarde impossible : match non ajouté.');
  if (!ok) return;
  $('match-home').value = '';
  $('match-away').value = '';
  renderAll();
  toast('Match ajouté au catalogue.', 'success');
}

async function setManualResult(select) {
  const id = select.dataset.result, result = select.value;
  if (!id || !result) return;
  const match = app.state.matches.find(m => m.id === id);
  const label = select.selectedOptions[0].textContent;
  const yes = await confirmDialog({ title: 'Confirmer le résultat ?', text: `${match.home} - ${match.away} : ${label}. Les tickets concernés seront réglés définitivement.`, ok: 'Confirmer' });
  if (!yes) { select.value = ''; return; }
  const settled = commit(state => {
    state.matches.find(m => m.id === id).result = result;
    return settleTickets(state);
  }, 'Sauvegarde impossible : résultat non enregistré.');
  if (!settled) return renderAll();
  delete app.selected[id];
  saveSelection(app.selected);
  renderAll();
  toast('Résultat enregistré.', 'success');
  announceSettled(settled);
}

function toggleFav(chip) {
  const fav = { type: chip.dataset.favType, sport: chip.dataset.favSport, name: chip.dataset.favName };
  const cardId = chip.closest('.match')?.dataset.id;
  let saved;
  try {
    saved = commit(state => ({ added: toggleFavorite(state, fav) }), 'Sauvegarde impossible : favori non enregistré.');
  } catch {
    return toast('100 favoris au maximum.', 'error');
  }
  if (!saved) return;
  const { added } = saved;
  const what = fav.type === 'competition' ? `La compétition ${fav.name}` : fav.name;
  toast(added ? `${what} ajouté${fav.type === 'competition' ? 'e' : ''} à tes favoris.` : `${what} retiré${fav.type === 'competition' ? 'e' : ''} de tes favoris.`, added ? 'success' : 'info');
  renderCatalog();
  if ($('account-dialog').open) renderAccount(app.state, app.prefs);
  const selector = `[data-fav-type="${fav.type}"][data-fav-name="${CSS.escape(fav.name)}"]`;
  ($('matches').querySelector(`.match[data-id="${CSS.escape(cardId || '')}"] ${selector}`) || $('matches').querySelector(selector))?.focus();
}

const currentView = () => location.hash === '#tickets' ? 'tickets' : 'paris';

const printer = createPrinter({
  getPlayer: () => playerName(app.state),
  getSound: () => app.prefs.sound,
  setSound: on => { app.prefs.sound = on; savePrefs(app.prefs); },
  notify: toast,
});

function onClick(e) {
  const odd = e.target.closest('.odd[data-match]');
  if (odd) {
    for (const id of toggleSelection(app.selected, odd.dataset.match, odd.dataset.pick, app.state.matches)) updateOdds($('matches'), id, app.selected[id]);
    saveSelection(app.selected);
    return renderBetslip();
  }
  const remove = e.target.closest('[data-remove]');
  if (remove) {
    delete app.selected[remove.dataset.remove];
    saveSelection(app.selected);
    updateOdds($('matches'), remove.dataset.remove, undefined);
    renderBetslip();
    return ($('slip-picks').querySelector('[data-remove]') || $('stake')).focus();
  }
  const star = e.target.closest('[data-fav-toggle]');
  if (star) {
    const id = star.dataset.favToggle;
    app.favOpen = app.favOpen === id ? null : id;
    renderCatalog();
    const card = $('matches').querySelector(`[data-fav-toggle="${CSS.escape(id)}"]`);
    return (app.favOpen ? card?.closest('.match')?.querySelector('.fav-chip') : card)?.focus();
  }
  const favChip = e.target.closest('[data-fav-type]');
  if (favChip) return toggleFav(favChip);
  const favRemove = e.target.closest('[data-fav-remove]');
  if (favRemove) {
    const fav = app.state.favorites?.[Number(favRemove.dataset.favRemove)];
    if (fav && commit(state => ({ removed: toggleFavorite(state, fav) }), 'Sauvegarde impossible : favori conservé.')) {
      toast(`${fav.name} retiré de tes favoris.`);
      renderAll();
      ($('favorites-list').querySelector('[data-fav-remove]') || $('favorites-title')).focus();
    }
    return;
  }
  const sport = e.target.closest('[data-sport]');
  if (sport) {
    app.filters.sport = sport.dataset.sport;
    app.filters.competition = '';
    app.limit = PAGE;
    return renderCatalog();
  }
  const stake = e.target.closest('[data-stake]');
  if (stake) { setStake(stake.dataset.stake); return renderBetslip(); }
  const filter = e.target.closest('[data-filter]');
  if (filter) { app.historyFilter = filter.dataset.filter; return renderTickets(); }
  const open = e.target.closest('[data-open-ticket]');
  if (open) return openTicket(app.state.tickets.find(t => t.id === open.dataset.openTicket));
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'refresh') return loadCatalog();
  if (action === 'reset-filters') {
    app.filters = { sport: '', competition: '', q: '' };
    $('search').value = '';
    app.limit = PAGE;
    renderCatalog();
  }
}

function bind() {
  initDialogs();
  document.addEventListener('click', onClick);

  $('search').addEventListener('input', e => { app.filters.q = e.target.value; app.limit = PAGE; renderCatalog(); });
  $('competition').addEventListener('change', e => { app.filters.competition = e.target.value; app.limit = PAGE; renderCatalog(); });
  $('more-matches').addEventListener('click', () => {
    const first = app.limit;
    app.limit += PAGE;
    renderCatalog();
    $('matches').children[first]?.querySelector('button, summary')?.focus();
  });
  $('refresh').addEventListener('click', () => loadCatalog());

  $('stake').addEventListener('input', renderBetslip);
  $('stake').addEventListener('change', () => {
    const n = stakeValue();
    if (Number.isFinite(n) && n > 0) setStake(round2(n));
    renderBetslip();
  });
  $('slip-clear').addEventListener('click', () => {
    app.selected = {};
    saveSelection(app.selected);
    renderCatalog();
    renderBetslip();
  });
  $('slip-handle').addEventListener('click', () => setSlipOpen(!isSlipOpen()));
  $('validate').addEventListener('click', validate);

  $('open-account').addEventListener('click', () => {
    renderAccount(app.state, app.prefs);
    $('account-dialog').showModal();
  });
  $('player-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('player-name').value.trim().slice(0, 24);
    if (commit(state => { state.playerName = name; }, 'Sauvegarde impossible : nom non modifié.')) toast(`Nom sur les tickets : ${playerName(app.state)}.`, 'success');
  });
  $('credit-form').addEventListener('submit', e => { e.preventDefault(); addCredit($('credit-amount').value); });
  $('backup').addEventListener('click', backup);
  $('restore').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) restore(file);
  });
  $('pref-sound').addEventListener('change', e => { app.prefs.sound = e.target.checked; savePrefs(app.prefs); });
  $('open-manage').addEventListener('click', () => {
    renderManualResults(app.state);
    $('manage-dialog').showModal();
  });
  $('reset').addEventListener('click', resetSession);
  $('match-form').addEventListener('submit', addManualMatch);
  $('manual-results').addEventListener('change', e => { if (e.target.matches('[data-result]')) setManualResult(e.target); });

  window.addEventListener('hashchange', () => { renderView(currentView()); window.scrollTo({ top: 0 }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && freshness(app.state.catalogFetchedAt).age > AUTO_REFRESH_MS) loadCatalog({ quiet: true });
  });
  window.addEventListener('storage', e => {
    if (e.key !== null && e.key !== KEY) return;
    const next = load(localStorage);
    if (!next.error) { app.state = next.state; renderAll(); }
  });
  setInterval(() => {
    renderFreshness();
    renderBetslip();
    if (!$('matches').contains(document.activeElement)) renderCatalog();
  }, 30000);
}

// Avant cette fonctionnalité, aucun gain n'était marqué comme vu : seuls les gains des 48 dernières heures restent à découvrir.
if (!Array.isArray(app.prefs.celebrated)) {
  const recent = Date.now() - 48 * 3600e3;
  app.prefs.celebrated = app.state.tickets.filter(t => t.status === 'WON' && !(Date.parse(t.settledAt) > recent)).map(t => t.id);
  savePrefs(app.prefs);
}

bind();
setStake(app.prefs.stake || 1);
renderView(currentView());
renderBalance(app.state.balance, { announce: false });
renderAll();
if (loaded.error === 'corrupt') toast('Données illisibles : une copie brute a été conservée et une nouvelle session démarre.', 'error');
else if (loaded.error === 'unavailable') toast('Stockage indisponible : tes tickets ne seront pas conservés.', 'error');
else save();
loadCatalog();
