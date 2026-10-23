/**
 * Deterministic calculation engine. Emissions = activity data × emission factor.
 * Pure functions only: no DOM, no network, no randomness. All arithmetic is
 * unrounded; rounding happens in the presentation layer.
 */
import { getFactor, LPG_CYLINDERS } from './factors.js';

export const PERIOD_PER_YEAR = Object.freeze({ week: 52, month: 12, year: 1 });

export const PERSONAL_CATEGORIES = Object.freeze({
  transport: 'Transport',
  energy: 'Household energy',
  waste: 'Waste',
});

/**
 * Parse an optional non-negative number. Empty → null (not provided).
 * Invalid or negative values are recorded in `errors` and return null.
 */
export function readNumber(errors, path, value, { integer = false, min = 0, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(/,/g, ''));
  if (!Number.isFinite(n)) { errors.push({ path, message: 'Enter a number.' }); return null; }
  if (n < min) {
    errors.push({ path, message: min === 0 ? 'Value cannot be negative.' : `Value must be at least ${min}.` });
    return null;
  }
  if (n > max) { errors.push({ path, message: `Value must be at most ${max}.` }); return null; }
  if (integer && !Number.isInteger(n)) { errors.push({ path, message: 'Enter a whole number.' }); return null; }
  return n;
}

class LineBuilder {
  constructor() { this.lines = []; this.errors = []; }
  num(path, value, opts) { return readNumber(this.errors, path, value, opts); }
  add({ key, category, label, factorId, quantity, quality = 'measured', note = '' }) {
    if (quantity === null || quantity === 0) return;
    const factor = getFactor(factorId);
    this.lines.push({ key, category, label, factorId, quantity, unit: factor.unit, quality, note, kg: quantity * factor.value });
  }
}

/** Divide by an occupant count, defaulting to 1 and rejecting values below 1. */
function occupants(b, path, value) {
  const n = b.num(path, value, { min: 1 });
  return n === null ? 1 : n;
}

/** trips × one-way distance × (2 if return) */
function tripDistance(b, path, t = {}) {
  const trips = b.num(`${path}.trips`, t.trips);
  const km = b.num(`${path}.km`, t.km);
  if (trips === null || km === null) return null;
  return trips * km * (t.roundTrip ? 2 : 1);
}

function finalise(b, categories, opts, context) {
  let lines = b.lines;
  const adjust = opts.adjust || {};
  if (Object.keys(adjust).length || opts.shift) {
    lines = lines.map((l) => {
      const m = adjust[l.key] ?? adjust[l.category];
      return m === undefined ? l : { ...l, quantity: l.quantity * m, kg: l.kg * m, scenario: true };
    });
    for (const s of [].concat(opts.shift || [])) {
      const src = lines.find((l) => l.key === s.from);
      if (!src || !(s.share > 0)) continue;
      const moved = src.quantity * s.share;
      const to = getFactor(s.toFactor);
      lines = lines.map((l) => (l === src ? { ...l, quantity: l.quantity - moved, kg: (l.quantity - moved) * getFactor(l.factorId).value, scenario: true } : l));
      lines.push({ key: `${s.from}_shifted`, category: src.category, label: s.label, factorId: s.toFactor, quantity: moved, unit: to.unit, quality: 'estimated', kg: moved * to.value, scenario: true });
    }
  }

  const excluded = context.excluded || {};
  const byCategory = {};
  for (const [key, label] of Object.entries(categories)) {
    byCategory[key] = { key, label, kg: 0, lines: 0, status: excluded[key] ? 'excluded' : 'not_provided', measured: 0, estimated: 0 };
  }
  const included = lines.filter((l) => !excluded[l.category]);
  for (const l of included) {
    const c = byCategory[l.category];
    c.kg += l.kg; c.lines += 1; c.status = 'included';
    c[l.quality] += l.kg;
  }
  const totalKg = included.reduce((s, l) => s + l.kg, 0);
  const factorsUsed = [...new Set(included.map((l) => l.factorId))].map(getFactor);
  const applicable = Object.keys(categories).filter((k) => !(context.notApplicable || []).includes(k));
  const provided = applicable.filter((k) => byCategory[k].status === 'included').length;
  const measuredKg = included.filter((l) => l.quality === 'measured').reduce((s, l) => s + l.kg, 0);

  return {
    valid: b.errors.length === 0,
    errors: b.errors,
    lines: included,
    excludedLines: lines.filter((l) => excluded[l.category]),
    categories: Object.values(byCategory),
    totalKg,
    totalTonnes: totalKg / 1000,
    factorsUsed,
    hasData: included.length > 0,
    completeness: {
      provided, applicable: applicable.length,
      ratio: applicable.length ? provided / applicable.length : 0,
      excluded: Object.keys(excluded).filter((k) => excluded[k] && categories[k]),
      missing: applicable.filter((k) => byCategory[k].status === 'not_provided'),
    },
    measuredShare: totalKg > 0 ? measuredKg / totalKg : 0,
    includesCo2Only: factorsUsed.some((x) => x.output === 'kg CO2'),
  };
}

