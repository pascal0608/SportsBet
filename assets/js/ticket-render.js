import { ticketLayout } from './ticket-layout.js';

const FONTS = [
  ['TicketMono', 'assets/fonts/dejavu-sans-mono.woff'],
  ['TicketBold', 'assets/fonts/nimbus-sans-narrow-bold.woff'],
  ['TicketLogo', 'assets/fonts/nimbus-sans-bold-italic.woff'],
];
let fontsReady;

export function loadTicketFonts() {
  fontsReady ||= Promise.all(FONTS.map(async ([name, url]) => document.fonts.add(await new FontFace(name, `url(${url})`).load())));
  return fontsReady;
}

const FONT_FAMILY = { logo: 'TicketLogo', bold: 'TicketBold', symbol: '"Segoe UI Emoji", sans-serif', mono: 'TicketMono' };

export async function ticketCanvas(t) {
  await loadTicketFonts();
  const l = ticketLayout(t);
  if (l.height > 20000) throw Error('Use PDF for long tickets');
  const canvas = document.createElement('canvas');
  canvas.width = l.width * 2;
  canvas.height = l.height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('No canvas');
  ctx.scale(2, 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  for (const o of l.ops) {
    if (o.kind === 'text') {
      ctx.font = o.size + 'px ' + (FONT_FAMILY[o.font] || FONT_FAMILY.mono);
      ctx.textAlign = o.align;
      ctx.fillText(o.text, o.x, o.y);
    } else if (o.kind === 'line') {
      ctx.beginPath(); ctx.setLineDash([6, 5]); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x2, o.y); ctx.stroke(); ctx.setLineDash([]);
    } else if (o.kind === 'rect') {
      ctx.lineWidth = 2; ctx.strokeRect(o.x, o.y, o.w, o.h); ctx.lineWidth = 1;
    } else if (o.kind === 'bar') ctx.fillRect(o.x, o.y, o.w, o.h);
  }
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const g = Math.round(.299 * pixels.data[i] + .587 * pixels.data[i + 1] + .114 * pixels.data[i + 2]);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = g;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export async function ticketPng(t) {
  const canvas = await ticketCanvas(t);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('No image')), 'image/png'));
}

export async function ticketPdf(t) {
  const canvas = await ticketCanvas(t), raw = atob(canvas.toDataURL('image/jpeg', .98).split(',')[1]);
  const width = 227, height = canvas.height / canvas.width * width;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${raw.length} >>\nstream\n${raw}\nendstream`,
  ];
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => { offsets.push(result.length); result += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = result.length;
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const n of offsets.slice(1)) result += String(n).padStart(10, '0') + ' 00000 n \n';
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(result, c => c.charCodeAt(0));
}
