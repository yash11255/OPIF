/**
 * Share-card image renderer. Draws branded cards on a <canvas> at exact pixel
 * sizes from real result data. Reusable: pass any `CardData` object.
 *
 * CardData: {
 *   eyebrow, valueText, unit, subtitle, insight, action, message,
 *   website, disclaimer, segments: [{ label, share }]
 * }
 */

export const FORMATS = Object.freeze({
  'ig-square': { label: 'Instagram square', w: 1080, h: 1080 },
  'ig-portrait': { label: 'Instagram portrait', w: 1080, h: 1350 },
  'li-square': { label: 'LinkedIn square', w: 1200, h: 1200 },
  story: { label: 'Instagram / WhatsApp Status', w: 1080, h: 1920 },
});

export const TEMPLATES = Object.freeze({
  classic: 'Classic OPIF',
  impact: 'Impact Report',
  commitment: 'Sustainability Commitment',
});

const C = { navy: '#00163f', mid: '#0a3060', blue: '#1e64a0', sky: '#2d7fc1', green: '#a4cd39', light: '#eef3f8', border: '#d0dcea', muted: '#4a6a8a', faint: '#7a9abf', white: '#ffffff' };
const SEG = [C.navy, C.blue, C.green, C.sky, C.faint, C.muted];
const HEAD = "'Plus Jakarta Sans', 'Roboto', Arial, sans-serif";
const BODY = "'Roboto', Arial, sans-serif";

const imageCache = new Map();
export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // card still renders; logo omitted
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

export async function loadAssets(base) {
  const [opif, opifWhite, csrbox] = await Promise.all([
    loadImage(`${base}opif_colored_logo.png`),
    loadImage(`${base}white_logo_new.png`),
    loadImage(`${base}csrbox_colored_logo.png`),
  ]);
  if (document.fonts && document.fonts.ready) {
    try {
      await Promise.all([
        document.fonts.load(`800 40px 'Plus Jakarta Sans'`, 'CO₂e'),
        document.fonts.load(`500 20px 'Roboto'`, 'CO₂e'),
      ]);
    } catch { /* system fallback fonts are acceptable */ }
  }
  return { opif, opifWhite, csrbox };
}

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws wrapped text; returns height used. Truncates with an ellipsis beyond maxLines. */
function para(ctx, dry, text, x, y, maxW, { size, weight = 400, color, font = BODY, lh = 1.4, maxLines = 4, align = 'left', italic = false }) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  let lines = wrap(ctx, text, maxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxW && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  if (!dry) {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
    const ax = align === 'center' ? x + maxW / 2 : x;
    lines.forEach((l, i) => ctx.fillText(l, ax, y + i * size * lh));
  }
  return lines.length * size * lh;
}

/** Large figure, shrunk to fit width. Returns height used. */
function figure(ctx, dry, value, unit, x, y, maxW, { size, color, unitColor, align = 'left' }) {
  let s = size;
  const fit = () => {
    ctx.font = `800 ${s}px ${HEAD}`; const vw = ctx.measureText(value).width;
    ctx.font = `600 ${s * 0.34}px ${HEAD}`; const uw = ctx.measureText(unit).width;
    return { vw, uw, total: vw + s * 0.18 + uw };
  };
  let m = fit();
  while (m.total > maxW && s > 40) { s -= 4; m = fit(); }
  if (!dry) {
    const startX = align === 'center' ? x + (maxW - m.total) / 2 : x;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `800 ${s}px ${HEAD}`; ctx.fillStyle = color;
    ctx.fillText(value, startX, y + s * 0.82);
    ctx.font = `600 ${s * 0.34}px ${HEAD}`; ctx.fillStyle = unitColor;
    ctx.fillText(unit, startX + m.vw + s * 0.18, y + s * 0.82);
  }
  return s * 0.95;
}

function logo(ctx, img, x, y, h, align = 'left') {
  if (!img) return 0;
  const w = (img.width / img.height) * h;
  ctx.drawImage(img, align === 'right' ? x - w : x, y, w, h);
  return w;
}

function eyebrow(ctx, dry, text, x, y, size, color, align = 'left', maxW = 0) {
  ctx.font = `700 ${size}px ${HEAD}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.18}px`;
  if (!dry) { ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = align; ctx.fillText(text.toUpperCase(), align === 'center' ? x + maxW / 2 : x, y); }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return size * 1.3;
}

