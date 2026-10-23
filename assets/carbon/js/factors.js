/**
 * OPIF Carbon Footprint Calculator — emission factor registry.
 *
 * Every value here was read directly from the published source on the
 * verification date. Nothing is interpolated or invented. To update, replace
 * the value, `year`, `verified` and (if needed) `limitations`, then run the tests.
 *
 * Output unit is kg CO2e per activity unit unless `output` says otherwise
 * (the CEA grid factor is CO2 only).
 */

const DESNZ_2025 = {
  name: 'UK DESNZ Greenhouse gas reporting: conversion factors 2025 (flat file)',
  url: 'https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025',
  year: '2025',
};
const CEA_V21 = {
  name: 'Central Electricity Authority, CO2 Baseline Database for the Indian Power Sector, User Guide Version 21.0 (Table S)',
  url: 'https://cea.nic.in/cdm-co2-baseline-database/?lang=en',
  year: 'FY 2024-25 (published November 2025)',
};
const VERIFIED = '2026-10-23';
const UK_GEO = 'United Kingdom (used as a documented proxy for India)';

function f(id, category, subcategory, value, unit, src, geo, assumptions, limitations, output = 'kg CO2e') {
  return Object.freeze({
    id, category, subcategory, value, unit, output,
    geography: geo, source: src.name, url: src.url, year: src.year,
    verified: VERIFIED, assumptions, limitations,
  });
}

