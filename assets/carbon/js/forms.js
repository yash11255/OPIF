/**
 * Short personal questionnaire (two steps, all monthly) and its mapping onto
 * the engine's state shape. Every field is optional.
 */
const get = (s, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), s);
const num = (path, label, unit, extra = {}) => ({ type: 'number', path, label, unit, ...extra });

export const STEPS = [
  {
    id: 'home', title: 'Your home',
    intro: 'Use your monthly bills. Leave anything you don’t know blank.',
    groups: [{
      fields: [
        num('home.people', 'People living in your home', 'people', { integer: true, placeholder: '1', hint: 'Home energy is shared equally to give your part.' }),
        num('home.electricity', 'Electricity used per month', 'units', { hint: 'Shown as “units” (kWh) on your bill.' }),
        num('home.lpg', 'LPG cylinders per month', 'cylinders', { hint: '14.2 kg domestic cylinder. Use 0.5 for one cylinder every two months.' }),
      ],
    }],
  },
  {
    id: 'travel', title: 'Your travel',
    intro: 'Rough monthly distances are fine.',
    groups: [
      {
        fields: [
          num('travel.carKm', 'Car per month', 'km'),
          { type: 'segmented', path: 'travel.carFuel', label: 'Car fuel', default: 'petrol', options: [['petrol', 'Petrol'], ['diesel', 'Diesel'], ['cng', 'CNG']] },
          num('travel.bikeKm', 'Motorcycle or scooter per month', 'km'),
          num('travel.busKm', 'Bus or metro per month', 'km'),
          num('travel.trainKm', 'Train per month', 'km'),
        ],
      },
      {
        title: 'Flights',
        fields: [
          num('travel.flights', 'Return flights per year', 'flights', { hint: 'Spread evenly across 12 months.' }),
          num('travel.flightKm', 'Typical one-way distance', 'km', { hint: 'e.g. Delhi–Mumbai ≈ 1,150 km' }),
          { type: 'segmented', path: 'travel.flightType', label: 'Mostly', default: 'domestic', options: [['domestic', 'Domestic'], ['international', 'International']] },
        ],
      },
    ],
  },
];

/** Converts the short form into the engine's personal state (monthly, individual share). */
export function toEngineState(s = {}) {
  const h = s.home || {};
  const t = s.travel || {};
  const fuelKey = { petrol: 'petrolCar', diesel: 'dieselCar', cng: 'cngCar' }[t.carFuel] || 'petrolCar';
  const flightKey = t.flightType === 'international' ? 'flightIntl' : 'flightDom';
  const flights = t.flights === undefined || t.flights === '' ? '' : Number(t.flights) / 12;
  return {
    basics: { period: 'month', scope: 'individual', householdSize: h.people },
    transport: {
      [fuelKey]: { method: 'distance', km: t.carKm },
      twoWheeler: { method: 'distance', km: t.bikeKm },
      bus: { km: t.busKm },
      train: { km: t.trainKm },
      [flightKey]: { trips: Number.isFinite(flights) ? flights : t.flights, km: t.flightKm, roundTrip: true },
    },
    energy: { electricityKwh: h.electricity, lpgMethod: 'cylinders', lpgCylinders: h.lpg, lpgCylinderType: 'domestic' },
  };
}

export { get as getPath };

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ?? (o[k] = {});
  o[keys.at(-1)] = value;
}

export function applyDefaults(steps, state) {
  for (const step of steps) for (const g of step.groups) for (const f of g.fields) {
    if (f.default !== undefined && get(state, f.path) === undefined) setPath(state, f.path, f.default);
  }
  return state;
}
