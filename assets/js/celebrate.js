const CONFETTI = ['#ffcc1a', '#3ddc84', '#1d5cff', '#ffffff', '#ff6b6b', '#ffd84d', '#7ff0b0'];
const GRAVITY = 0.36;
const rand = (a, b) => a + Math.random() * (b - a);

// Confettis et pièces sur un canvas plein écran ; s'arrête seul quand tout est retombé.
export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  let items = [], frame = 0, last = 0, spawners = [], w = 0, h = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const confetti = (x, y, vx, vy) => items.push({
    kind: 'confetti', x, y, vx, vy, w: rand(6, 11), h: rand(9, 16), rot: rand(0, Math.PI), vr: rand(-.25, .25),
    tilt: rand(0, Math.PI), vt: rand(.08, .22), sway: rand(.6, 1.6), color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
  });
  const coin = (x, y, vx, vy) => items.push({ kind: 'coin', x, y, vx, vy, r: rand(8, 14), spin: rand(0, Math.PI), vs: rand(.12, .3) });

  function cannon(fromLeft) {
    const x = fromLeft ? -10 : w + 10, y = h * .92;
    for (let i = 0; i < 90; i++) {
      const angle = -rand(52, 78) * Math.PI / 180;
      const speed = Math.sqrt(2 * GRAVITY * h * rand(.55, .95)) * 1.05;
      const vx = Math.cos(angle) * speed * (fromLeft ? 1 : -1), vy = Math.sin(angle) * speed;
      if (i % 6 === 0) coin(x, y, vx * .8, vy * .9);
      else confetti(x, y, vx, vy);
    }
  }

  function rain(duration) {
    const start = performance.now();
    spawners.push(now => {
      if (now - start > duration) return false;
      if (Math.random() < .55) coin(rand(w * .1, w * .9), -20, rand(-1, 1), rand(1, 4));
      if (Math.random() < .35) confetti(rand(0, w), -20, rand(-1, 1), rand(1, 3));
      return true;
    });
  }

  function drawCoin(c) {
    const sx = Math.max(.12, Math.abs(Math.cos(c.spin)));
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(sx, 1);
    const g = ctx.createRadialGradient(-c.r * .35, -c.r * .35, c.r * .1, 0, 0, c.r);
    g.addColorStop(0, '#fff6c2');
    g.addColorStop(.45, '#ffd84d');
    g.addColorStop(1, '#c98a00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#a86f00';
    ctx.stroke();
    if (sx > .55) {
      ctx.fillStyle = 'rgb(168 111 0 / .85)';
      ctx.font = `800 ${Math.round(c.r * 1.15)}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('€', 0, 1);
    }
    ctx.restore();
  }

  function drawConfetti(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.scale(1, Math.cos(c.tilt));
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }

  function tick(now) {
    const f = Math.min(3, (now - (last || now)) / 16.67 || 1);
    last = now;
    spawners = spawners.filter(s => s(now));
    ctx.clearRect(0, 0, w, h);
    for (const p of items) {
      if (p.kind === 'confetti') {
        p.vx *= Math.pow(.985, f);
        p.vy = Math.min(p.vy + GRAVITY * .55 * f, 3.4);
        p.tilt += p.vt * f;
        p.rot += p.vr * f;
        p.x += (p.vx + Math.sin(p.tilt) * p.sway) * f;
        p.y += p.vy * f;
        drawConfetti(p);
      } else {
        p.vx *= Math.pow(.995, f);
        p.vy += GRAVITY * f;
        p.spin += p.vs * f;
        p.x += p.vx * f;
        p.y += p.vy * f;
        drawCoin(p);
      }
    }
    items = items.filter(p => p.y < h + 60 && p.x > -80 && p.x < w + 80);
    if (items.length || spawners.length) frame = requestAnimationFrame(tick);
    else stop();
  }

  function start() {
    cancelAnimationFrame(frame);
    last = 0;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    items = [];
    spawners = [];
    ctx.clearRect(0, 0, w, h);
  }

  return {
    burst() { resize(); cannon(true); cannon(false); start(); },
    rain(duration) { resize(); rain(duration); start(); },
    stop,
  };
}

// Impact, fanfare et pièces, synthétisés en WebAudio (aucun fichier audio).
export function winSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const t = ctx.currentTime + .02;
  const out = ctx.createGain();
  out.gain.value = .45;
  out.connect(ctx.destination);

  const tone = (type, freq, at, length, peak, target = out) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + .012);
    g.gain.exponentialRampToValueAtTime(.0001, at + length);
    o.connect(g).connect(target);
    o.start(at);
    o.stop(at + length + .05);
    return o;
  };

  tone('sine', 140, t, .35, .9).frequency.exponentialRampToValueAtTime(42, t + .3);

  const brass = ctx.createBiquadFilter();
  brass.type = 'lowpass';
  brass.frequency.value = 2400;
  brass.connect(out);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('square', f, t + .14 + i * .085, .22, .07, brass));
  [523.25, 659.25, 783.99, 1046.5].forEach(f => tone('sawtooth', f, t + .5, .9, .045, brass));

  for (let i = 0; i < 12; i++) {
    const at = t + .55 + Math.random() * 1.9;
    tone('sine', 2637 * rand(.97, 1.03), at, .16, .09);
    tone('sine', 3951 * rand(.97, 1.03), at + .01, .12, .05);
  }
  setTimeout(() => ctx.close(), 3600);
}

export function countUp(el, to, format, duration = 1200) {
  const start = performance.now();
  let frame = 0;
  const step = now => {
    const k = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(2, -10 * k);
    el.textContent = format(k === 1 ? to : Math.round(to * eased * 100) / 100);
    if (k < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
