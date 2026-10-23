/** Display formatting. Values are rounded here only — never in the engine. */

export function formatNumber(n, digits = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Chooses kg or tonnes and a sensible precision. */
export function formatKg(kg) {
  if (!Number.isFinite(kg)) return { value: '—', unit: 'kg CO₂e', text: '—' };
  let value; let unit;
  if (Math.abs(kg) >= 1000) {
    const t = kg / 1000;
    value = formatNumber(t, t >= 100 ? 0 : t >= 10 ? 1 : 2);
    unit = 't CO₂e';
  } else {
    value = formatNumber(kg, kg >= 10 ? 0 : kg >= 1 ? 1 : 2);
    unit = 'kg CO₂e';
  }
  return { value, unit, text: `${value} ${unit}` };
}

export function formatPercent(ratio, digits = 0) {
  return `${formatNumber(ratio * 100, digits)}%`;
}

export const PERIOD_LABEL = { week: 'per week', month: 'per month', year: 'per year' };
export const PERIOD_NOUN = { week: 'week', month: 'month', year: 'year' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
