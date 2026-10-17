import { heightMm, layoutFor, loadTicketFonts, PAPER_MM, ticketPdf, ticketPng, ticketSvg } from './ticket-render.js';
import { countUp, createFx, winSound } from './celebrate.js';
import { money } from './format.js';

const LINE_UNITS = 30;
const FEED_DELAY = 260;
const HEAD_BAND = 30;
const SLAM_AT = 280, IMPACT_AT = 600;

export const printDuration = picks => Math.min(4000, 1800 + 250 * picks);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function feedSound(durationMs, steps, delayMs = 0) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  const start = ctx.currentTime + .02, t0 = start + delayMs / 1000, end = t0 + durationMs / 1000;
  const noise = ctx.createBuffer(1, ctx.sampleRate * .03, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);

  const out = ctx.createGain();
  out.gain.value = .5;
  out.connect(ctx.destination);

  const motor = ctx.createOscillator(), motorGain = ctx.createGain(), motorFilter = ctx.createBiquadFilter();
  motor.type = 'sawtooth';
  motor.frequency.value = 92;
  motorFilter.type = 'lowpass';
  motorFilter.frequency.value = 380;
  motorGain.gain.setValueAtTime(0, start);
  motorGain.gain.linearRampToValueAtTime(.05, start + .05);
  motorGain.gain.setValueAtTime(.05, end - .05);
  motorGain.gain.linearRampToValueAtTime(0, end);
  motor.connect(motorFilter).connect(motorGain).connect(out);
  motor.start(start);
  motor.stop(end);

  const head = ctx.createBiquadFilter();
  head.type = 'bandpass';
  head.frequency.value = 2600;
  head.Q.value = 1.4;
  head.connect(out);
  for (let i = 0; i < steps; i++) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = .9 + Math.random() * .2;
    src.connect(head);
    src.start(t0 + i * durationMs / steps / 1000);
  }

  const cut = ctx.createBufferSource(), cutFilter = ctx.createBiquadFilter();
  cut.buffer = noise;
  cut.playbackRate.value = .35;
  cutFilter.type = 'highpass';
  cutFilter.frequency.value = 1800;
  cut.connect(cutFilter).connect(out);
  cut.start(end + .04);

  return () => { out.gain.setTargetAtTime(0, ctx.currentTime, .02); setTimeout(() => ctx.close(), 200); };
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function createPrinter({ getPlayer, getSound, setSound, notify }) {
  const dialog = document.getElementById('printer');
  const paper = document.getElementById('printer-paper');
  const actions = document.getElementById('printer-actions');
  const soundBtn = document.getElementById('printer-sound');
  const shareBtn = actions.querySelector('[data-ticket-action="share"]');
  const head = document.getElementById('printer-head');
  const printRoot = document.getElementById('print-root');
  const stamp = document.getElementById('printer-stamp');
  const winAmount = document.getElementById('printer-win-amount');
  const winLive = document.getElementById('printer-win-live');
  const fx = createFx(document.getElementById('printer-fx'));
  let current = null, layout = null, printing = false, stopSound = null, returnFocus = null, pageStyle = null, feed = [], follow = 0;
  let winTimers = [], stopCount = null;

  const filename = ext => `SPORTS_BET_${current.id}.${ext}`;

  function renderSoundButton() {
    const on = getSound();
    soundBtn.setAttribute('aria-pressed', String(on));
  }

  function finish() {
    if (!printing) return;
    printing = false;
    stopSound?.();
    stopSound = null;
    cancelAnimationFrame(follow);
    for (const a of feed) a.cancel();
    feed = [];
    dialog.dataset.state = 'done';
    actions.querySelector('[data-ticket-action="print"]').focus();
  }

  function clearWin() {
    winTimers.forEach(clearTimeout);
    winTimers = [];
    stopCount?.();
    fx.stop();
    delete dialog.dataset.win;
    delete dialog.dataset.winStage;
  }

  // Tampon « GAGNÉ » qui s'écrase, flash, canons à confettis, pluie de pièces et compteur de gain.
  function celebrate(ticket, full) {
    clearWin();
    const amount = '+' + money(ticket.payout);
    dialog.dataset.win = 'true';
    document.getElementById('printer-stamp-amount').textContent = amount;
    winLive.textContent = `Ticket gagnant : ${amount}`;
    if (!full || reducedMotion()) {
      winAmount.textContent = amount;
      dialog.dataset.winStage = 'static';
      return;
    }
    winAmount.textContent = '+' + money(0);
    dialog.dataset.winStage = 'intro';
    void dialog.offsetWidth;
    winTimers.push(setTimeout(() => { dialog.dataset.winStage = 'slam'; }, SLAM_AT));
    winTimers.push(setTimeout(() => {
      dialog.dataset.winStage = 'party';
      fx.burst();
      fx.rain(2600);
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([25, 40, 70]);
      if (getSound()) winSound();
      stopCount = countUp(winAmount, ticket.payout, n => '+' + money(n), 1400);
    }, IMPACT_AT));
  }

  async function open(ticket, { animate = true, celebrate: party = null } = {}) {
    returnFocus = document.activeElement;
    current = ticket;
    clearWin();
    await loadTicketFonts();
    layout = layoutFor(ticket, getPlayer());
    paper.innerHTML = ticketSvg(layout, `Ticket ${ticket.id}`);
    shareBtn.hidden = !(navigator.canShare && navigator.share);
    renderSoundButton();
    if (!dialog.open) dialog.showModal();

    if (!animate || reducedMotion()) {
      printing = false;
      dialog.dataset.state = 'done';
      actions.querySelector('[data-ticket-action="print"]').focus();
      if (ticket.status === 'WON' && party) celebrate(ticket, party === 'full');
      return;
    }
    const duration = printDuration(ticket.picks.length);
    const steps = Math.max(8, Math.round(layout.height / LINE_UNITS));
    printing = true;
    dialog.dataset.state = 'printing';
    soundBtn.focus();
    dialog.scrollTop = 0;
    feed = startFeed(duration, steps);
    feed[0].onfinish = finish;
    followHead();
    if (getSound()) stopSound = feedSound(duration, steps, FEED_DELAY);
  }

  // Avance ligne par ligne : déplacement rapide puis pause, comme une tête thermique.
  function startFeed(duration, steps) {
    const height = paper.getBoundingClientRect().height;
    const clip = [], band = [];
    for (let i = 0; i < steps; i++) {
      const a = i / steps, b = (i + 1) / steps, moved = a + (b - a) * .45;
      const easing = 'cubic-bezier(.25,.8,.35,1)';
      clip.push({ offset: a, clipPath: `inset(0 0 ${(1 - a) * 100}% 0)`, easing }, { offset: moved, clipPath: `inset(0 0 ${(1 - b) * 100}% 0)` });
      band.push({ offset: a, transform: `translateY(${a * height - HEAD_BAND}px)`, easing }, { offset: moved, transform: `translateY(${b * height - HEAD_BAND}px)` });
    }
    clip.push({ offset: 1, clipPath: 'inset(0 0 0% 0)' });
    band.push({ offset: 1, transform: `translateY(${height - HEAD_BAND}px)` });
    const timing = { duration, delay: FEED_DELAY, fill: 'both' };
    return [paper.animate(clip, timing), head.animate(band, timing)];
  }

  // Garde la tête d'impression visible sur les tickets plus hauts que l'écran.
  function followHead() {
    const limit = dialog.clientHeight * .72;
    const bottom = head.getBoundingClientRect().bottom;
    if (bottom > limit) dialog.scrollTop += bottom - limit;
    if (printing) follow = requestAnimationFrame(followHead);
  }

  function close() {
    finish();
    dialog.close();
  }

  async function run(action) {
    if (!current) return;
    try {
      if (action === 'close') return close();
      if (action === 'print') {
        printRoot.innerHTML = paper.innerHTML;
        pageStyle?.remove();
        pageStyle = document.createElement('style');
        pageStyle.textContent = `@page { size: ${PAPER_MM}mm ${Math.ceil(heightMm(layout))}mm; margin: 0; }`;
        document.head.append(pageStyle);
        window.print();
        return;
      }
      if (action === 'png') return download(await ticketPng(layout), filename('png'));
      if (action === 'pdf') return download(await ticketPdf(layout), filename('pdf'));
      if (action === 'share') {
        const file = new File([await ticketPng(layout)], filename('png'), { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: `SPORTS BET · ${current.id}` }); } catch (e) { if (e.name !== 'AbortError') throw e; }
        } else {
          download(file, filename('png'));
          notify('Partage indisponible : image enregistrée.');
        }
      }
    } catch (e) {
      console.error(e);
      notify('Export impossible sur cet appareil.', 'error');
    }
  }

  dialog.addEventListener('click', e => {
    const button = e.target.closest('[data-ticket-action]');
    if (button) return run(button.dataset.ticketAction);
    if (printing && !e.target.closest('#printer-sound')) finish();
  });
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape' && printing) { e.preventDefault(); finish(); }
  });
  dialog.addEventListener('cancel', e => {
    if (printing) { e.preventDefault(); finish(); }
  });
  dialog.addEventListener('close', () => {
    printing = false;
    stopSound?.();
    stopSound = null;
    clearWin();
    dialog.dataset.state = '';
    const target = returnFocus?.isConnected && returnFocus !== document.body && !returnFocus.disabled ? returnFocus : document.querySelector('[data-view-link="tickets"]');
    target?.focus();
  });
  stamp.addEventListener('click', () => { if (current?.status === 'WON') celebrate(current, true); });
  soundBtn.addEventListener('click', () => {
    setSound(!getSound());
    renderSoundButton();
    if (!getSound()) { stopSound?.(); stopSound = null; }
  });
  window.addEventListener('afterprint', () => { printRoot.innerHTML = ''; });

  return { open, close, get ticket() { return current; } };
}
