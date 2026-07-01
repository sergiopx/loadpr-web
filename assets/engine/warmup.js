import { roundToNearestPlate } from './convert.js';

// A reasonable default ramp: ascending %, dropping reps toward the work set.
export const DEFAULT_WARMUP_SCHEME = [
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 5 },
  { pct: 0.75, reps: 3 },
  { pct: 0.85, reps: 2 },
];

/**
 * Progressive warmup breakdown from a working weight.
 * @param {number} working  the top work-set weight
 * @param {Array<{pct:number,reps:number}>} scheme  percent/reps ramp
 * @param {{roundTo?:number}} opts  loadable increment (default 2.5)
 * @returns {Array<{pct:number,reps:number,weight:number}>}
 */
export function warmupSets(working, scheme = DEFAULT_WARMUP_SCHEME, { roundTo = 2.5 } = {}) {
  return scheme.map((s) => ({
    pct: s.pct,
    reps: s.reps,
    weight: roundToNearestPlate(working * s.pct, roundTo),
  }));
}
