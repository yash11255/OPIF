/**
 * Report exports: CSV, PDF (jsPDF, generated in the browser) and print.
 * No data leaves the device.
 */
import { formatKg, formatNumber, formatPercent, PERIOD_NOUN } from './format.js';
import { rankCategories } from './engine.js';
import { recommendations } from './recommendations.js';

const today = () => new Date().toISOString().slice(0, 10);

export function reportTitle(result) {
  return 'Personal Carbon Footprint';
}

export function fileStem(result) {
  const base = 'opif-carbon-footprint';
  return `${base}-${today()}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-');
}

export function summaryRows(result) {
  const rows = [['Total emissions', formatKg(result.totalKg).text], ['Total (tonnes)', `${formatNumber(result.totalTonnes, 3)} t CO₂e`]];
  rows.push(['Assessment period', `One ${PERIOD_NOUN[result.period]}`]);
  if (result.scope === 'household') rows.push(['Per person', formatKg(result.perPersonKg).text]);
  if (result.period !== 'year') rows.push(['Annual equivalent', formatKg(result.annualisedKg).text]);
  rows.push(['Categories with data', `${result.completeness.provided} of ${result.completeness.applicable}`]);
  rows.push(['Share from measured inputs', formatPercent(result.measuredShare)]);
  return rows;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(result) {
  const out = [];
  out.push(['OPIF Carbon Footprint Calculator', reportTitle(result)]);
  out.push(['Generated', today()]);
  out.push([]);
  for (const r of summaryRows(result)) out.push(r);
  out.push([]);
  out.push(['Category', 'Line item', 'Quantity', 'Unit', 'Factor ID', 'Factor value', 'Factor unit', 'Emissions (kg)', 'Data quality', 'Note']);
  const fmap = Object.fromEntries(result.factorsUsed.map((f) => [f.id, f]));
  for (const l of result.lines) {
    const f = fmap[l.factorId];
    out.push([l.category, l.label, l.quantity, l.unit, l.factorId, f.value, `${f.output} per ${f.unit}`, l.kg, l.quality, l.note || '']);
  }
  out.push([]);
  out.push(['Category status']);
  for (const c of result.categories) out.push([c.label, c.status, c.kg]);
  if (result.unquantified.length) {
    out.push([]); out.push(['Recorded but not quantified']);
    for (const u of result.unquantified) out.push([u.label, u.value, u.reason]);
  }
  out.push([]);
  out.push(['Factor ID', 'Description', 'Value', 'Unit', 'Geography', 'Source', 'Year', 'URL', 'Verified', 'Limitations']);
  for (const f of result.factorsUsed) out.push([f.id, f.subcategory, f.value, `${f.output} per ${f.unit}`, f.geography, f.source, f.year, f.url, f.verified, f.limitations]);
  return '﻿' + out.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/* -------------------------------- PDF -------------------------------- */

// Standard PDF fonts cannot render subscript digits; use plain "CO2e".
const pdfText = (s) => String(s ?? '').replace(/₂/g, '2').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

async function imageData(src) {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ data: fr.result, w: img.width, h: img.height });
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function toPdf(result, { base = '', methodology = [] } = {}) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('PDF library not loaded');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const M = 16; const CW = W - 2 * M;
  const NAVY = [0, 22, 63]; const BLUE = [30, 100, 160]; const MUTED = [74, 106, 138]; const LIGHT = [238, 243, 248]; const BORDER = [208, 220, 234];
  let y = M;

  const [opif, csrbox] = await Promise.all([imageData(`${base}opif_colored_logo.png`), imageData(`${base}csrbox_colored_logo.png`)]);

  const header = () => {
    if (opif) doc.addImage(opif.data, 'PNG', M, 10, (opif.w / opif.h) * 18, 18);
    if (csrbox) { const w = (csrbox.w / csrbox.h) * 10; doc.addImage(csrbox.data, 'PNG', W - M - w, 14, w, 10); }
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3); doc.line(M, 32, W - M, 32);
    y = 40;
  };
  const footer = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFillColor(...NAVY); doc.rect(0, 287, W, 10, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
      doc.text('One Purpos India Forum | CSRBOX  ·  csrbox.org/opif  ·  Estimate only — not a verified carbon audit', M, 293);
      doc.text(`Page ${i} of ${n}`, W - M, 293, { align: 'right' });
    }
  };
  const ensure = (h) => { if (y + h > 280) { doc.addPage(); header(); } };
  const h2 = (t) => {
    ensure(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text(pdfText(t), M, y); y += 2;
    doc.setDrawColor(...BLUE); doc.setLineWidth(0.6); doc.line(M, y, M + 14, y); y += 6;
  };
  const para = (t, { size = 9, color = MUTED, bold = false } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfText(t), CW);
    for (const l of lines) { ensure(size * 0.45); doc.text(l, M, y); y += size * 0.45; }
    y += 2;
  };
  const table = (head, rows, widths) => {
    const lh = 4.2;
    const drawRow = (cells, isHead) => {
      doc.setFont('helvetica', isHead ? 'bold' : 'normal'); doc.setFontSize(8);
      const split = cells.map((c, i) => doc.splitTextToSize(pdfText(c), widths[i] - 3));
      const h = Math.max(...split.map((s) => s.length)) * lh + 2.5;
      ensure(h);
      if (isHead) { doc.setFillColor(...LIGHT); doc.rect(M, y - 3.6, CW, h, 'F'); }
      doc.setTextColor(...(isHead ? NAVY : [10, 34, 64]));
      let x = M;
      split.forEach((s, i) => { doc.text(s, x + 1.5, y); x += widths[i]; });
      y += h;
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.2); doc.line(M, y - 3.6, W - M, y - 3.6);
    };
    drawRow(head, true);
    rows.forEach((r) => drawRow(r, false));
    y += 4;
  };

  header();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLUE);
  doc.text('CARBON FOOTPRINT REPORT', M, y); y += 7;
  doc.setFontSize(18); doc.setTextColor(...NAVY);
  doc.text(doc.splitTextToSize(pdfText(reportTitle(result)), CW), M, y); y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text(`Generated ${today()} with the OPIF Carbon Footprint Calculator`, M, y); y += 8;

  const k = formatKg(result.totalKg);
  doc.setFillColor(...LIGHT); doc.rect(M, y, CW, 24, 'F');
  doc.setFillColor(164, 205, 57); doc.rect(M, y, 1.6, 24, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(...NAVY);
  doc.text(pdfText(k.value), M + 7, y + 15);
  const vw = doc.getTextWidth(pdfText(k.value));
  doc.setFontSize(12); doc.setTextColor(...BLUE); doc.text(pdfText(k.unit), M + 9 + vw, y + 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text('Estimated total. Grid electricity is CO2 only; all other factors are CO2e.', M + 7, y + 21);
  y += 32;

  h2('Summary');
  table(['Measure', 'Value'], summaryRows(result), [80, CW - 80]);

  const ranked = rankCategories(result);
  h2('Emissions by category');
  table(['Category', 'Emissions', 'Share', 'Status'],
    result.categories.map((c) => [c.label, c.status === 'included' ? formatKg(c.kg).text : '—', c.status === 'included' && result.totalKg > 0 ? formatPercent(c.kg / result.totalKg) : '—',
      c.status === 'included' ? 'Included' : c.status === 'excluded' ? 'Excluded by user' : 'Not provided']),
    [70, 40, 25, CW - 135]);
  if (result.completeness.missing.length || result.completeness.excluded.length) {
    para('This total is incomplete: categories marked "Not provided" or "Excluded" are not included and the actual footprint is higher.', { color: [150, 60, 0], bold: true });
  }

  h2('Activity inputs and calculation');
  table(['Item', 'Quantity', 'Factor', 'Emissions', 'Data'],
    result.lines.map((l) => {
      const f = result.factorsUsed.find((x) => x.id === l.factorId);
      return [l.label + (l.note ? ` (${l.note})` : ''), `${formatNumber(l.quantity, l.quantity < 10 ? 2 : 0)} ${l.unit}`, `${f.value} ${f.output}/${f.unit}`, formatKg(l.kg).text, l.quality];
    }), [58, 32, 42, 26, CW - 158]);

  if (result.unquantified.length) {
    h2('Recorded but not quantified');
    for (const u of result.unquantified) para(`${u.label}: ${u.value}. ${u.reason}`);
  }

  const recs = recommendations(result);
  if (recs.length) {
    h2('Reduction opportunities');
    for (const r of recs) { para(r.title + (r.share ? ` — relates to ${formatPercent(r.share)} of the total` : ''), { bold: true, color: NAVY }); para(r.text); }
  }
  if (ranked.length === 0) para('No emissions were calculated because no activity data was entered.');

  h2('Emission factors and sources');
  table(['Factor', 'Value', 'Geography', 'Source and year'],
    result.factorsUsed.map((f) => [f.subcategory, `${f.value} ${f.output} per ${f.unit}`, f.geography, `${f.source}, ${f.year}. ${f.url} (verified ${f.verified})`]),
    [40, 32, 36, CW - 108]);
  for (const f of result.factorsUsed) para(`${f.subcategory}: ${f.limitations}`, { size: 7.5 });

  h2('Methodology and limitations');
  for (const p of methodology) para(p, { size: 8.5 });

  footer();
  return doc.output('blob');
}
