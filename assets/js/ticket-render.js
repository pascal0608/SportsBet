import { esc } from './format.js';
import { LEAF_PATH, paperPath, SHAMROCK_BOX, STEM_PATH, ticketLayout } from './ticket-layout.js';

export const PAPER = '#fffdf4';
export const INK = '#111111';

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
const MONO_FACES = [400, 700].flatMap(weight => [
  [weight, `assets/fonts/jetbrains-mono-latin-${weight}-normal.woff2`, LATIN],
  [weight, `assets/fonts/jetbrains-mono-latin-ext-${weight}-normal.woff2`, LATIN_EXT],
]);

const FAMILY = {
  mono: '"Ticket Mono", ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace',
  display: '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif',
};

let fontsReady;
export function loadTicketFonts() {
  fontsReady ||= Promise.allSettled([
    ...MONO_FACES.map(async ([weight, url, unicodeRange]) => {
      document.fonts.add(await new FontFace('Ticket Mono', `url(${url}) format('woff2')`, { weight: String(weight), unicodeRange }).load());
    }),
    document.fonts.load(`800 40px "Barlow Condensed"`, 'SPORTS BET ÉÀ'),
  ]);
  return fontsReady;
}

export const layoutFor = (t, player) => ticketLayout(t, { player });

export const STAMP_INK = '#0e8a49';

// Tampon dessiné dans un repère centré sur (0, 0), avant rotation.
export function stampMarkup(o) {
  const font = esc(FAMILY.display);
  return `<rect x="${-o.w / 2}" y="${-o.h / 2}" width="${o.w}" height="${o.h}" rx="18" fill="none" stroke="${STAMP_INK}" stroke-width="8"/>`
    + `<rect x="${-o.w / 2 + 14}" y="${-o.h / 2 + 14}" width="${o.w - 28}" height="${o.h - 28}" rx="9" fill="none" stroke="${STAMP_INK}" stroke-width="3"/>`
    + `<text y="36" text-anchor="middle" font-family="${font}" font-size="104" font-weight="800" letter-spacing="6" fill="${STAMP_INK}">${esc(o.text)}</text>`;
}

// Boîte englobante du tampon tourné, pour que le masque d'encre ne rogne pas les coins.
export function stampBounds(o) {
  const a = Math.abs(o.angle) * Math.PI / 180;
  return { w: o.w * Math.cos(a) + o.h * Math.sin(a) + 16, h: o.w * Math.sin(a) + o.h * Math.cos(a) + 16 };
}

export const stampSvg = o => {
  const b = stampBounds(o);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-b.w / 2} ${-b.h / 2} ${b.w} ${b.h}" aria-hidden="true"><g transform="rotate(${o.angle})">${stampMarkup(o)}</g></svg>`;
};

export function ticketSvg(layout, label, { stamp = true } = {}) {
  const { width, height, ops } = layout;
  const parts = [`<path d="${paperPath(width, height)}" fill="${PAPER}"/>`];
  for (const o of ops) {
    if (o.kind === 'text') {
      const anchor = o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start';
      parts.push(`<text x="${o.x}" y="${o.y}" font-family="${esc(FAMILY[o.font])}" font-size="${o.size}" font-weight="${o.weight}" text-anchor="${anchor}" fill="${o.fill === 'paper' ? PAPER : INK}" xml:space="preserve">${esc(o.text)}</text>`);
    } else if (o.kind === 'rule') {
      const dash = o.style === 'dash' ? ' stroke-dasharray="10 7"' : o.style === 'dot' ? ' stroke-dasharray="2 6" stroke-linecap="round"' : '';
      parts.push(`<line x1="${o.x1}" y1="${o.y}" x2="${o.x2}" y2="${o.y}" stroke="${INK}" stroke-width="${o.style === 'solid' ? 3 : 2}"${dash}/>`);
    } else if (o.kind === 'bar' || o.kind === 'box') {
      parts.push(`<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${INK}"/>`);
    } else if (o.kind === 'stamp') {
      if (stamp) parts.push(`<g transform="translate(${o.x} ${o.y}) rotate(${o.angle}) scale(${o.scale ?? 1})" opacity=".92">${stampMarkup(o)}</g>`);
    } else if (o.kind === 'shamrock') {
      const k = o.size / SHAMROCK_BOX;
      parts.push(`<g transform="translate(${o.x} ${o.y}) scale(${k})" fill="${INK}">${[0, 120, -120].map(a => `<path transform="rotate(${a})" d="${LEAF_PATH}"/>`).join('')}<path d="${STEM_PATH}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/></g>`);
    }
  }
  return `<svg class="ticket-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${parts.join('')}</svg>`;
}

