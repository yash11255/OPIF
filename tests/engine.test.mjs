import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORS, getFactor } from '../assets/carbon/js/factors.js';
import { calculatePersonal, readNumber, rankCategories } from '../assets/carbon/js/engine.js';
import { recommendations, runScenario, scenarioOptions } from '../assets/carbon/js/recommendations.js';
import { formatKg, formatNumber } from '../assets/carbon/js/format.js';
import { toEngineState } from '../assets/carbon/js/forms.js';
import { buildCaption } from '../assets/carbon/js/share.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('registry entries are complete and traceable', () => {
  const required = ['id', 'category', 'subcategory', 'value', 'unit', 'output', 'geography', 'source', 'url', 'year', 'verified', 'assumptions', 'limitations'];
  for (const f of Object.values(FACTORS)) {
    for (const k of required) assert.ok(f[k] !== undefined && f[k] !== '', `${f.id} missing ${k}`);
    assert.ok(f.value > 0 && Number.isFinite(f.value), `${f.id} value`);
    assert.match(f.url, /^https:\/\/(www\.gov\.uk|cea\.nic\.in)\//);
  }
  assert.throws(() => getFactor('made_up'));
  assert.equal(getFactor('grid_india').output, 'kg CO2');
});

test('readNumber validates input', () => {
  const e = [];
  assert.equal(readNumber(e, 'a', ''), null);
  assert.equal(readNumber(e, 'a', '1,250.5'), 1250.5);
  assert.equal(readNumber(e, 'b', '-3'), null);
  assert.equal(readNumber(e, 'c', 'abc'), null);
  assert.equal(readNumber(e, 'd', '2.5', { integer: true }), null);
  assert.deepEqual(e.map((x) => x.path), ['b', 'c', 'd']);
});

test('empty personal assessment yields no data and zero, not a fake total', () => {
  const r = calculatePersonal({});
  assert.equal(r.valid, true);
  assert.equal(r.hasData, false);
  assert.equal(r.totalKg, 0);
  assert.equal(r.measuredShare, 0);
  assert.equal(r.completeness.provided, 0);
});

test('electricity uses CEA grid factor', () => {
  const r = calculatePersonal({ basics: { period: 'month', scope: 'household', householdSize: 1 }, energy: { electricityKwh: 250 } });
  close(r.totalKg, 250 * 0.710);
  assert.equal(r.includesCo2Only, true);
});

test('individual mode allocates household energy by household size', () => {
  const r = calculatePersonal({ basics: { scope: 'individual', householdSize: 4 }, energy: { electricityKwh: 400 } });
  close(r.totalKg, 100 * 0.710);
  close(r.perPersonKg, r.totalKg);
});

test('household mode divides total by household size for per-person', () => {
  const r = calculatePersonal({ basics: { scope: 'household', householdSize: 4 }, energy: { electricityKwh: 400 } });
  close(r.totalKg, 400 * 0.710);
  close(r.perPersonKg, 100 * 0.710);
});

test('car: fuel method ignores distance (no double counting)', () => {
  const r = calculatePersonal({ transport: { petrolCar: { method: 'fuel', km: 1000, litres: 50 } } });
  assert.equal(r.lines.length, 1);
  close(r.totalKg, 50 * 2.33984);
  const d = calculatePersonal({ transport: { petrolCar: { method: 'distance', km: 1000, litres: 50 } } });
  close(d.totalKg, 1000 * 0.16272);
});

test('car occupancy shares emissions', () => {
  const r = calculatePersonal({ transport: { dieselCar: { km: 300, occupants: 3 } } });
  close(r.totalKg, 100 * 0.17304);
});

test('round-trip flights double one-way distance', () => {
  const one = calculatePersonal({ transport: { flightDom: { trips: 2, km: 1150, roundTrip: false } } });
  const rt = calculatePersonal({ transport: { flightDom: { trips: 2, km: 1150, roundTrip: true } } });
  close(one.totalKg, 2 * 1150 * 0.12786);
  close(rt.totalKg, 2 * one.totalKg);
});

test('LPG cylinders convert using cylinder weight', () => {
  const r = calculatePersonal({ basics: { scope: 'household' }, energy: { lpgCylinders: 1, lpgCylinderType: 'domestic' } });
  close(r.totalKg, 14.2 * 2.93936095);
  const kg = calculatePersonal({ basics: { scope: 'household' }, energy: { lpgMethod: 'kg', lpgKg: 14.2, lpgCylinders: 99 } });
  close(kg.totalKg, r.totalKg);
});

test('annualisation by period', () => {
  const r = calculatePersonal({ basics: { period: 'week', scope: 'household' }, transport: { bus: { km: 100 } } });
  close(r.annualisedKg, r.totalKg * 52);
});

test('negative and invalid inputs are rejected and excluded', () => {
  const r = calculatePersonal({ transport: { bus: { km: -5 }, train: { km: 'ten' } }, energy: { electricityKwh: 10 } });
  assert.equal(r.valid, false);
  assert.equal(r.errors.length, 2);
  assert.equal(r.lines.length, 1);
});

test('diet is reported as unquantified, not added to total', () => {
  const r = calculatePersonal({ lifestyle: { diet: 'vegetarian' } });
  assert.equal(r.totalKg, 0);
  assert.equal(r.unquantified[0].label, 'Diet');
});

test('totals use unrounded values', () => {
  const r = calculatePersonal({ transport: { metro: { km: 1 }, train: { km: 1 }, bus: { km: 1 } } });
  close(r.totalKg, 0.0286 + 0.03546 + 0.10385);
});

test('short form maps onto engine state', () => {
  const r = calculatePersonal(toEngineState({
    home: { people: 4, electricity: 400, lpg: 1 },
    travel: { carKm: 500, carFuel: 'diesel', flights: 6, flightKm: 1150, flightType: 'domestic' },
  }));
  const expected = (400 * 0.710 + 14.2 * 2.93936095) / 4 + 500 * 0.17304 + (6 / 12) * 1150 * 2 * 0.12786;
  close(r.totalKg, expected, 1e-9);
  close(r.annualisedKg, expected * 12, 1e-9);
});

test('ranking orders categories by emissions', () => {
  const ranked = rankCategories(calculatePersonal({ energy: { electricityKwh: 10 }, transport: { bus: { km: 1000 } } }));
  assert.equal(ranked[0].key, 'transport');
});

test('recommendations derive from actual lines', () => {
  const recs = recommendations(calculatePersonal({ transport: { petrolCar: { km: 1000 } }, energy: { electricityKwh: 10 } }));
  assert.equal(recs[0].id, 'car');
  assert.deepEqual(recommendations(calculatePersonal({})), []);
});

test('scenario: flight to rail reduces total deterministically', () => {
  const s = { transport: { flightDom: { trips: 1, km: 1000, roundTrip: true } } };
  const base = calculatePersonal(s);
  const sc = runScenario(s, { flightToRail: 50 });
  close(base.totalKg - sc.totalKg, 1000 * (0.12786 - 0.03546), 1e-9);
  assert.ok(scenarioOptions(base).some((o) => o.id === 'flightToRail'));
});

test('caption contains no links', () => {
  assert.doesNotMatch(buildCaption(), /https?:|www\.|vercel/i);
});

test('formatting rounds only for display', () => {
  assert.equal(formatNumber(1234567.891, 0), '12,34,568');
  assert.equal(formatKg(1534.2).value, '1.53');
  assert.equal(formatKg(1534.2).unit, 't CO₂e');
  assert.equal(formatKg(245.4).unit, 'kg CO₂e');
});
