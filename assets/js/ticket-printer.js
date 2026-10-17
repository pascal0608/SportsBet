import { heightMm, layoutFor, loadTicketFonts, PAPER_MM, ticketPdf, ticketPng, ticketSvg } from './ticket-render.js';

const LINE_UNITS = 30;

export const printDuration = picks => Math.min(4000, 1800 + 250 * picks);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function feedSound(durationMs, steps) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  const t0 = ctx.currentTime + .02, end = t0 + durationMs / 1000;
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
  motorGain.gain.setValueAtTime(0, t0);
  motorGain.gain.linearRampToValueAtTime(.05, t0 + .05);
  motorGain.gain.setValueAtTime(.05, end - .05);
  motorGain.gain.linearRampToValueAtTime(0, end);
  motor.connect(motorFilter).connect(motorGain).connect(out);
  motor.start(t0);
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
  const printRoot = document.getElementById('print-root');
  let current = null, layout = null, printing = false, stopSound = null, returnFocus = null, pageStyle = null;

  const filename = ext => `SPORTS_BET_${current.id}.${ext}`;

  function renderSoundButton() {
    const on = getSound();
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.firstElementChild.textContent = on ? '🔊' : '🔈';
  }

  function finish() {
    if (!printing) return;
    printing = false;
    stopSound?.();
    stopSound = null;
    paper.style.animation = '';
    dialog.dataset.state = 'done';
    actions.querySelector('[data-ticket-action="print"]').focus();
  }

  async function open(ticket, { animate = true } = {}) {
    returnFocus = document.activeElement;
    current = ticket;
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
      return;
    }
    const duration = printDuration(ticket.picks.length);
    const steps = Math.max(8, Math.round(layout.height / LINE_UNITS));
    printing = true;
    dialog.dataset.state = 'printing';
    soundBtn.focus();
    paper.style.animation = 'none';
    void paper.offsetWidth;
    paper.style.animation = `print-feed ${duration}ms steps(${steps}, end) forwards`;
    if (getSound()) stopSound = feedSound(duration, steps);
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

  paper.addEventListener('animationend', e => { if (e.animationName === 'print-feed') finish(); });
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
    dialog.dataset.state = '';
    const target = returnFocus?.isConnected && returnFocus !== document.body && !returnFocus.disabled ? returnFocus : document.querySelector('[data-view-link="tickets"]');
    target?.focus();
  });
  soundBtn.addEventListener('click', () => {
    setSound(!getSound());
    renderSoundButton();
    if (!getSound()) { stopSound?.(); stopSound = null; }
  });
  window.addEventListener('afterprint', () => { printRoot.innerHTML = ''; });

  return { open, close, get ticket() { return current; } };
}
