/**
 * UI controller for the OPIF Carbon Footprint Calculator.
 * Views: landing → steps → review → results → share card.
 */
import { calculatePersonal, rankCategories, rankLines, readNumber } from './engine.js';
import { STEPS, toEngineState, getPath, setPath, applyDefaults } from './forms.js';
import { recommendations, scenarioOptions, runScenario } from './recommendations.js';
import { donutChart, barChart, comparisonChart, SERIES } from './charts.js';
import { formatKg, formatNumber, formatPercent, escapeHtml, PERIOD_LABEL, PERIOD_NOUN } from './format.js';
import { toCsv, toPdf, fileStem, summaryRows, reportTitle } from './export.js';
import { FORMATS, TEMPLATES, renderCard, loadAssets, canvasToBlob } from './share-card.js';
import { track } from './track.js';
import { buildCardData, buildCaption, whatsappUrl, copyText, downloadBlob, nativeShare, nativeShareSupport } from './share.js';

const root = document.getElementById('cc-app');
const BASE = root.dataset.assetBase || '';
const STORE_KEY = 'opif-carbon-v2';

export const METHODOLOGY = [
  'Emissions are calculated as activity data × emission factor for each line item, summed without intermediate rounding. Values are rounded only for display.',
  'Indian grid electricity uses the Central Electricity Authority CO2 Baseline Database v21.0 weighted average for FY 2024-25 (0.710 kg CO2/kWh). This factor covers CO2 only and excludes transmission and distribution losses, so electricity results are likely conservative.',
  'Fuel and transport factors are from the UK Government (DESNZ) 2025 greenhouse gas conversion factors. Where no Indian factor was available, UK factors are used as documented proxies; their limitations are listed with each factor. Fuel factors cover combustion only (well-to-tank excluded).',
  'Flight factors include a radiative forcing uplift for non-CO2 effects at altitude, as recommended by DESNZ.',
  'Diet, shopping and waste are not included, so the total under-represents your full footprint.',
  'This is an estimate based on self-reported data. It is not a verified carbon audit and does not claim compliance with the GHG Protocol, ISO 14064 or any other standard.',
];

const KIND = { steps: STEPS, title: 'Carbon Footprint' };

let app = load() || { view: 'landing', kind: 'personal', step: 0, states: { personal: {} } };
let assetsPromise = null;
let card = { template: 'classic', format: 'ig-square', caption: null };
let scenarioValues = {};

function save() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(app)); } catch { /* storage unavailable: state stays in memory */ }
}
function load() {
  try { const s = JSON.parse(sessionStorage.getItem(STORE_KEY)); return s && s.states ? s : null; } catch { return null; }
}

const state = () => app.states.personal;
const kindDef = () => KIND;
const visibleSteps = () => STEPS;
const calc = () => calculatePersonal(toEngineState(state()));

