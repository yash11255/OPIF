/**
 * Small dependency-free SVG charts. Every chart is labelled with values in
 * text, and has an accessible summary, so meaning never depends on colour.
 */
import { formatKg, formatPercent, escapeHtml } from './format.js';

// OPIF palette: navy, brand blue, sky, CTA green, then muted blues.
export const SERIES = ['#00163f', '#1e64a0', '#a4cd39', '#2d7fc1', '#7a9abf', '#4a6a8a', '#c5d8ef'];

export function donutChart(items, { size = 220, thickness = 34, centerLabel = '', centerValue = '' } = {}) {
  const total = items.reduce((s, i) => s + i.kg, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = items.map((it, i) => {
    const frac = total > 0 ? it.kg / total : 0;
    const len = frac * circ;
    const seg = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${SERIES[i % SERIES.length]}" stroke-width="${thickness}"
      stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${c} ${c})"><title>${escapeHtml(it.label)}: ${formatKg(it.kg).text} (${formatPercent(frac)})</title></circle>`;
    offset += len;
    return seg;
  }).join('');
  const summary = items.map((it) => `${it.label} ${formatKg(it.kg).text} (${formatPercent(total ? it.kg / total : 0)})`).join('; ');
  const legend = items.map((it, i) => `
    <li><span class="cc-swatch" style="background:${SERIES[i % SERIES.length]}" aria-hidden="true"></span>
      <span class="cc-legend-label">${escapeHtml(it.label)}</span>
      <span class="cc-legend-val">${formatKg(it.kg).text}<small>${formatPercent(total ? it.kg / total : 0)}</small></span></li>`).join('');
  return `
    <figure class="cc-chart cc-donut">
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Share of emissions by category. ${escapeHtml(summary)}">
        <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#eef3f8" stroke-width="${thickness}"/>
        ${arcs}
        <text x="${c}" y="${c - 6}" text-anchor="middle" class="cc-donut-val">${escapeHtml(centerValue)}</text>
        <text x="${c}" y="${c + 16}" text-anchor="middle" class="cc-donut-lbl">${escapeHtml(centerLabel)}</text>
      </svg>
      <ul class="cc-legend">${legend}</ul>
    </figure>`;
}

export function barChart(items, { max } = {}) {
  const top = max ?? Math.max(...items.map((i) => i.kg), 0);
  const rows = items.map((it, i) => {
    const pct = top > 0 ? (it.kg / top) * 100 : 0;
    return `<li>
      <span class="cc-bar-label">${escapeHtml(it.label)}</span>
      <span class="cc-bar-track"><span class="cc-bar-fill" style="width:${pct.toFixed(2)}%;background:${it.color || SERIES[1]}"></span></span>
      <span class="cc-bar-val">${formatKg(it.kg).text}</span>
    </li>`;
  }).join('');
  const summary = items.map((it) => `${it.label}: ${formatKg(it.kg).text}`).join('; ');
  return `<figure class="cc-chart cc-bars" role="img" aria-label="${escapeHtml(summary)}"><ul aria-hidden="true">${rows}</ul></figure>`;
}

export function comparisonChart(baseKg, scenarioKg) {
  return barChart([
    { label: 'Current estimate', kg: baseKg, color: SERIES[0] },
    { label: 'With selected changes', kg: scenarioKg, color: SERIES[2] },
  ], { max: Math.max(baseKg, scenarioKg) });
}