const MAX_CANVAS_SIDE = 16000;

export async function ticketCanvas(layout, { background = null, scale = 2 } = {}) {
  await loadTicketFonts();
  const { width, height, ops } = layout;
  scale = Math.min(scale, MAX_CANVAS_SIDE / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('Canvas indisponible');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.scale(scale, scale);
  ctx.fillStyle = PAPER;
  ctx.fill(new Path2D(paperPath(width, height)));
  ctx.textBaseline = 'alphabetic';
  for (const o of ops) {
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    if (o.kind === 'text') {
      ctx.font = `${o.weight} ${o.size}px ${FAMILY[o.font]}`;
      ctx.textAlign = o.align;
      if (o.fill === 'paper') ctx.fillStyle = PAPER;
      ctx.fillText(o.text, o.x, o.y);
    } else if (o.kind === 'rule') {
      ctx.beginPath();
      ctx.lineWidth = o.style === 'solid' ? 3 : 2;
      ctx.lineCap = o.style === 'dot' ? 'round' : 'butt';
      ctx.setLineDash(o.style === 'dash' ? [10, 7] : o.style === 'dot' ? [2, 6] : []);
      ctx.moveTo(o.x1, o.y);
      ctx.lineTo(o.x2, o.y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (o.kind === 'bar' || o.kind === 'box') {
      ctx.fillRect(o.x, o.y, o.w, o.h);
    } else if (o.kind === 'stamp') {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle * Math.PI / 180);
      ctx.scale(o.scale ?? 1, o.scale ?? 1);
      ctx.globalAlpha = .92;
      ctx.strokeStyle = ctx.fillStyle = STAMP_INK;
      ctx.lineWidth = 8;
      const box = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.stroke(); };
      box(-o.w / 2, -o.h / 2, o.w, o.h, 18);
      ctx.lineWidth = 3;
      box(-o.w / 2 + 14, -o.h / 2 + 14, o.w - 28, o.h - 28, 9);
      ctx.textAlign = 'center';
      ctx.letterSpacing = '6px';
      ctx.font = `800 104px ${FAMILY.display}`;
      ctx.fillText(o.text, 0, 36);
      ctx.letterSpacing = '0px';
      ctx.restore();
    } else if (o.kind === 'shamrock') {
      const k = o.size / SHAMROCK_BOX, leaf = new Path2D(LEAF_PATH);
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(k, k);
      for (const a of [0, 120, -120]) { ctx.save(); ctx.rotate(a * Math.PI / 180); ctx.fill(leaf); ctx.restore(); }
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke(new Path2D(STEM_PATH));
      ctx.restore();
    }
  }
  return canvas;
}

export async function ticketPng(layout) {
  const canvas = await ticketCanvas(layout);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Image indisponible')), 'image/png'));
}

const PT_PER_MM = 72 / 25.4;
export const PAPER_MM = 80;
export const heightMm = layout => layout.height / layout.width * PAPER_MM;

export async function ticketPdf(layout) {
  const canvas = await ticketCanvas(layout, { background: '#ffffff' });
  const raw = atob(canvas.toDataURL('image/jpeg', .95).split(',')[1]);
  const width = +(PAPER_MM * PT_PER_MM).toFixed(2), height = +(heightMm(layout) * PT_PER_MM).toFixed(2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${raw.length} >>\nstream\n${raw}\nendstream`,
  ];
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  let result = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => { offsets.push(result.length); result += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = result.length;
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const n of offsets) result += String(n).padStart(10, '0') + ' 00000 n \n';
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([Uint8Array.from(result, c => c.charCodeAt(0))], { type: 'application/pdf' });
}
