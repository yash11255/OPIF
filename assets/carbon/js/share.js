/**
 * Sharing utilities and deterministic card/caption builders.
 * Nothing is posted automatically: every action is user-initiated and only
 * reports success when the browser API resolves.
 */
import { formatKg, formatPercent, PERIOD_NOUN } from './format.js';
import { rankCategories } from './engine.js';
import { recommendations } from './recommendations.js';

export const WEBSITE = 'csrbox.org/opif';

const POSITIVE = [
  'Measure your impact. Take steps towards a more sustainable future.',
  'Understanding our footprint is the first step to reducing it.',
];

export function buildCardData(result) {
  const k = formatKg(result.totalKg);
  const ranked = rankCategories(result);
  const total = result.totalKg;
  const top = ranked[0];
  const rec = recommendations(result).find((r) => r.id !== 'data');
  const segments = ranked.map((c) => ({ label: c.label, share: total > 0 ? c.kg / total : 0 }));

  const subtitle = `Estimated emissions for one ${PERIOD_NOUN[result.period]} · about ${formatKg(result.annualisedKg).text} a year`;

  const insight = top ? `Top contributing category: ${top.label} (${formatPercent(top.kg / total)})` : '';

  return {
    eyebrow: 'My Carbon Footprint',
    valueText: k.value,
    unit: k.unit,
    subtitle,
    insight,
    actionLabel: 'My next step',
    action: rec ? rec.title : 'Keep measuring and look for practical reductions',
    message: POSITIVE[0],
    website: WEBSITE,
    disclaimer: `Estimate based on self-reported activity data and published emission factors; not a verified carbon audit.`,
    segments,
  };
}

/** Caption never includes totals, rankings or any link. */
export function buildCaption() {
  return `I've taken a step towards understanding my environmental impact with the Carbon Footprint Calculator from One Purpos India Forum by CSRBOX.\n\nMeasuring our footprint is an important starting point for making more informed, sustainable choices.\n\n#OPIF #CSRBOX #Sustainability #CarbonFootprint`;
}

export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // Fallback for non-secure contexts (e.g. local http preview).
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('Copy not supported');
  return true;
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 'files' | 'link' | 'none' */
export function nativeShareSupport(file) {
  if (!navigator.share) return 'none';
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) return 'files';
  return 'link';
}

/**
 * Uses the Web Share API. Resolves 'shared' only when the share sheet
 * completes, 'cancelled' if the user dismisses it.
 */
export async function nativeShare({ file, text, title }) {
  const support = nativeShareSupport(file);
  if (support === 'none') return 'unsupported';
  const payload = support === 'files' ? { files: [file], text, title } : { text, title };
  try {
    await navigator.share(payload);
    return 'shared';
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}
