import { applyOfficialResults, fetchCatalog, filterMatches, isClosed, LIVE_CATALOG_AGE_MS, MAX_CATALOG_AGE_MS, mergeCatalog, options } from './catalog.js';
import { checkBet, combinedOdd, placeBet, readSlip, toggleSelection } from './betslip.js';
import { settleTickets } from './settle.js';
import { BACKUP_FILENAME, backupJson, load, MAX_BACKUP_BYTES, parseBackup, persist, pruneOfficialResults, recordActivity } from './state.js';
import { chosen, englishMarket, englishSport, esc, money, round2 } from './format.js';
import { ticketPdf, ticketPng } from './ticket-render.js';

const loaded = load(localStorage);
let state = loaded.state;
let selected = {}, timer;
const $ = id => document.getElementById(id);

function save() {
  const ok = persist(localStorage, state);
  $('stateStatus').textContent = ok ? 'Version autonome · données enregistrées dans ce navigateur · aucun mail automatique' : 'Sauvegarde impossible : exporte tes données avant de fermer.';
  return ok;
}

function tell(s) {
  $('message').textContent = s;
  clearTimeout(timer);
  timer = setTimeout(() => $('message').textContent = '', 5000);
}

const slip = () => readSlip(state.matches, selected);
const picks = () => slip().picks;
const visible = (includeClosed = false) => filterMatches(state.matches, { q: $('search').value, sport: $('sportFilter').value, competition: $('competitionFilter').value, includeClosed });

function renderAccount() {
  $('accountBalance').textContent = money(state.balance);
  $('accountActivity').innerHTML = state.transactions.length ? [...state.transactions].reverse().map(t => `<div class="activityRow"><div><b>${esc(t.details)}</b><small>${esc(t.date)}</small><em>${t.type}</em></div><strong>${t.amount > 0 ? '+' : ''}${money(t.amount)}<small>Balance ${money(t.balance)}</small></strong></div>`).join('') : '<p class="small">No activity recorded yet.</p>';
}

