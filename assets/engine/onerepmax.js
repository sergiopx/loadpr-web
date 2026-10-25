import { round } from './util.js';
import { roundToNearestPlate } from './convert.js';

// Estimated 1RM formulas. Each takes (weight, reps) → estimated one-rep max.
export const FORMULAS = {
  epley: (w, r) => w * (1 + r / 30),
  brzycki: (w, r) => (w * 36) / (37 - r),
  lombardi: (w, r) => w * r ** 0.1,
  oconner: (w, r) => w * (1 + r / 40),
};

/**
 * Percent table of a 1RM, descending from `from`% to `to`% inclusive. With no
 * options: 100% down to 50% in 5% steps. With `roundTo` (the loadable
 * increment, e.g. 2.5 kg) each row also carries the nearest loadable weight.
 * @returns {Array<{percent:number, weight:number, loadable?:number}>}
 */
export function percentTable(orm, { from = 100, to = 50, step = 5, roundTo } = {}) {
  if (!(step > 0)) throw new Error(`percentTable: step must be > 0, got ${step}`);
  if (from < to) throw new Error(`percentTable: from (${from}) is below to (${to})`);
  const n = Math.floor((from - to) / step + 1e-9) + 1;
  if (n > 200) throw new Error(`percentTable: ${n} rows exceeds 200`);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = round(from - i * step, 4);
    const weight = round((orm * p) / 100, 2);
    rows.push(roundTo ? { percent: p, weight, loadable: roundToNearestPlate(weight, roundTo) } : { percent: p, weight });
  }
  return rows;
}

/**
 * Estimate a one-rep max and its training percentages.
 * @returns {{oneRepMax:number, formula:string, reps:number, table:Array}}
 */
export function oneRepMax(weight, reps, formula = 'epley') {
  const f = FORMULAS[formula];
  if (!f) throw new Error(`Unknown 1RM formula: ${formula}`);
  const orm = round(f(weight, reps), 2);
  return { oneRepMax: orm, formula, reps, table: percentTable(orm) };
}
