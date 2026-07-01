import { round } from './util.js';

// Inventory item: { weight, count? }
//   weight — plate denomination
//   count  — TOTAL plates of this denomination you own. Loading a barbell is
//            symmetric, so usable pairs (one plate per side) = floor(count/2).
//            Omit `count` for unlimited.

function usablePairs(item) {
  return item.count === undefined ? Infinity : Math.floor(item.count / 2);
}

/**
 * Greedy heaviest-first solve for one side of the bar.
 * @returns {{ plates:number[], achieved:number, remainder:number }}
 *   plates    — denominations for ONE side, heaviest first
 *   achieved  — total weight actually on the bar (bar + collars + both sides)
 *   remainder — target - achieved (0 = exact, <0 = target below bar, >0 = short)
 */
export function platesPerSide(target, bar, inventory, { collar = 0 } = {}) {
  const base = round(bar + 2 * collar);
  const plates = [];
  let remaining = round((target - base) / 2);

  if (remaining < 0) {
    return { plates, achieved: base, remainder: round(target - base) };
  }

  const denoms = [...inventory].sort((a, b) => b.weight - a.weight);
  for (const d of denoms) {
    if (remaining <= 0) break;
    let n = Math.floor(remaining / d.weight + 1e-9);
    const avail = usablePairs(d);
    if (n > avail) n = avail;
    for (let i = 0; i < n; i++) plates.push(d.weight);
    remaining = round(remaining - n * d.weight);
  }

  const sidesum = plates.reduce((a, b) => a + b, 0);
  const achieved = round(base + 2 * sidesum);
  return { plates, achieved, remainder: round(target - achieved) };
}

/**
 * Total weight on the bar given the plates loaded on ONE side.
 * The "walk up to a loaded bar and read it" use case.
 */
export function reverseCalc(sidePlates, bar, { collar = 0 } = {}) {
  const sidesum = sidePlates.reduce((a, b) => a + b, 0);
  return round(bar + 2 * collar + 2 * sidesum);
}

/**
 * If `target` is exactly loadable, return it. Otherwise return the closest
 * achievable weight below and above — the top complaint users have about
 * competitors that just say "impossible".
 * @returns {{exact:true, achieved, plates} | {exact:false, below, above}}
 */
export function nearestAchievable(target, bar, inventory, opts = {}) {
  const direct = platesPerSide(target, bar, inventory, opts);
  if (direct.remainder === 0) {
    return { exact: true, achieved: direct.achieved, plates: direct.plates };
  }

  const minDenom = Math.min(...inventory.map((d) => d.weight));
  const step = round(2 * minDenom); // smallest change to the bar total

  // Greedy already gives the largest reachable total <= target.
  const below =
    direct.remainder > 0
      ? { achieved: direct.achieved, plates: direct.plates }
      : null; // target below bar: nothing loadable underneath

  // Scan upward in the smallest increment until a total is exactly loadable.
  let above = null;
  let cand = direct.achieved;
  for (let i = 0; i < 2000; i++) {
    cand = round(cand + step);
    const p = platesPerSide(cand, bar, inventory, opts);
    if (p.remainder === 0) {
      above = { achieved: cand, plates: p.plates };
      break;
    }
  }

  return { exact: false, below, above };
}
