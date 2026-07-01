import { round } from './util.js';

const KG_PER_LB = 0.45359237; // exact, by definition
const LB_PER_KG = 1 / KG_PER_LB; // ≈ 2.2046226218

/** Convert a weight between kg and lb. Identity when units match. */
export function convert(weight, from, to) {
  if (from === to) return weight;
  if (from === 'kg' && to === 'lb') return round(weight * LB_PER_KG, 4);
  if (from === 'lb' && to === 'kg') return round(weight * KG_PER_LB, 4);
  throw new Error(`Unsupported conversion: ${from} -> ${to}`);
}

/**
 * Snap a weight to the nearest loadable increment. `step` is the smallest total
 * change to the bar (2 × smallest plate), e.g. 2.5 kg for a 1.25 kg micro plate.
 */
export function roundToNearestPlate(weight, step) {
  return round(Math.round(weight / step) * step);
}