export const FACTORS = Object.freeze(Object.fromEntries([
  // Electricity
  f('grid_india', 'Electricity', 'Indian grid electricity (weighted average)', 0.710, 'kWh', CEA_V21,
    'India (national grid)',
    'CEA weighted average of 0.710 tCO2/MWh = 0.710 kg CO2/kWh, including renewable and captive injection.',
    'CO2 only (not CO2e). Generation-side factor: excludes transmission and distribution losses and upstream fuel emissions. National average; state-level mixes and on-site or contracted renewables are not reflected.',
    'kg CO2'),

  // Fuels (combustion, Scope 1 style; well-to-tank excluded)
  f('diesel_l', 'Fuels', 'Diesel (100% mineral)', 2.66155, 'litre', DESNZ_2025, 'Fuel property — applicable to India',
    'Combustion only. 100% mineral diesel chosen because Indian retail diesel is not blended with biodiesel at UK levels.',
    'Excludes well-to-tank (extraction, refining, transport) emissions.'),
  f('petrol_l', 'Fuels', 'Petrol (100% mineral)', 2.33984, 'litre', DESNZ_2025, 'Fuel property — applicable to India',
    'Combustion only.',
    'Excludes well-to-tank emissions. Indian petrol contains up to ~20% ethanol (E20); the mineral factor may overstate tailpipe CO2e slightly.'),
  f('cng_kg', 'Fuels', 'CNG', 2.57546441, 'kg', DESNZ_2025, 'Fuel property — applicable to India',
    'DESNZ value of 2,575.46 kg CO2e per tonne converted to per kg.',
    'Excludes well-to-tank emissions.'),
  f('lpg_kg', 'Fuels', 'LPG', 2.93936095, 'kg', DESNZ_2025, 'Fuel property — applicable to India',
    'DESNZ value of 2,939.36 kg CO2e per tonne converted to per kg. Cylinder sizes: 14.2 kg domestic, 19 kg commercial, 5 kg FTL.',
    'Excludes well-to-tank emissions. Assumes cylinders are fully consumed.'),
  f('natgas_m3', 'Fuels', 'Natural gas (piped)', 2.06672, 'cubic metre', DESNZ_2025, UK_GEO,
    'Piped natural gas bills in India are in SCM; treated as equivalent to DESNZ cubic metres.',
    'DESNZ volume basis uses UK gas composition and standard conditions; Indian PNG calorific value may differ by a few percent.'),

  // Road transport
  f('car_petrol_km', 'Transport', 'Average petrol car', 0.16272, 'vehicle-km', DESNZ_2025, UK_GEO,
    'Average-size petrol car. Divided by occupants to allocate per person.',
    'Based on the UK fleet; Indian cars are typically smaller but drive in more congested conditions.'),
  f('car_diesel_km', 'Transport', 'Average diesel car', 0.17304, 'vehicle-km', DESNZ_2025, UK_GEO,
    'Average-size diesel car.', 'Based on the UK fleet.'),
  f('car_cng_km', 'Transport', 'Average CNG car', 0.17414, 'vehicle-km', DESNZ_2025, UK_GEO,
    'Average-size CNG car.', 'Based on the UK fleet; Indian CNG cars are mostly compact models.'),
  f('car_unknown_km', 'Transport', 'Average car / taxi (unknown fuel)', 0.16725, 'vehicle-km', DESNZ_2025, UK_GEO,
    'Average car, unknown fuel. Used for taxis and cars where fuel type is not known.', 'Based on the UK fleet.'),
  f('motorbike_km', 'Transport', 'Average motorbike / scooter', 0.11367, 'vehicle-km', DESNZ_2025, UK_GEO,
    'Average motorbike.',
    'UK average motorbike is larger than typical Indian 100–150 cc two-wheelers, so this likely overstates. Enter fuel litres for a better estimate.'),
  f('bus_km', 'Transport', 'Average local bus', 0.10385, 'passenger-km', DESNZ_2025, UK_GEO,
    'Average local bus, per passenger.', 'UK occupancy and fleet; Indian city buses usually carry more passengers per km.'),
  f('coach_km', 'Transport', 'Coach (intercity bus)', 0.02776, 'passenger-km', DESNZ_2025, UK_GEO,
    'Coach, per passenger.', 'UK coach occupancy and fleet.'),
  f('rail_km', 'Transport', 'National rail', 0.03546, 'passenger-km', DESNZ_2025, UK_GEO,
    'UK national rail average, per passenger.', 'UK traction mix and grid; Indian Railways differs in electrification, grid intensity and occupancy.'),
  f('metro_km', 'Transport', 'Light rail and tram (metro proxy)', 0.0286, 'passenger-km', DESNZ_2025, UK_GEO,
    'Light rail and tram used as a proxy for metro systems.', 'Reflects the UK electricity grid, which is less carbon-intensive than the Indian grid; likely understates for Indian metros.'),

  // Air (with radiative forcing, average passenger)
  f('flight_dom_km', 'Transport', 'Domestic flight (short-haul proxy, with RF)', 0.12786, 'passenger-km', DESNZ_2025,
    'DESNZ short-haul factor used for Indian domestic flights',
    'DESNZ "Short-haul, to/from UK" average passenger with radiative forcing (RF), used as a proxy for Indian domestic flights (typically 500–2,500 km). Includes the DESNZ distance uplift.',
    'Load factors and aircraft types differ from UK routes. RF multiplier represents non-CO2 climate effects and is uncertain.'),
  f('flight_intl_km', 'Transport', 'International flight (with RF)', 0.14253, 'passenger-km', DESNZ_2025,
    'International flights not to/from the UK',
    'DESNZ "International, to/from non-UK" average passenger with radiative forcing.',
    'Average cabin class. Business/first class travel would be substantially higher.'),

  // Accommodation
  f('hotel_india_night', 'Accommodation', 'Hotel stay, India', 58.9, 'room-night', DESNZ_2025, 'India',
    'DESNZ country-specific hotel factor for India, per occupied room per night.',
    'Average across hotel types; does not distinguish budget from luxury properties. Applies to hotels in India only.'),

  // Materials (primary production)
  f('paper_kg', 'Materials', 'Paper (primary production)', 1.3450779, 'kg', DESNZ_2025, UK_GEO,
    'DESNZ 1,345.08 kg CO2e per tonne converted to per kg. Cradle-to-gate of virgin paper.', 'Excludes printing and disposal.'),
  f('plastic_kg', 'Materials', 'Average plastics (primary production)', 3.17249932, 'kg', DESNZ_2025, UK_GEO,
    'DESNZ 3,172.50 kg CO2e per tonne converted to per kg. Used for disposable plastic items.', 'Average across plastic types; excludes disposal.'),

  // Waste disposal
  f('waste_residual_landfill_kg', 'Waste', 'Mixed residual waste to landfill', 0.49724244, 'kg', DESNZ_2025, UK_GEO,
    'DESNZ household residual waste, landfill.', 'UK landfill gas capture rates are higher than typical Indian dumpsites; likely understates.'),
  f('waste_food_landfill_kg', 'Waste', 'Food waste to landfill', 0.70030886, 'kg', DESNZ_2025, UK_GEO,
    'DESNZ organic food and drink waste, landfill.', 'Disposal emissions only; the embodied emissions of the wasted food are not included.'),
  f('waste_food_compost_kg', 'Waste', 'Food waste composted', 0.00898311, 'kg', DESNZ_2025, UK_GEO,
    'DESNZ organic food and drink waste, composting.', 'Assumes managed composting.'),
  f('waste_recycled_kg', 'Waste', 'Recycling (collection and processing)', 0.00468568, 'kg', DESNZ_2025, UK_GEO,
    'DESNZ closed-loop recycling disposal factor (transport to facility). Recycling is not zero-emission.',
    'Covers disposal-stage transport only; avoided-production benefits are not credited.'),
].map((x) => [x.id, x])));

export const LPG_CYLINDERS = Object.freeze({ domestic: 14.2, commercial: 19, ftl: 5 });

export function getFactor(id) {
  const factor = FACTORS[id];
  if (!factor) throw new Error(`Unknown emission factor: ${id}`);
  return factor;
}