function segmentsBar(ctx, dry, segments, x, y, w, s) {
  const h = 26 * s;
  const rows = segments.slice(0, 4);
  if (!dry) {
    let cx = x;
    segments.forEach((sg, i) => {
      const sw = w * sg.share;
      ctx.fillStyle = SEG[i % SEG.length];
      ctx.fillRect(cx, y, Math.max(sw, 0), h);
      cx += sw;
    });
  }
  let yy = y + h + 26 * s;
  rows.forEach((sg, i) => {
    if (!dry) {
      ctx.fillStyle = SEG[i % SEG.length]; ctx.fillRect(x, yy + 5 * s, 18 * s, 18 * s);
      ctx.font = `500 ${26 * s}px ${BODY}`; ctx.fillStyle = C.navy; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(sg.label, x + 32 * s, yy);
      ctx.font = `700 ${26 * s}px ${BODY}`; ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(sg.share * 100)}%`, x + w, yy);
    }
    yy += 42 * s;
  });
  return yy - y;
}

/* Templates: each returns { header, body, footer } draw functions sharing layout. */

function classic(ctx, d, W, H, a, s) {
  const m = 80 * s; const cw = W - 2 * m;
  ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, 10 * s);
  // header
  logo(ctx, a.opif, m, m * 0.8, 120 * s);
  if (a.csrbox) {
    ctx.font = `700 ${14 * s}px ${BODY}`; ctx.fillStyle = '#555'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('ANCHORED BY', W - m, m * 0.8 + 22 * s);
    logo(ctx, a.csrbox, W - m, m * 0.8 + 44 * s, 60 * s, 'right');
  }
  const headerBottom = m * 0.8 + 120 * s + 30 * s;
  ctx.fillStyle = C.border; ctx.fillRect(m, headerBottom, cw, 2 * s);

  const footerH = 150 * s;
  const body = (dry, y0) => {
    let y = y0;
    y += eyebrow(ctx, dry, d.eyebrow, m, y, 30 * s, C.blue) + 24 * s;
    y += figure(ctx, dry, d.valueText, d.unit, m, y, cw, { size: 190 * s, color: C.navy, unitColor: C.blue }) + 20 * s;
    y += para(ctx, dry, d.subtitle, m, y, cw, { size: 32 * s, color: C.muted, maxLines: 2 }) + 44 * s;
    if (d.insight) {
      const ih = para(ctx, true, d.insight, m + 34 * s, 0, cw - 60 * s, { size: 34 * s, weight: 500, color: C.navy, maxLines: 3 });
      if (!dry) { ctx.fillStyle = C.light; ctx.fillRect(m, y, cw, ih + 52 * s); ctx.fillStyle = C.green; ctx.fillRect(m, y, 8 * s, ih + 52 * s); }
      para(ctx, dry, d.insight, m + 34 * s, y + 26 * s, cw - 60 * s, { size: 34 * s, weight: 500, color: C.navy, maxLines: 3 });
      y += ih + 52 * s + 40 * s;
    }
    y += para(ctx, dry, `“${d.message}”`, m, y, cw, { size: 32 * s, color: C.navy, italic: true, maxLines: 3 });
    return y - y0;
  };
  const avail = H - footerH - headerBottom;
  const bh = body(true, 0);
  body(false, headerBottom + Math.max(40 * s, (avail - bh) / 2));

  ctx.fillStyle = C.navy; ctx.fillRect(0, H - footerH, W, footerH);
  para(ctx, false, `One Purpos India Forum  |  CSRBOX  ·  ${d.website}`, m, H - footerH + 34 * s, cw, { size: 28 * s, weight: 700, color: C.white, maxLines: 1 });
  para(ctx, false, d.disclaimer, m, H - footerH + 82 * s, cw, { size: 21 * s, color: 'rgba(255,255,255,.7)', maxLines: 2 });
}

function impact(ctx, d, W, H, a, s) {
  const m = 64 * s; const pad = 56 * s; const cw = W - 2 * m - 2 * pad;
  ctx.fillStyle = C.light; ctx.fillRect(0, 0, W, H);
  // header strip: white like the site's brand strip
  ctx.fillStyle = C.white; ctx.fillRect(0, 0, W, 170 * s);
  ctx.fillStyle = C.border; ctx.fillRect(0, 170 * s, W, 2 * s);
  logo(ctx, a.opif, m, 25 * s, 120 * s);
  logo(ctx, a.csrbox, W - m, 55 * s, 60 * s, 'right');

  const footerTop = H - 120 * s;
  const panelTop = 170 * s + 50 * s;
  const panelH = footerTop - panelTop - 30 * s;
  ctx.fillStyle = C.white; ctx.strokeStyle = C.border; ctx.lineWidth = 2 * s;
  ctx.fillRect(m, panelTop, W - 2 * m, panelH); ctx.strokeRect(m, panelTop, W - 2 * m, panelH);
  ctx.fillStyle = C.blue; ctx.fillRect(m, panelTop, W - 2 * m, 8 * s);

  const x = m + pad;
  const body = (dry, y0) => {
    let y = y0;
    y += eyebrow(ctx, dry, d.eyebrow, x, y, 28 * s, C.blue) + 18 * s;
    y += figure(ctx, dry, d.valueText, d.unit, x, y, cw, { size: 160 * s, color: C.navy, unitColor: C.blue }) + 12 * s;
    y += para(ctx, dry, d.subtitle, x, y, cw, { size: 28 * s, color: C.muted, maxLines: 2 }) + 40 * s;
    if (d.segments.length) {
      y += eyebrow(ctx, dry, 'Where the emissions come from', x, y, 22 * s, C.faint) + 18 * s;
      y += segmentsBar(ctx, dry, d.segments, x, y, cw, s) + 16 * s;
    }
    if (d.insight) y += para(ctx, dry, d.insight, x, y, cw, { size: 30 * s, weight: 700, color: C.navy, maxLines: 3 });
    return y - y0;
  };
  const bh = body(true, 0);
  body(false, panelTop + Math.max(pad, (panelH - bh) / 2));

  para(ctx, false, d.website, m, footerTop + 12 * s, W - 2 * m, { size: 26 * s, weight: 700, color: C.navy, maxLines: 1 });
  para(ctx, false, d.disclaimer, m, footerTop + 52 * s, W - 2 * m, { size: 20 * s, color: C.muted, maxLines: 2 });
}

function commitment(ctx, d, W, H, a, s) {
  const m = 80 * s; const cw = W - 2 * m;
  ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H);
  // The site's hero grid motif (44px lines at 3% white).
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
  const g = 44 * s;
  for (let gx = 0; gx < W; gx += g) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H); ctx.stroke(); }
  for (let gy = 0; gy < H; gy += g) { ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5); ctx.stroke(); }

  const lw = logo(ctx, a.opifWhite || a.opif, m, m * 0.7, 110 * s);
  if (a.csrbox) {
    const ch = 70 * s; const cwid = (a.csrbox.width / a.csrbox.height) * 46 * s + 32 * s;
    ctx.fillStyle = C.white; ctx.fillRect(W - m - cwid, m * 0.7 + 20 * s, cwid, ch);
    logo(ctx, a.csrbox, W - m - 16 * s, m * 0.7 + 32 * s, 46 * s, 'right');
  }
  void lw;
  const headerBottom = m * 0.7 + 110 * s + 40 * s;
  const footerH = 170 * s;

  const body = (dry, y0) => {
    let y = y0;
    y += eyebrow(ctx, dry, d.eyebrow, m, y, 30 * s, C.green) + 26 * s;
    y += figure(ctx, dry, d.valueText, d.unit, m, y, cw, { size: 190 * s, color: C.white, unitColor: '#93c5fd' }) + 16 * s;
    y += para(ctx, dry, d.subtitle, m, y, cw, { size: 30 * s, color: 'rgba(255,255,255,.65)', maxLines: 2 }) + 50 * s;
    if (d.action) {
      y += eyebrow(ctx, dry, d.actionLabel || 'My next step', m, y, 24 * s, C.green) + 14 * s;
      y += para(ctx, dry, d.action, m, y, cw, { size: 44 * s, weight: 700, font: HEAD, color: C.white, lh: 1.25, maxLines: 3 }) + 44 * s;
    }
    if (!dry) { ctx.fillStyle = C.green; ctx.fillRect(m, y, 80 * s, 6 * s); }
    y += 34 * s;
    y += para(ctx, dry, d.message, m, y, cw, { size: 32 * s, color: 'rgba(255,255,255,.85)', maxLines: 3 });
    return y - y0;
  };
  const avail = H - footerH - headerBottom;
  const bh = body(true, 0);
  body(false, headerBottom + Math.max(30 * s, (avail - bh) / 2));

  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(m, H - footerH, cw, 2 * s);
  para(ctx, false, `One Purpos India Forum  |  CSRBOX  ·  ${d.website}`, m, H - footerH + 30 * s, cw, { size: 27 * s, weight: 700, color: C.white, maxLines: 1 });
  para(ctx, false, d.disclaimer, m, H - footerH + 76 * s, cw, { size: 21 * s, color: 'rgba(255,255,255,.55)', maxLines: 2 });
}

const DRAW = { classic, impact, commitment };

/**
 * Render a card to the given canvas at exact format dimensions.
 */
export function renderCard(canvas, data, { template = 'classic', format = 'ig-square', assets = {} } = {}) {
  const fmt = FORMATS[format] || FORMATS['ig-square'];
  canvas.width = fmt.w; canvas.height = fmt.h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, fmt.w, fmt.h);
  ctx.imageSmoothingQuality = 'high';
  const s = fmt.w / 1080; // scale relative to the 1080 px design grid
  (DRAW[template] || classic)(ctx, data, fmt.w, fmt.h, assets, s);
  return canvas;
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}
