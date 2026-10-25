import { round } from './util.js';
import { KG_PLATES, LB_PLATES } from './presets.js';

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

  // Target under the bar: the empty bar is the nearest load above it, and
  // nothing is loadable below. (The upward scan would start one step past
  // the bar and suggest bar + the smallest pair.)
  const base = round(bar + 2 * (opts.collar || 0));
  if (target < base) {
    return { exact: false, below: null, above: { achieved: base, plates: [] } };
  }

  // No usable plate (all unticked, or every count under a pair): the bar is the
  // only load, so there is no step to scan with.
  const usable = inventory.filter((d) => d.weight > 0 && usablePairs(d) > 0);
  if (!usable.length) {
    return {
      exact: direct.remainder === 0,
      below: target >= base ? { achieved: base, plates: [] } : null,
      above: target < base ? { achieved: base, plates: [] } : null,
    };
  }

  const minDenom = Math.min(...usable.map((d) => d.weight));
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

/**
 * One side's plates from per-denomination counts, e.g. {25: 1, 15: 1} → [25, 15].
 * Counts are plates on ONE side; zero is skipped.
 */
export function sideFromCounts(counts) {
  const plates = [];
  const entries = Object.entries(counts).map(([w, n]) => [Number(w), n]).sort((a, b) => b[0] - a[0]);
  for (const [w, n] of entries) {
    if (!Number.isInteger(n) || n < 0) throw new Error(`sideFromCounts: bad count ${n} for ${w}`);
    for (let i = 0; i < n; i++) plates.push(w);
  }
  return plates;
}

// ── exact solver for a limited inventory ────────────────────────────────────
// The greedy platesPerSide misses loads a real home gym can make: two 25s and
// four 15s on a 20 kg bar can't reach 80 greedily (25 + nothing), but 15 + 15
// per side does. The solver works on integer units (weights × 100, divided by
// the gcd of the denominations) with a bounded DP over one side.

// Default cap on the bar total: 1000 kg, or 2205 lb when the plates are lb plates.
const LB_ONLY = LB_PLATES.filter((w) => !KG_PLATES.includes(w));
const defaultMax = (inventory) => (inventory.some((d) => LB_ONLY.includes(d.weight)) ? 2205 : 1000);

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Reachability table shared by solveInventory and achievableTotals.
//   f[i][s] = fewest plates from items i.. (heaviest first) summing to s units
//   on one side, or Infinity. Rows are filled from the lightest item upward, so
//   reconstruction can walk heaviest-first.
function reachTable(bar, inventory, collar, maxTotal) {
  const base = round(bar + 2 * collar);
  const merged = new Map();
  for (const d of inventory) {
    if (!(d.weight > 0)) continue;
    const prev = merged.get(d.weight);
    const count = d.count === undefined || prev?.count === undefined ? undefined : prev.count + d.count;
    merged.set(d.weight, prev ? { weight: d.weight, count } : { weight: d.weight, count: d.count });
  }
  const raw = [...merged.values()].filter((d) => usablePairs(d) > 0).sort((a, b) => b.weight - a.weight);
  if (!raw.length) return { base, unit: 1, items: [], cap: 0, f: [[0]] };

  const cents = raw.map((d) => Math.round(d.weight * 100));
  const unit = cents.reduce(gcd);
  const cap = Math.max(0, Math.floor((Math.round(((maxTotal - base) / 2) * 100) + 1e-9) / unit));
  const items = raw.map((d, i) => {
    const w = cents[i] / unit;
    const pairs = d.count === undefined ? Math.min(Math.floor(cap / w), 40) : usablePairs(d);
    return { weight: d.weight, w, pairs };
  });

  const f = Array.from({ length: items.length + 1 }, () => new Array(cap + 1).fill(Infinity));
  f[items.length][0] = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const { w, pairs } = items[i];
    const next = f[i + 1], row = f[i];
    for (let s = 0; s <= cap; s++) {
      let best = Infinity;
      for (let k = 0; k <= pairs && k * w <= s; k++) {
        const c = next[s - k * w] + k;
        if (c < best) best = c;
      }
      row[s] = best;
    }
  }
  return { base, unit, items, cap, f };
}

// Heaviest-first plates for side sum s: take as many of each denomination as
// still allows a minimum-count finish. That yields the lexicographically
// greatest descending list among the minimum-count solutions.
function platesFor(t, s) {
  const plates = [];
  for (let i = 0; i < t.items.length; i++) {
    const { weight, w, pairs } = t.items[i];
    for (let k = Math.min(pairs, Math.floor(s / w)); k >= 0; k--) {
      if (t.f[i + 1][s - k * w] + k === t.f[i][s]) {
        for (let j = 0; j < k; j++) plates.push(weight);
        s -= k * w;
        break;
      }
    }
  }
  return plates;
}

/**
 * Exact load for a limited inventory, fewest plates first.
 * @returns {{exact:boolean, achieved:number, plates:number[], remainder:number,
 *   below:{achieved, plates}|null, above:{achieved, plates}|null}}
 *   achieved/plates — the best load at or under the target (bar only if none)
 *   below — the largest reachable total at or under the target
 *   above — the smallest reachable total over it, within maxTotal
 */
export function solveInventory(target, bar, inventory, { collar = 0, maxTotal } = {}) {
  const t = reachTable(bar, inventory, collar, maxTotal ?? defaultMax(inventory));
  const { base } = t;
  if (!t.items.length) {
    return {
      exact: target === base, achieved: base, plates: [], remainder: round(target - base),
      below: target >= base ? { achieved: base, plates: [] } : null,
      above: target < base ? { achieved: base, plates: [] } : null,
    };
  }
  const total = (s) => round(base + (2 * s * t.unit) / 100);
  const load = (s) => ({ achieved: total(s), plates: platesFor(t, s) });
  const reach = t.f[0];
  const side = ((target - base) / 2) * 100 / t.unit; // may be fractional or negative

  let below = null;
  for (let s = Math.min(t.cap, Math.floor(side + 1e-9)); s >= 0; s--) {
    if (reach[s] < Infinity) { below = load(s); break; }
  }
  let above = null;
  for (let s = Math.max(0, Math.floor(side + 1e-9) + 1); s <= t.cap; s++) {
    if (reach[s] < Infinity) { above = load(s); break; }
  }

  const exact = !!below && below.achieved === round(target);
  const best = below || { achieved: base, plates: [] };
  return { exact, achieved: best.achieved, plates: best.plates, remainder: round(target - best.achieved), below, above };
}

/** Every bar total the inventory can make, ascending, up to `max`. */
export function achievableTotals(bar, inventory, { collar = 0, max } = {}) {
  const t = reachTable(bar, inventory, collar, max ?? defaultMax(inventory));
  const out = [];
  t.f[0].forEach((c, s) => { if (c < Infinity) out.push(round(t.base + (2 * s * t.unit) / 100)); });
  return out;
}