/* ------------------------------------------------------------------ */
/* Personal footprint                                                  */
/* ------------------------------------------------------------------ */

export function calculatePersonal(state = {}, opts = {}) {
  const b = new LineBuilder();
  const basics = state.basics || {};
  const t = state.transport || {};
  const e = state.energy || {};
  const w = state.lifestyle || {};

  const period = PERIOD_PER_YEAR[basics.period] ? basics.period : 'month';
  const scope = basics.scope === 'household' ? 'household' : 'individual';
  const size = b.num('basics.householdSize', basics.householdSize, { integer: true, min: 1, max: 50 }) ?? 1;

  // Cars: distance OR fuel — never both (prevents double counting).
  const cars = [
    ['petrolCar', 'Petrol car', 'car_petrol_km', 'petrol_l', 'litres'],
    ['dieselCar', 'Diesel car', 'car_diesel_km', 'diesel_l', 'litres'],
    ['cngCar', 'CNG car', 'car_cng_km', 'cng_kg', 'kg'],
  ];
  for (const [k, label, kmFactor, fuelFactor, fuelField] of cars) {
    const c = t[k] || {};
    const share = 1 / occupants(b, `transport.${k}.occupants`, c.occupants);
    if (c.method === 'fuel') {
      const q = b.num(`transport.${k}.${fuelField}`, c[fuelField]);
      b.add({ key: k, category: 'transport', label: `${label} (fuel)`, factorId: fuelFactor, quantity: q === null ? null : q * share });
    } else {
      const q = b.num(`transport.${k}.km`, c.km);
      b.add({ key: k, category: 'transport', label, factorId: kmFactor, quantity: q === null ? null : q * share });
    }
  }
  const ev = t.ev || {};
  b.add({ key: 'ev', category: 'transport', label: 'Electric vehicle charging', factorId: 'grid_india', quantity: b.num('transport.ev.kwh', ev.kwh) });

  const tw = t.twoWheeler || {};
  if (tw.method === 'fuel') {
    b.add({ key: 'twoWheeler', category: 'transport', label: 'Two-wheeler (fuel)', factorId: 'petrol_l', quantity: b.num('transport.twoWheeler.litres', tw.litres) });
  } else {
    b.add({ key: 'twoWheeler', category: 'transport', label: 'Two-wheeler', factorId: 'motorbike_km', quantity: b.num('transport.twoWheeler.km', tw.km) });
  }
  b.add({ key: 'bus', category: 'transport', label: 'Bus', factorId: 'bus_km', quantity: b.num('transport.bus.km', (t.bus || {}).km) });
  b.add({ key: 'train', category: 'transport', label: 'Train', factorId: 'rail_km', quantity: b.num('transport.train.km', (t.train || {}).km) });
  b.add({ key: 'metro', category: 'transport', label: 'Metro', factorId: 'metro_km', quantity: b.num('transport.metro.km', (t.metro || {}).km) });
  b.add({ key: 'flightDom', category: 'transport', label: 'Domestic flights', factorId: 'flight_dom_km', quantity: tripDistance(b, 'transport.flightDom', t.flightDom) });
  b.add({ key: 'flightIntl', category: 'transport', label: 'International flights', factorId: 'flight_intl_km', quantity: tripDistance(b, 'transport.flightIntl', t.flightIntl) });

  // Household energy. In individual mode the whole-home bill is allocated equally.
  const alloc = scope === 'individual' ? 1 / size : 1;
  const scaled = (q) => (q === null ? null : q * alloc);
  const allocNote = scope === 'individual' && size > 1 ? `Household total ÷ ${size} people` : '';
  b.add({ key: 'electricity', category: 'energy', label: 'Electricity', factorId: 'grid_india', quantity: scaled(b.num('energy.electricityKwh', e.electricityKwh)), note: allocNote });
  let lpgKg;
  if (e.lpgMethod === 'kg') {
    lpgKg = b.num('energy.lpgKg', e.lpgKg);
  } else {
    const n = b.num('energy.lpgCylinders', e.lpgCylinders);
    const cylinderKg = LPG_CYLINDERS[e.lpgCylinderType] ?? LPG_CYLINDERS.domestic;
    lpgKg = n === null ? null : n * cylinderKg;
  }
  b.add({ key: 'lpg', category: 'energy', label: 'LPG', factorId: 'lpg_kg', quantity: scaled(lpgKg), note: allocNote });
  b.add({ key: 'png', category: 'energy', label: 'Piped natural gas', factorId: 'natgas_m3', quantity: scaled(b.num('energy.pngScm', e.pngScm)), note: allocNote });

  b.add({ key: 'wasteResidual', category: 'waste', label: 'General waste to landfill', factorId: 'waste_residual_landfill_kg', quantity: b.num('lifestyle.wasteKg', w.wasteKg), quality: 'estimated' });
  b.add({
    key: 'foodWaste', category: 'waste', label: w.foodWasteDisposal === 'compost' ? 'Food waste composted' : 'Food waste to landfill',
    factorId: w.foodWasteDisposal === 'compost' ? 'waste_food_compost_kg' : 'waste_food_landfill_kg',
    quantity: b.num('lifestyle.foodWasteKg', w.foodWasteKg), quality: 'estimated',
  });
  b.add({ key: 'recycled', category: 'waste', label: 'Recycled materials', factorId: 'waste_recycled_kg', quantity: b.num('lifestyle.recycledKg', w.recycledKg), quality: 'estimated' });

  const result = finalise(b, PERSONAL_CATEGORIES, opts, {});
  const people = scope === 'household' ? size : 1;
  const unquantified = [];
  if (w.diet) unquantified.push({ label: 'Diet', value: DIET_LABELS[w.diet] || w.diet, reason: 'No diet-level emission factor for India has been verified for this tool, so diet is recorded but not added to the total.' });

  return {
    ...result,
    kind: 'personal',
    period, scope, householdSize: size,
    perPersonKg: result.totalKg / people,
    annualisedKg: result.totalKg * PERIOD_PER_YEAR[period],
    annualisedPerPersonKg: (result.totalKg / people) * PERIOD_PER_YEAR[period],
    unquantified,
  };
}

export const DIET_LABELS = Object.freeze({
  vegan: 'Vegan', vegetarian: 'Vegetarian', eggetarian: 'Vegetarian with eggs',
  mixed: 'Mixed, occasional meat or fish', meat: 'Meat or fish most days',
});

/** Category entries sorted by emissions, largest first, included only. */
export function rankCategories(result) {
  return result.categories.filter((c) => c.status === 'included' && c.kg > 0).sort((a, b) => b.kg - a.kg);
}

/** Line items sorted by emissions, largest first. */
export function rankLines(result) {
  return [...result.lines].sort((a, b) => b.kg - a.kg);
}
