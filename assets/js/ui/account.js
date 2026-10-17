import { options } from '../catalog.js';
import { activityDate, activityLabel, esc, matchTitle, money, signedMoney, sportLabel } from '../format.js';
import { playerName } from '../state.js';

const ACTIVITY_LIMIT = 60;

export function renderAccount(state, prefs) {
  document.getElementById('account-balance').textContent = money(state.balance);
  const name = document.getElementById('player-name');
  if (document.activeElement !== name) name.value = playerName(state);
  document.getElementById('pref-sound').checked = !!prefs.sound;
  const rows = [...state.transactions].reverse().slice(0, ACTIVITY_LIMIT);
  document.getElementById('activity').innerHTML = rows.length
    ? rows.map(t => `<li><span>${esc(activityLabel(t))}<br><small>${esc(activityDate(t))}</small></span>`
      + `<strong class="num${t.amount > 0 ? ' plus' : ''}">${t.amount ? signedMoney(t.amount) : '—'}<br><small>Solde ${money(t.balance)}</small></strong></li>`).join('')
    : '<li><span class="hint">Aucune activité pour le moment.</span></li>';
}

export function renderManualResults(state) {
  const manual = state.matches.filter(m => !m.official && !m.demo);
  const el = document.getElementById('manual-results');
  el.innerHTML = manual.length ? manual.map(m => {
    const label = `${sportLabel(m.sport)} · ${matchTitle(m)}`;
    const opts = options(m).map(o => [o.key, o.label === 'Draw' ? 'Nul' : o.label]).concat([['void', 'Annulé (cote 1)']]);
    return `<div class="result-row"><span>${esc(label)}</span><select class="input" data-result="${esc(m.id)}" aria-label="Résultat ${esc(matchTitle(m))}"${m.result ? ' disabled' : ''}>`
      + `<option value="">En attente</option>${opts.map(([k, n]) => `<option value="${esc(k)}"${m.result === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
  }).join('') : '<p class="hint">Aucun match ajouté à la main.</p>';
}