function go(view, patch = {}) {
  Object.assign(app, { view }, patch);
  save();
  render();
  const h = root.querySelector('h2, h1');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/* ----------------------------- rendering ----------------------------- */

function render() {
  if (app.view === 'landing') root.innerHTML = landing();
  else if (app.view === 'step') root.innerHTML = stepView();
  else if (app.view === 'review') root.innerHTML = reviewView();
  else if (app.view === 'results') root.innerHTML = resultsView();
  else if (app.view === 'card') { root.innerHTML = cardView(); drawCard(); }
}

function landing() {
  const started = Object.keys(state()).length > 2;
  return `
  <section class="cc-hero">
    <div class="cc-wrap">
      <span class="eyebrow">Sustainability at OPIF</span>
      <h1 class="cc-h1">Carbon Footprint Calculator</h1>
      <p class="cc-lead">Understand your footprint. Measure your impact. Make more sustainable choices.</p>
      <p class="cc-sub">Answer a few questions about your home and travel — about two minutes — to estimate your monthly emissions and see where you can reduce them.</p>
      <div class="cc-actions cc-hero-actions">
        <button class="cc-btn cc-btn--cta" data-action="start">${started ? 'Continue' : 'Calculate my footprint'}</button>
        ${started ? '<button class="cc-btn cc-btn--onDark" data-action="reset">Start again</button>' : ''}
      </div>
    </div>
  </section>
  <section class="cc-section cc-section--grey">
    <div class="cc-wrap">
      <div class="cc-info-grid">
        <div><h3>What it measures</h3><p>Estimated greenhouse gas emissions (CO₂e) from your home electricity, cooking gas and travel. Anything left blank is not counted.</p></div>
        <div><h3>How it works</h3><p>Each answer is multiplied by a published emission factor — Central Electricity Authority data for Indian electricity and UK Government (DESNZ 2025) factors for fuels and travel.</p></div>
        <div><h3>Good to know</h3><p>This is an estimate, not a verified carbon audit. Diet, shopping and waste are not included.</p></div>
      </div>
      <p class="cc-privacy"><strong>Privacy:</strong> your answers are calculated in your browser and are never sent anywhere. No sign-up is needed. To understand how the calculator is used.</p>
    </div>
  </section>`;
}

function progress(steps, current) {
  const items = [...steps.map((s) => s.title), 'Review'];
  return `<ol class="cc-progress" aria-label="Progress">${items.map((t, i) => `
    <li class="${i < current ? 'is-done' : ''} ${i === current ? 'is-current' : ''}" ${i === current ? 'aria-current="step"' : ''}>
      <span class="cc-progress-n">${i + 1}</span><span class="cc-progress-t">${escapeHtml(t)}</span></li>`).join('')}</ol>
    <p class="cc-progress-text">Step ${current + 1} of ${items.length}</p>`;
}

function fieldId(path) { return `f-${path.replace(/\./g, '-')}`; }

function fieldHtml(f, s, errors) {
  if (f.when && !f.when(s)) return '';
  const id = fieldId(f.path || Math.random().toString(36).slice(2));
  const val = f.path ? getPath(s, f.path) : undefined;
  const err = errors.find((e) => e.path === f.path);
  const errHtml = err ? `<p class="cc-error" id="${id}-err">${escapeHtml(err.message)}</p>` : '';
  const hint = f.hint ? `<p class="cc-hint" id="${id}-hint">${escapeHtml(f.hint)}</p>` : '';
  const described = [f.hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ');
  const aria = `${described ? `aria-describedby="${described}"` : ''} ${err ? 'aria-invalid="true"' : ''}`;
  switch (f.type) {
    case 'note': return `<p class="cc-note">${escapeHtml(f.text)}</p>`;
    case 'number': return `
      <div class="cc-field ${err ? 'has-error' : ''}">
        <label for="${id}">${escapeHtml(f.label)}</label>
        <div class="cc-input-unit">
          <input id="${id}" type="text" inputmode="decimal" autocomplete="off" data-path="${f.path}" value="${escapeHtml(val ?? '')}" placeholder="${escapeHtml(f.placeholder || '')}" ${aria}>
          <span class="cc-unit" aria-hidden="true">${escapeHtml(f.unit)}</span>
        </div>${hint}${errHtml}
      </div>`;
    case 'text': return `
      <div class="cc-field"><label for="${id}">${escapeHtml(f.label)} <span class="cc-optional">(optional)</span></label>
        <input id="${id}" type="text" data-path="${f.path}" value="${escapeHtml(val ?? '')}" maxlength="${f.maxLength || 100}" placeholder="${escapeHtml(f.placeholder || '')}">${hint}</div>`;
    case 'select': return `
      <div class="cc-field"><label for="${id}">${escapeHtml(f.label)}</label>
        <select id="${id}" data-path="${f.path}" ${aria}>${f.options.map(([v, l]) => `<option value="${escapeHtml(v)}" ${String(val ?? '') === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>${hint}</div>`;
    case 'segmented': return `
      <fieldset class="cc-field cc-seg"><legend>${escapeHtml(f.label)}</legend><div class="cc-seg-opts">
        ${f.options.map(([v, l]) => `<label class="cc-seg-opt"><input type="radio" name="${id}" data-path="${f.path}" value="${escapeHtml(v)}" ${val === v ? 'checked' : ''} data-rerender="1"><span>${escapeHtml(l)}</span></label>`).join('')}
      </div></fieldset>`;
    case 'checkbox': return `
      <div class="cc-field cc-check"><label><input type="checkbox" data-path="${f.path}" ${val ? 'checked' : ''}> <span>${escapeHtml(f.label)}</span></label></div>`;
    default: return '';
  }
}

function stepView() {
  const steps = visibleSteps();
  const idx = Math.min(app.step, steps.length - 1);
  const step = steps[idx];
  const s = state();
  const errors = app.showErrors ? stepErrors(step) : [];
  const excluded = step.category && s.excluded && s.excluded[step.category];
  return `
  <section class="cc-section cc-section--grey cc-flow">
    <div class="cc-wrap">
      <p class="cc-crumb"><button class="cc-link" data-action="home">Carbon Footprint Calculator</button> / ${escapeHtml(kindDef().title)}</p>
      ${progress(steps, idx)}
      <form class="cc-panel" novalidate data-form="step">
        <h2>${escapeHtml(step.title)}</h2>
        ${step.intro ? `<p class="cc-intro">${escapeHtml(step.intro)}</p>` : ''}
        ${errors.length ? `<div class="cc-alert" role="alert">Please correct ${errors.length === 1 ? 'the highlighted field' : `${errors.length} highlighted fields`} before continuing.</div>` : ''}
        ${step.category ? `<div class="cc-exclude"><label><input type="checkbox" data-exclude="${step.category}" ${excluded ? 'checked' : ''}> Exclude this category from the total</label>
          ${excluded ? '<p class="cc-warn">Excluded categories make the event total incomplete. This will be stated on the results, report and card.</p>' : ''}</div>` : ''}
        <div class="${excluded ? 'cc-dim' : ''}">
        ${step.groups.map((g) => `
          <div class="cc-group">
            ${g.title ? `<h3>${escapeHtml(g.title)}</h3>` : ''}
            <div class="cc-fields">${g.fields.map((f) => fieldHtml(f, s, errors)).join('')}</div>
          </div>`).join('')}
        </div>
        <div class="cc-nav">
          ${idx > 0 ? '<button type="button" class="cc-btn cc-btn--ghost" data-action="prev">Previous</button>' : '<button type="button" class="cc-btn cc-btn--ghost" data-action="home">Back to calculators</button>'}
          <button type="submit" class="cc-btn cc-btn--primary">${idx === steps.length - 1 ? 'Review answers' : 'Next'}</button>
        </div>
      </form>
    </div>
  </section>`;
}

function stepErrors(step) {
  const s = state();
  const errors = [];
  for (const g of step.groups) for (const f of g.fields) {
    if (f.type === 'number') readNumber(errors, f.path, getPath(s, f.path), { integer: !!f.integer, min: f.path === 'home.people' ? 1 : 0 });
  }
  return errors;
}

function displayValue(f, v) {
  if (f.type === 'checkbox') return v ? 'Yes' : 'No';
  if (f.type === 'segmented' || f.type === 'select') { const o = f.options.find(([k]) => k === v); return o ? o[1] : v; }
  if (f.type === 'number') return `${v} ${f.unit}`;
  return v;
}

function reviewView() {
  const steps = visibleSteps();
  const s = state();
  const r = calc();
  const sections = steps.map((step, i) => {
    const rows = [];
    for (const g of step.groups) for (const f of g.fields) {
      if (!f.path || (f.when && !f.when(s)) || f.type === 'note') continue;
      const v = getPath(s, f.path);
      if (v === undefined || v === '' || v === null) continue;
      if ((f.type === 'segmented' || f.type === 'checkbox') && !groupHasNumbers(g, s)) continue;
      rows.push(`<tr><th scope="row">${escapeHtml(g.title ? `${g.title} — ` : '')}${escapeHtml(f.label)}</th><td>${escapeHtml(displayValue(f, v))}</td></tr>`);
    }
    const ex = step.category && s.excluded && s.excluded[step.category];
    return `<div class="cc-review-sec">
      <div class="cc-review-head"><h3>${escapeHtml(step.title)}</h3><button class="cc-link" data-action="edit" data-step="${i}">Edit<span class="cc-sr"> ${escapeHtml(step.title)}</span></button></div>
      ${ex ? '<p class="cc-warn">Excluded from the total.</p>' : ''}
      ${rows.length ? `<table class="cc-table cc-table--kv"><tbody>${rows.join('')}</tbody></table>` : '<p class="cc-muted">Nothing entered.</p>'}
    </div>`;
  }).join('');
  return `
  <section class="cc-section cc-section--grey cc-flow">
    <div class="cc-wrap">
      <p class="cc-crumb"><button class="cc-link" data-action="home">Carbon Footprint Calculator</button> / ${escapeHtml(kindDef().title)}</p>
      ${progress(steps, steps.length)}
      <div class="cc-panel">
        <h2>Review your answers</h2>
        <p class="cc-intro">Check the figures below. Use Edit to change a section; your other answers are kept.</p>
        ${STEPS.some((st) => stepErrors(st).length) ? '<div class="cc-alert" role="alert">Some values are invalid and will be ignored. Use Edit to correct them.</div>' : ''}
        ${!r.hasData ? '<div class="cc-alert" role="status">No activity data has been entered yet, so there is nothing to calculate. Add at least one value.</div>' : ''}
        ${sections}
        <div class="cc-nav">
          <button type="button" class="cc-btn cc-btn--ghost" data-action="prev">Previous</button>
          <span class="cc-nav-spacer"></span>
          <button type="button" class="cc-btn cc-btn--ghost" data-action="reset">Start again</button>
          <button type="button" class="cc-btn cc-btn--primary" data-action="calculate" ${r.hasData ? '' : 'disabled'}>Calculate footprint</button>
        </div>
      </div>
    </div>
  </section>`;
}

function groupHasNumbers(g, s) {
  return g.fields.some((f) => (f.type === 'number' || f.type === 'text' || (f.type === 'select' && f.path === 'lifestyle.diet')) && (!f.when || f.when(s)) && getPath(s, f.path) !== undefined && getPath(s, f.path) !== '')
    || g.fields.every((f) => f.type !== 'number');
}

function tile(label, value, sub = '') {
  return `<div class="cc-tile"><span class="cc-tile-l">${escapeHtml(label)}</span><span class="cc-tile-v">${value}</span>${sub ? `<span class="cc-tile-s">${escapeHtml(sub)}</span>` : ''}</div>`;
}

function kgHtml(kg) {
  const k = formatKg(kg);
  return `${k.value} <small>${k.unit}</small>`;
}

function resultsView() {
  const r = calc();
  const ranked = rankCategories(r);
  const lines = rankLines(r).slice(0, 8);
  const recs = recommendations(r);
  const scen = scenarioOptions(r);
  const incomplete = r.completeness.missing.length || r.completeness.excluded.length;
  const tiles = [];
  tiles.push(tile('Your footprint per month', kgHtml(r.totalKg), r.householdSize > 1 ? `Your share of a ${r.householdSize}-person home` : ''));
  tiles.push(tile('Per year', kgHtml(r.annualisedKg), 'Monthly × 12'));

  const catColors = Object.fromEntries(ranked.map((c, i) => [c.key, SERIES[i % SERIES.length]]));
  const statusRows = r.categories.filter((c) => c.status !== 'not_provided' || r.completeness.missing.includes(c.key)).map((c) => `
    <tr><th scope="row">${escapeHtml(c.label)}</th>
      <td>${c.status === 'included' ? formatKg(c.kg).text : '—'}</td>
      <td>${c.status === 'included' && r.totalKg ? formatPercent(c.kg / r.totalKg) : '—'}</td>
      <td><span class="cc-status cc-status--${c.status}">${c.status === 'included' ? (c.estimated > 0 ? (c.measured > 0 ? 'Measured + estimated' : 'Estimated') : 'Measured') : c.status === 'excluded' ? 'Excluded' : 'Not provided'}</span></td></tr>`).join('');

  return `
  <section class="cc-section cc-section--grey cc-flow">
    <div class="cc-wrap">
      <p class="cc-crumb"><button class="cc-link" data-action="home">Carbon Footprint Calculator</button> / ${escapeHtml(kindDef().title)} / Results</p>
      <div class="cc-results-head">
        <div>
          <span class="eyebrow eyebrow--dark">Your results</span>
          <h2 class="cc-h2">Your estimated carbon footprint</h2>
        </div>
        <button class="cc-btn cc-btn--cta" data-action="card">Create my carbon footprint card</button>
      </div>
      ${'' && incomplete ? `<div class="cc-alert cc-alert--warn" role="status"><strong>This total is incomplete.</strong> ${r.completeness.missing.length ? `No data for: ${r.completeness.missing.map((k) => escapeHtml(r.categories.find((c) => c.key === k).label)).join(', ')}. ` : ''}${r.completeness.excluded.length ? `Excluded: ${r.completeness.excluded.map((k) => escapeHtml(r.categories.find((c) => c.key === k).label)).join(', ')}. ` : ''}The actual footprint is higher than shown.</div>` : ''}
      ${!r.valid ? '<div class="cc-alert" role="status">Some entered values were invalid and were ignored. Use Edit answers to correct them.</div>' : ''}
      <div class="cc-tiles">${tiles.join('')}</div>

      <div class="cc-grid-2">
        <div class="cc-panel"><h3>Share by category</h3>${ranked.length ? donutChart(ranked.map((c) => ({ label: c.label, kg: c.kg })), { centerValue: formatKg(r.totalKg).value, centerLabel: formatKg(r.totalKg).unit }) : '<p class="cc-muted">No emissions calculated.</p>'}</div>
        <div class="cc-panel"><h3>Largest emission sources</h3>${lines.length ? barChart(lines.map((l) => ({ label: l.label, kg: l.kg, color: catColors[l.category] }))) : '<p class="cc-muted">No emissions calculated.</p>'}</div>
      </div>

      <div class="cc-panel">
        <h3>Category status</h3>
        <div class="cc-table-wrap"><table class="cc-table"><thead><tr><th scope="col">Category</th><th scope="col">Emissions</th><th scope="col">Share</th><th scope="col">Data</th></tr></thead><tbody>${statusRows}</tbody></table></div>
        ${r.unquantified.length ? `<h4>Recorded but not included in the total</h4><ul class="cc-list">${r.unquantified.map((u) => `<li><strong>${escapeHtml(u.label)}:</strong> ${escapeHtml(u.value)}. <span class="cc-muted">${escapeHtml(u.reason)}</span></li>`).join('')}</ul>` : ''}
      </div>

      ${recs.length ? `<div class="cc-panel"><h3>Reduction opportunities</h3><p class="cc-intro">Ordered by the share of your estimated emissions each relates to.</p>
        <ol class="cc-recs">${recs.map((x) => `<li><h4>${escapeHtml(x.title)}${x.share ? ` <span class="cc-share">${formatPercent(x.share)} of total</span>` : ''}</h4><p>${escapeHtml(x.text)}</p></li>`).join('')}</ol></div>` : ''}

      ${scen.length ? `<div class="cc-panel" id="cc-scenario"><h3>Try a scenario</h3><p class="cc-intro">Change an assumption to see the recalculated estimate. Your saved answers are not changed.</p>
        <div class="cc-scen-controls">${scen.map((o) => `<div class="cc-field"><label for="sc-${o.id}">${escapeHtml(o.label)} <output id="sc-${o.id}-out">${scenarioValues[o.id] || 0}%</output></label>
          <input type="range" id="sc-${o.id}" min="0" max="100" step="5" value="${scenarioValues[o.id] || 0}" data-scenario="${o.id}"></div>`).join('')}</div>
        <div id="cc-scen-out">${scenarioOut(r)}</div></div>` : ''}

      <div class="cc-panel">
        <h3>Download and share</h3>
        <div class="cc-actions">
          <button class="cc-btn cc-btn--primary" data-action="pdf">Download PDF report</button>
          <button class="cc-btn cc-btn--ghost" data-action="print">Print report</button>
          <button class="cc-btn cc-btn--ghost" data-action="csv">Download CSV</button>
          <button class="cc-btn cc-btn--ghost" data-action="card">Create share card</button>
          <button class="cc-btn cc-btn--ghost" data-action="edit" data-step="0">Edit answers</button>
          <button class="cc-btn cc-btn--ghost" data-action="new">Start new assessment</button>
        </div>
        <p class="cc-status-msg" role="status" aria-live="polite" id="cc-export-status"></p>
      </div>

      <details class="cc-panel cc-method" ${''}>
        <summary><h3>Methodology, emission factors and limitations</h3></summary>
        ${METHODOLOGY.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
        <div class="cc-table-wrap"><table class="cc-table cc-table--small"><thead><tr><th scope="col">Factor</th><th scope="col">Value</th><th scope="col">Geography</th><th scope="col">Source</th><th scope="col">Limitations</th></tr></thead><tbody>
        ${r.factorsUsed.map((f) => `<tr><th scope="row">${escapeHtml(f.subcategory)}</th><td>${f.value} ${escapeHtml(f.output.replace('CO2', 'CO₂'))}/${escapeHtml(f.unit)}</td><td>${escapeHtml(f.geography)}</td><td><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener">${escapeHtml(f.source)}</a>, ${escapeHtml(f.year)}. Verified ${escapeHtml(f.verified)}.</td><td>${escapeHtml(f.limitations)}</td></tr>`).join('')}
        </tbody></table></div>
      </details>
    </div>
  </section>
  ${printReport(r)}`;
}

function scenarioOut(base) {
  const any = Object.values(scenarioValues).some((v) => Number(v) > 0);
  if (!any) return '<p class="cc-muted">Move a slider to compare.</p>';
  const sc = runScenario(toEngineState(state()), scenarioValues);
  const diff = base.totalKg - sc.totalKg;
  return `${comparisonChart(base.totalKg, sc.totalKg)}
    <p class="cc-scen-sum" aria-live="polite">Estimated change: <strong>${diff >= 0 ? '−' : '+'}${formatKg(Math.abs(diff)).text}</strong> (${formatPercent(base.totalKg ? Math.abs(diff) / base.totalKg : 0)}). Scenario uses the same emission factors; it is illustrative, not a forecast.</p>`;
}

function printReport(r) {
  return `<div class="cc-print" aria-hidden="true">
    <div class="cc-print-head"><img src="${BASE}opif_colored_logo.png" alt=""><img src="${BASE}csrbox_colored_logo.png" alt=""></div>
    <h1>${escapeHtml(reportTitle(r))}</h1><p>Generated ${new Date().toLocaleDateString('en-IN')} · Estimate only — not a verified carbon audit</p>
    <table>${summaryRows(r).map(([a, b]) => `<tr><th>${escapeHtml(a)}</th><td>${escapeHtml(b)}</td></tr>`).join('')}</table>
    <h2>Activity inputs</h2><table><tr><th>Item</th><th>Quantity</th><th>Factor</th><th>Emissions</th><th>Data</th></tr>
    ${r.lines.map((l) => { const f = r.factorsUsed.find((x) => x.id === l.factorId); return `<tr><td>${escapeHtml(l.label)}</td><td>${formatNumber(l.quantity, l.quantity < 10 ? 2 : 0)} ${escapeHtml(l.unit)}</td><td>${f.value} ${escapeHtml(f.output)}/${escapeHtml(f.unit)}</td><td>${formatKg(l.kg).text}</td><td>${l.quality}</td></tr>`; }).join('')}</table>
    ${r.unquantified.length ? `<h2>Not quantified</h2>${r.unquantified.map((u) => `<p><strong>${escapeHtml(u.label)}:</strong> ${escapeHtml(u.value)}. ${escapeHtml(u.reason)}</p>`).join('')}` : ''}
    <h2>Reduction opportunities</h2>${recommendations(r).map((x) => `<p><strong>${escapeHtml(x.title)}.</strong> ${escapeHtml(x.text)}</p>`).join('')}
    <h2>Emission factors</h2><table><tr><th>Factor</th><th>Value</th><th>Source</th></tr>${r.factorsUsed.map((f) => `<tr><td>${escapeHtml(f.subcategory)}</td><td>${f.value} ${escapeHtml(f.output)}/${escapeHtml(f.unit)}</td><td>${escapeHtml(f.source)}, ${escapeHtml(f.year)} — ${escapeHtml(f.url)}</td></tr>`).join('')}</table>
    <h2>Methodology and limitations</h2>${METHODOLOGY.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
    <p class="cc-print-foot">One Purpos India Forum | CSRBOX · csrbox.org/opif</p>
  </div>`;
}

function cardView() {
  const r = calc();
  if (card.caption === null || card.captionKind !== r.kind) { card.caption = buildCaption(); card.captionKind = r.kind; }
  return `
  <section class="cc-section cc-section--grey cc-flow">
    <div class="cc-wrap">
      <p class="cc-crumb"><button class="cc-link" data-action="home">Carbon Footprint Calculator</button> / <button class="cc-link" data-action="results">Results</button> / Share card</p>
      <h2 class="cc-h2">Create your carbon footprint card</h2>
      <p class="cc-intro">The card uses your calculated result. Nothing is posted automatically — download it or open a share option yourself.</p>
      <div class="cc-card-layout">
        <div class="cc-panel cc-card-controls">
          <fieldset class="cc-field cc-seg cc-seg--stack"><legend>Design</legend><div class="cc-seg-opts">
            ${Object.entries(TEMPLATES).map(([k, l]) => `<label class="cc-seg-opt"><input type="radio" name="tpl" value="${k}" data-card="template" ${card.template === k ? 'checked' : ''}><span>${escapeHtml(l)}</span></label>`).join('')}
          </div></fieldset>
          <div class="cc-field"><label for="cc-format">Format</label>
            <select id="cc-format" data-card="format">${Object.entries(FORMATS).map(([k, f]) => `<option value="${k}" ${card.format === k ? 'selected' : ''}>${escapeHtml(f.label)} — ${f.w} × ${f.h} px</option>`).join('')}</select></div>
          <div class="cc-actions cc-actions--stack">
            <button class="cc-btn cc-btn--primary" data-action="png">Download image (PNG)</button>
            <button class="cc-btn cc-btn--ghost" data-action="native-share" id="cc-native">Share…</button>
            <a class="cc-btn cc-btn--ghost" id="cc-wa" href="${whatsappUrl(card.caption)}" target="_blank" rel="noopener">Share on WhatsApp</a>
          </div>
          <p class="cc-hint">WhatsApp opens with your caption but cannot attach the image automatically: download the image first and attach it in WhatsApp. For LinkedIn or Instagram, download the image and post it with the copied caption.</p>
          <p class="cc-status-msg" role="status" aria-live="polite" id="cc-share-status"></p>
          <div class="cc-field"><label for="cc-caption">Caption</label>
            <textarea id="cc-caption" rows="9" data-card="caption">${escapeHtml(card.caption)}</textarea>
            <div class="cc-actions"><button class="cc-btn cc-btn--ghost" data-action="copy-caption">Copy caption</button><button class="cc-btn cc-btn--link" data-action="reset-caption">Reset caption</button></div>
          </div>
          <button class="cc-btn cc-btn--ghost" data-action="results">Back to results</button>
        </div>
        <div class="cc-card-preview">
          <canvas id="cc-canvas" role="img" aria-label="Preview of your carbon footprint card"></canvas>
          <p class="cc-muted" id="cc-canvas-meta"></p>
        </div>
      </div>
    </div>
  </section>`;
}

async function drawCard() {
  const canvas = document.getElementById('cc-canvas');
  if (!canvas) return;
  const r = calc();
  const data = buildCardData(r);
  assetsPromise = assetsPromise || loadAssets(BASE);
  const assets = await assetsPromise;
  renderCard(canvas, data, { template: card.template, format: card.format, assets });
  const f = FORMATS[card.format];
  canvas.setAttribute('aria-label', `${TEMPLATES[card.template]} card, ${f.w} by ${f.h} pixels: ${data.eyebrow}, ${data.valueText} ${data.unit}. ${data.subtitle}. ${data.insight}`);
  canvas.style.aspectRatio = `${f.w} / ${f.h}`;
  document.getElementById('cc-canvas-meta').textContent = `${TEMPLATES[card.template]} · ${f.label} · ${f.w} × ${f.h} px${!assets.opif ? ' · Logo could not be loaded' : ''}`;
  const btn = document.getElementById('cc-native');
  if (btn && nativeShareSupport() === 'none') { btn.disabled = true; btn.textContent = 'Share… (not supported in this browser)'; }
}

/* ------------------------------ events ------------------------------- */

function status(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }

root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.path && t.type !== 'radio' && t.type !== 'checkbox') {
    setPath(state(), t.dataset.path, t.value);
    save();
  } else if (t.dataset.scenario) {
    scenarioValues[t.dataset.scenario] = Number(t.value);
    document.getElementById(`sc-${t.dataset.scenario}-out`).textContent = `${t.value}%`;
    document.getElementById('cc-scen-out').innerHTML = scenarioOut(calc());
  } else if (t.dataset.card === 'caption') {
    card.caption = t.value;
    const wa = document.getElementById('cc-wa'); if (wa) wa.href = whatsappUrl(card.caption);
  }
});

root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.path && (t.type === 'radio' || t.type === 'checkbox' || t.tagName === 'SELECT')) {
    setPath(state(), t.dataset.path, t.type === 'checkbox' ? t.checked : t.value);
    save();
    if (t.type === 'radio' || t.tagName === 'SELECT') rerenderKeepFocus(t);
  } else if (t.dataset.exclude) {
    const s = state(); s.excluded = s.excluded || {}; s.excluded[t.dataset.exclude] = t.checked; save(); rerenderKeepFocus(t);
  } else if (t.dataset.card === 'template' || t.dataset.card === 'format') {
    card[t.dataset.card] = t.value; drawCard();
  }
});

function rerenderKeepFocus(t) {
  const sel = t.id ? `#${CSS.escape(t.id)}` : `[data-path="${t.dataset.path}"][value="${CSS.escape(t.value)}"], [data-exclude="${t.dataset.exclude}"]`;
  render();
  const el = root.querySelector(sel); if (el) el.focus();
}

root.addEventListener('submit', (e) => {
  e.preventDefault();
  const steps = visibleSteps();
  const step = steps[app.step];
  if (stepErrors(step).length) {
    app.showErrors = true; render();
    const bad = root.querySelector('[aria-invalid="true"]'); if (bad) bad.focus();
    return;
  }
  app.showErrors = false;
  if (app.step >= steps.length - 1) go('review'); else go('step', { step: app.step + 1 });
});

root.addEventListener('click', async (e) => {
  if (e.target.closest('#cc-wa')) track('share_whatsapp');
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  const r = calc();
  switch (a) {
    case 'home': go('landing'); break;
    case 'start':
      track('start');
      applyDefaults(STEPS, state());
      go('step', { step: 0, showErrors: false });
      break;
    case 'reset':
      if (!confirm('Clear your answers and start again?')) return;
      app.states.personal = {}; applyDefaults(STEPS, state()); scenarioValues = {}; card.caption = null;
      go('step', { step: 0, showErrors: false });
      break;
    case 'new': go('landing'); break;
    case 'prev':
      if (app.view === 'review') go('step', { step: visibleSteps().length - 1 });
      else go('step', { step: Math.max(0, app.step - 1), showErrors: false });
      break;
    case 'edit': go('step', { step: Number(b.dataset.step), showErrors: true }); break;
    case 'calculate': track('calculate'); scenarioValues = {}; go('results'); break;
    case 'results': go('results'); break;
    case 'card': track('card_open'); go('card'); break;
    case 'csv':
      downloadBlob(new Blob([toCsv(r)], { type: 'text/csv;charset=utf-8' }), `${fileStem(r)}.csv`);
      status('cc-export-status', 'CSV file downloaded.'); track('download_csv');
      break;
    case 'pdf':
      b.disabled = true; status('cc-export-status', 'Preparing PDF…');
      try {
        downloadBlob(await toPdf(r, { base: BASE, methodology: METHODOLOGY }), `${fileStem(r)}.pdf`);
        status('cc-export-status', 'PDF report downloaded.'); track('download_pdf');
      } catch (err) {
        status('cc-export-status', `PDF could not be created (${err.message}). Use Print report and choose “Save as PDF” instead.`);
      } finally { b.disabled = false; }
      break;
    case 'print': track('print'); window.print(); break;
    case 'png': {
      const canvas = document.getElementById('cc-canvas');
      try {
        downloadBlob(await canvasToBlob(canvas), `${fileStem(r)}-${card.template}-${card.format}.png`);
        status('cc-share-status', 'Image downloaded.'); track('download_png', `${card.template}/${card.format}`);
      } catch { status('cc-share-status', 'The image could not be created in this browser.'); }
      break;
    }
    case 'native-share': {
      const canvas = document.getElementById('cc-canvas');
      try {
        const blob = await canvasToBlob(canvas);
        const file = new File([blob], `${fileStem(r)}.png`, { type: 'image/png' });
        const res = await nativeShare({ file, text: card.caption, title: 'My Carbon Footprint — OPIF' });
        if (res === 'shared') track('share_native');
        status('cc-share-status', res === 'shared' ? 'Shared.' : res === 'cancelled' ? 'Sharing cancelled.'
          : 'Sharing is not supported in this browser. Download the image and copy the caption instead.');
        if (res === 'shared' && nativeShareSupport(file) !== 'files') status('cc-share-status', 'Caption shared. This browser cannot share image files — download the image to attach it.');
      } catch (err) { status('cc-share-status', `Sharing failed: ${err.message}. Download the image and copy the caption instead.`); }
      break;
    }
    case 'copy-caption':
      try { await copyText(card.caption); track('copy_caption'); status('cc-share-status', 'Caption copied to clipboard.'); } catch { status('cc-share-status', 'Copy failed. Select the caption text and copy it manually.'); }
      break;
    case 'reset-caption':
      card.caption = buildCaption();
      document.getElementById('cc-caption').value = card.caption;
      document.getElementById('cc-wa').href = whatsappUrl(card.caption);
      break;
    default: break;
  }
});

applyDefaults(STEPS, state());
render();
track('page_view');
