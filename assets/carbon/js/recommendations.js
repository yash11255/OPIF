/**
 * Rule-based reduction suggestions and scenario definitions.
 * Rules read the actual result lines. No fixed savings percentages are claimed:
 * any quantified effect comes from re-running the engine with a user-chosen change.
 */
import { calculatePersonal } from './engine.js';

const share = (result, pred) => {
  if (!(result.totalKg > 0)) return 0;
  return result.lines.filter(pred).reduce((s, l) => s + l.kg, 0) / result.totalKg;
};
const keyIs = (...keys) => (l) => keys.includes(l.key);

const RULES = {
  personal: [
    { id: 'car', test: keyIs('petrolCar', 'dieselCar', 'cngCar'), title: 'Share or replace car journeys',
      text: 'Car travel is one of your larger sources. Car-pooling divides the same vehicle emissions between more people, and metro, bus or rail usually has a lower per-passenger factor for the same distance.' },
    { id: 'flights', test: keyIs('flightDom', 'flightIntl'), title: 'Review flights',
      text: 'Flights carry a high per-kilometre factor, including non-CO₂ effects. For routes under roughly 800 km, rail is often practical; for meetings, consider whether virtual attendance would work.' },
    { id: 'electricity', test: keyIs('electricity', 'ev'), title: 'Reduce electricity use',
      text: 'Electricity is a significant source because the Indian grid is still largely coal-based. Efficient (BEE 5-star) appliances, inverter ACs set at 24 °C or above, and LED lighting reduce consumption. Rooftop solar or a green tariff reduces the grid share.' },
    { id: 'cooking', test: keyIs('lpg', 'png'), title: 'Cook more efficiently',
      text: 'Pressure cookers, lids on pans and well-maintained burners reduce cooking fuel use.' },
    { id: 'twoWheeler', test: keyIs('twoWheeler'), title: 'Keep two-wheelers efficient',
      text: 'Regular servicing and correct tyre pressure reduce fuel consumption. For regular short trips, an electric two-wheeler or public transport may be an option.' },
    { id: 'waste', test: keyIs('wasteResidual', 'foodWaste'), title: 'Separate and compost waste',
      text: 'Wet waste sent to landfill produces methane. Segregating and composting it has a much lower disposal factor in this calculator.' },
  ],
};

/**
 * Returns suggestions ranked by the share of the total they relate to.
 * Rules with no matching emissions are omitted.
 */
export function recommendations(result) {
  const rules = RULES[result.kind] || [];
  const out = rules.map((r) => ({ id: r.id, title: r.title, text: r.text, share: share(result, r.test) }))
    .filter((r) => r.share > 0)
    .sort((a, b) => b.share - a.share);
  return out;
}

/** Scenario controls that apply to the current result. Each has a 0–100 slider. */
export function scenarioOptions(result) {
  const has = (...keys) => result.lines.some((l) => keys.includes(l.key));
  const opts = [];
  if (result.kind === 'personal') {
    if (has('petrolCar', 'dieselCar', 'cngCar')) opts.push({ id: 'carLess', label: 'Reduce car travel by', unit: '%' });
    if (has('flightDom')) opts.push({ id: 'flightToRail', label: 'Replace domestic flight distance with rail by', unit: '%' });
    if (has('electricity')) opts.push({ id: 'elecLess', label: 'Reduce electricity use by', unit: '%' });
  }
  return opts;
}

/** Re-runs the engine with the chosen scenario values (percentages 0–100). */
export function runScenario(state, values) {
  const p = (id) => Math.min(100, Math.max(0, Number(values[id]) || 0)) / 100;
  const adjust = {};
  const shift = [];
  for (const k of ['petrolCar', 'dieselCar', 'cngCar']) adjust[k] = 1 - p('carLess');
  adjust.electricity = 1 - p('elecLess');
  if (p('flightToRail')) shift.push({ from: 'flightDom', toFactor: 'rail_km', share: p('flightToRail'), label: 'Rail (instead of domestic flights)' });
  return calculatePersonal(state, { adjust, shift });
}