function render() {
  renderAccount();
  $('latestTicketActions').hidden = !state.tickets.length;
  $('balance').textContent = money(state.balance);
  $('stake').max = state.balance;
  $('matches').innerHTML = visible().map(m => `<article class="match"><div><div class="matchMeta">${esc(englishSport(m.sport))} · ${esc(m.competition || 'Custom match')}<br>${m.startDate ? esc(new Date(m.startDate).toLocaleString('en-GB', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })) + ' · Paris time' : ''} ${isClosed(m) ? '· Closed' : ''}</div><div class="teams">${esc(m.home)}${m.away ? '<br><small>vs</small> ' + esc(m.away) : ''}</div><p class="small">${esc(englishMarket(m.market || 'Match winner'))}</p></div><div class="choices">${options(m).map(o => `<button class="choice" data-match="${esc(m.id)}" data-pick="${esc(o.key)}" aria-label="${esc(o.label)} odds ${o.odd}" aria-pressed="${selected[m.id] === o.key}" ${isClosed(m) ? 'disabled' : ''}>${esc(o.short || o.label)}<span>${o.odd.toFixed(2)}</span></button>`).join('')}</div></article>`).join('') || '<p class="catalogEmpty">No matches found. Try another search or refresh the fixtures.</p>';
  const { picks: list, unavailable } = slip(), odd = combinedOdd(list), stake = Number($('stake').value);
  $('selection').innerHTML = list.length || unavailable.length ? list.map(p => `<div class="pick"><b>${esc(p.home)}${p.away ? ' — ' + esc(p.away) : ''}</b><span> ${esc(chosen(p))} · ${p.odd.toFixed(2)}</span></div>`).join('') + unavailable.map(u => `<div class="pick"><b>${esc(u.name || 'Match retiré')}</b><span> Clos</span></div>`).join('') : '<p class="empty">Your ticket starts here.<br>Choose 1, X or 2 to make a pick.</p>';
  $('totalOdds').textContent = list.length ? odd.toFixed(2) : '—';
  $('potential').textContent = money(list.length && Number.isFinite(stake) ? round2(stake * odd) : 0);
  $('validate').disabled = !list.length || !(stake >= .1 && stake <= state.balance);
  $('results').innerHTML = visible(true).map(m => `<div class="resultRow"><span>${esc(m.home)}${m.away ? ' — ' + esc(m.away) : ''}</span><select data-result="${esc(m.id)}" aria-label="Result ${esc(m.home)}" ${m.result || m.official ? 'disabled' : ''}><option value="">${m.official ? 'Résultat officiel automatique' : 'Pending'}</option>${[...options(m).map(o => [o.key, o.label]), ['void', 'Void · odds 1']].map(([k, n]) => `<option value="${esc(k)}" ${m.result === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`).join('');
  $('ticketCount').textContent = state.tickets.length + ' ticket' + (state.tickets.length > 1 ? 's' : '');
  $('history').innerHTML = state.tickets.length ? [...state.tickets].reverse().map(t => `<article class="historyCard"><div><span class="badge ${t.status === 'WON' ? 'won' : t.status === 'LOST' ? 'lost' : ''}">${t.status}</span><p><b>${esc(t.id)}</b> · ${esc(t.date)}</p><p>${t.picks.map(p => `${esc(p.home)}${p.away ? ' / ' + esc(p.away) : ''} : <b>${esc(chosen(p))}</b>`).join('<br>')}</p></div><div class="historyActions"><p>Stake ${money(t.stake)}</p><p>Odds ${t.odd.toFixed(2)}</p><p><b>${t.status === 'WON' ? 'Virtual return' : t.status === 'LOST' ? 'Return' : 'Potential'} ${money(t.status === 'LOST' ? 0 : t.payout)}</b></p><button class="outline" data-print="${esc(t.id)}">Digital ticket</button><button class="outline" data-download="${esc(t.id)}">Save PDF</button></div></article>`).join('') : '<p class="empty">No tickets yet. Make your first picks above.</p>';
}

function filterOptions() {
  const sports = [...new Set(state.matches.map(m => m.sport))].sort();
  const comps = [...new Set(state.matches.filter(m => !$('sportFilter').value || m.sport === $('sportFilter').value).map(m => m.competition).filter(Boolean))].sort();
  const sv = $('sportFilter').value, cv = $('competitionFilter').value;
  $('sportFilter').innerHTML = '<option value="">All sports</option>' + sports.map(s => `<option ${s === sv ? 'selected' : ''} value="${esc(s)}">${esc(englishSport(s))}</option>`).join('');
  $('competitionFilter').innerHTML = '<option value="">All competitions</option>' + comps.map(c => `<option ${c === cv ? 'selected' : ''} value="${esc(c)}">${esc(c)}</option>`).join('');
}

let ticketPdfUrl = null, activeTicket = null, ticketImageUrl = null, ticketImageBlob = null;

function ticketHtml(t) {
  return `<h2>SPORTS BET</h2><p class="center"><b>SIMULATION TICKET<br>NO REAL BET PLACED</b></p><div class="line"></div><p>${esc(t.date)}<br>${esc(t.id)}<br>TYPE: ACCUMULATOR</p><div class="line"></div>${t.picks.map((p, i) => `<p>${i + 1}. ${esc(p.home)}${p.away ? ' - ' + esc(p.away) : ''}<br> ${esc(chosen(p))}<br>ODDS: ${p.odd.toFixed(2)}</p>`).join('')}<div class="line"></div><p>VIRTUAL STAKE: ${money(t.stake)}<br>COMBINED ODDS: ${t.odd.toFixed(2)}<br>GAIN THEORIQUE: ${money(t.payout)}<br>STATUS: ${t.status === 'PENDING' ? 'JEU EN COURS' : t.status}</p><div class="barcode"></div><p class="center">All selections must win.</p>`;
}

async function showTicket(t) {
  if (!t) return;
  activeTicket = t;
  if (ticketPdfUrl) URL.revokeObjectURL(ticketPdfUrl);
  ticketPdfUrl = URL.createObjectURL(new Blob([await ticketPdf(t)], { type: 'application/pdf' }));
  $('downloadPdf').href = ticketPdfUrl;
  $('downloadPdf').download = 'SPORTS_BET_' + t.id + '.pdf';
  $('openPdf').href = ticketPdfUrl;
  $('ticketPreview').innerHTML = ticketHtml(t);
  if (!$('ticketDialog').open) $('ticketDialog').showModal();
  $('shareTicket').disabled = true;
  $('saveImage').hidden = true;
  ticketImageBlob = null;
  try {
    const blob = await ticketPng(t);
    if (activeTicket !== t) return;
    if (ticketImageUrl) URL.revokeObjectURL(ticketImageUrl);
    ticketImageBlob = blob;
    ticketImageUrl = URL.createObjectURL(blob);
    $('saveImage').href = ticketImageUrl;
    $('saveImage').download = 'SPORTS_BET_' + t.id + '.png';
    $('saveImage').hidden = false;
    $('shareTicket').disabled = false;
    $('ticketPreview').innerHTML = '<img class="receiptImage" src="' + ticketImageUrl + '" alt="SPORTS BET fictional digital ticket">';
  } catch {
    tell('Image unavailable. You can still save or open the PDF.');
  }
}

function printTicket(t) {
  if (!t) return;
  const popup = window.open('', '_blank');
  if (popup) {
    popup.document.open();
    popup.document.write('<!doctype html><html lang="en"><head><title>SPORTS BET ticket</title><style>@page{size:80mm auto;margin:4mm}body{font:12px Courier,monospace;width:72mm;margin:4mm auto;color:#000}h2,.center{text-align:center}p{line-height:1.5;overflow-wrap:anywhere}.line{border-top:1px dashed #000;margin:12px 0}.barcode{height:28px;background:repeating-linear-gradient(90deg,#000 0px,#000 2px,#fff 2px,#fff 4px);print-color-adjust:exact}button{padding:12px;font:inherit;cursor:pointer}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button>' + (ticketImageUrl && activeTicket === t ? '<img style="width:100%" src="' + ticketImageUrl + '" alt="Fictional ticket">' : ticketHtml(t)) + '</body></html>');
    popup.document.close();
    popup.focus();
    popup.onload = () => popup.print();
  } else {
    showTicket(t);
    tell('Use Open PDF, then print from your PDF viewer.');
  }
}

let catalogLoading = false;

async function loadCatalog() {
  if (catalogLoading) return;
  catalogLoading = true;
  filterOptions();
  render();
  $('catalogStatus').textContent = 'Actualisation des matchs et résultats FDJ…';
  try {
    const data = await fetchCatalog();
    const date = Date.parse(data.fetchedAt);
    applyOfficialResults(state, data.results);
    state.catalogFetchedAt = data.fetchedAt;
    mergeCatalog(state, data.matches);
    save(); filterOptions(); render();
    settleTickets(state);
    pruneOfficialResults(state);
    save(); render();
    const age = Date.now() - date;
    const partial = (data.failedCompetitions?.length || data.incompleteCompetitions?.length) ? ' · catalogue partiel' : '';
    $('catalogStatus').textContent = state.matches.filter(m => m.official && !isClosed(m)).length + ' matchs disponibles · données du ' + new Date(date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) + partial + (age > MAX_CATALOG_AGE_MS ? ' · catalogue de plus de 6 h : nouveaux tickets suspendus' : age > LIVE_CATALOG_AGE_MS ? ' · cotes de simulation du dernier relevé, pas en direct' : '');
  } catch {
    $('catalogStatus').textContent = 'Actualisation indisponible. Dernières données conservées ; résultats non confirmés en attente.';
  } finally {
    catalogLoading = false;
  }
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-match]');
  if (b) { toggleSelection(selected, b.dataset.match, b.dataset.pick); render(); }
  const p = e.target.closest('[data-print]');
  if (p) showTicket(state.tickets.find(t => t.id === p.dataset.print));
  const d = e.target.closest('[data-download]');
  if (d) showTicket(state.tickets.find(t => t.id === d.dataset.download));
});

$('stake').addEventListener('input', render);
$('clear').addEventListener('click', () => { selected = {}; render(); });
$('adminToggle').addEventListener('click', () => {
  const open = $('admin').hidden;
  $('admin').hidden = !open;
  $('adminToggle').setAttribute('aria-expanded', String(open));
});

$('validate').addEventListener('click', () => {
  const current = slip();
  const check = checkBet({ ...current, stake: Number($('stake').value), balance: state.balance, catalogFetchedAt: state.catalogFetchedAt });
  if (!check.ok) return tell(check.message);
  const t = placeBet(state, current.picks, check.stake);
  selected = {};
  save(); render();
  tell('Ticket confirmed!');
  showTicket(t);
});

$('matchForm').addEventListener('submit', e => {
  e.preventDefault();
  const home = $('home').value.trim(), away = $('away').value.trim();
  const odds = { '1': Number($('odd1').value), N: Number($('oddN').value), '2': Number($('odd2').value) };
  if (!home || !away || Object.values(odds).some(n => !Number.isFinite(n) || n < 1.01)) return tell('Enter both teams and all three odds.');
  state.matches.push({ id: 'm' + Date.now(), home, away, sport: $('sport').value, odds, result: '', demo: false });
  $('home').value = ''; $('away').value = '';
  save(); filterOptions(); render();
  tell('Match added.');
});

$('results').addEventListener('change', e => {
  const id = e.target.dataset.result, r = e.target.value;
  if (!id || !r) return;
  if (!confirm('Confirm this result? Tickets will be settled permanently.')) { render(); return; }
  state.matches.find(m => m.id === id).result = r;
  delete selected[id];
  settleTickets(state);
  save(); render();
  tell('Result recorded. Tickets updated.');
});

function addCredit(n) {
  if (!Number.isFinite(n) || n < .1 || n > 10000) return tell('Enter between 0.10 and 10,000 virtual euros.');
  const amount = round2(n);
  state.balance = round2(state.balance + amount);
  recordActivity(state, 'CREDITED · VALIDATED', amount, 'Virtual credit added');
  save(); render();
  tell('Virtual credit added.');
}

$('addCredit').addEventListener('click', () => addCredit(Number($('credit').value)));
$('reset').addEventListener('click', () => {
  if (!confirm('Clear all tickets and restart with 10 virtual euros?')) return;
  state.balance = 10; state.tickets = []; state.transactions = [];
  recordActivity(state, 'VALIDATED', 0, 'New simulation session');
  state.matches = state.matches.map(m => ({ ...m, result: '' }));
  selected = {};
  save(); render();
});

$('shareTicket').addEventListener('click', async () => {
  if (!ticketImageBlob || !activeTicket) return;
  const file = new File([ticketImageBlob], 'SPORTS_BET_' + activeTicket.id + '.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: 'SPORTS BET digital ticket' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  $('saveImage').click();
  tell('Save the ticket image, then attach it to your message.');
});

$('accountButton').addEventListener('click', () => { renderAccount(); $('accountDialog').showModal(); });
$('closeAccount').addEventListener('click', () => $('accountDialog').close());
$('accountCreditForm').addEventListener('submit', e => { e.preventDefault(); addCredit(Number($('accountAmount').value)); });
$('latestTicket').addEventListener('click', () => showTicket(state.tickets.at(-1)));
$('closeTicket').addEventListener('click', () => $('ticketDialog').close());
$('dialogPrint').addEventListener('click', () => printTicket(activeTicket));

$('search').addEventListener('input', render);
$('sportFilter').addEventListener('change', () => { $('competitionFilter').value = ''; filterOptions(); render(); });
$('competitionFilter').addEventListener('change', render);
$('refresh').addEventListener('click', loadCatalog);

$('backup').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([backupJson(state)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = BACKUP_FILENAME; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('restore').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw Error('Too large');
    const d = parseBackup(await file.text());
    if (confirm('Remplacer les données de ce navigateur par cette sauvegarde ?')) {
      state = d; selected = {};
      save(); loadCatalog();
      tell('Sauvegarde restaurée.');
    }
  } catch {
    tell('Fichier de sauvegarde invalide.');
  } finally {
    e.target.value = '';
  }
});

loadCatalog();
if (loaded.error === 'corrupt') tell('Données illisibles : une copie brute a été conservée, la session repart de zéro.');
else save();
window.addEventListener('pageshow', loadCatalog);
