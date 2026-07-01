import { round } from './util.js';

// Estimated 1RM formulas. Each takes (weight, reps) → estimated one-rep max.
export const FORMULAS = {
  epley: (w, r) => w * (1 + r / 30),
  brzycki: (w, r) => (w * 36) / (37 - r),
  lombardi: (w, r) => w * r ** 0.1,
  oconner: (w, r) => w * (1 + r / 40),
};

/** Percent table from 100% down to 50% in 5% steps. */
export function percentTable(orm) {
  const rows = [];
  for (let p = 100; p >= 50; p -= 5) {
    rows.push({ percent: p, weight: round((orm * p) / 100, 2) });
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
