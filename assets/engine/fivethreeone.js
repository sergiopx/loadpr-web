import { round } from './util.js';
import { roundToNearestPlate } from './convert.js';
import { platesPerSide } from './plates.js';
import { KG_INVENTORY, LB_INVENTORY } from './presets.js';

// Jim Wendler's 5/3/1: every percentage is of the training max (TM), never of
// the 1RM. Weeks 1–3 end on a plus set (as many good reps as you can); week 4
// is the deload. These are the program's widely published percentages.
export const WEEKS_531 = [
  { key: 'w1', sets: [[65, '5'], [75, '5'], [85, '5+']] },
  { key: 'w2', sets: [[70, '3'], [80, '3'], [90, '3+']] },
  { key: 'w3', sets: [[75, '5'], [85, '3'], [95, '1+']] },
  { key: 'deload', sets: [[40, '5'], [50, '5'], [60, '5']] },
];
// The program's warm-up before the main sets, as % of the TM.
export const WARMUP_531 = [[40, '5'], [50, '5'], [60, '3']];
// Training max added after each cycle: upper body (bench, press) and lower body (squat, deadlift).
export const CYCLE_INCREASE = { lb: { upper: 5, lower: 10 }, kg: { upper: 2.5, lower: 5 } };
export const TM_PERCENTS = [90, 85];

/**
 * One 5/3/1 cycle from a max.
 * @param {number} max        the 1RM, or the training max itself when tmPercent is 100
 * @param {object} o
 * @param {'kg'|'lb'} o.unit
 * @param {number} [o.bar]          bar weight; loads below it are clamped to the empty bar
 * @param {number} [o.tmPercent=90] 90 (original), 85 (later books) or 100 (max already is the TM)
 * @param {boolean} [o.warmup=true] add the 40/50/60% warm-up to weeks 1–3
 * @param {'none'|'fsl'|'bbb'} [o.supplemental='none'] First Set Last 5×5, or Boring But Big 5×10
 * @param {number} [o.bbbPercent=50] BBB weight as % of the TM
 * @param {'upper'|'lower'} [o.body='lower'] which cycle increase applies
 * @returns {{ tm:number, weeks:Array, nextTm:number, increase:number }}
 *   each week: { key, sets: [{ kind: 'warmup'|'main'|'supp', percent, reps, sets, weight, load, plates }] }
 *   weight = exact % of the TM; load = nearest weight loadable with the standard
 *   plates (5 lb or 2.5 kg steps), never below the bar; plates = one side, heaviest first.
 */
export function fiveThreeOne(max, { unit, bar, tmPercent = 90, warmup = true, supplemental = 'none', bbbPercent = 50, body = 'lower' } = {}) {
  if (unit !== 'kg' && unit !== 'lb') throw new Error(`fiveThreeOne: unit must be kg or lb, got ${unit}`);
  if (!(max > 0)) throw new Error(`fiveThreeOne: max must be > 0, got ${max}`);
  if (![...TM_PERCENTS, 100].includes(tmPercent)) throw new Error(`fiveThreeOne: tmPercent must be 90, 85 or 100, got ${tmPercent}`);
  if (!['none', 'fsl', 'bbb'].includes(supplemental)) throw new Error(`fiveThreeOne: unknown supplemental ${supplemental}`);
  const barW = bar ?? (unit === 'lb' ? 45 : 20);
  const step = unit === 'lb' ? 5 : 2.5;
  const inv = unit === 'lb' ? LB_INVENTORY : KG_INVENTORY;
  const tm = round((max * tmPercent) / 100, 2);

  const set = (kind, percent, reps, sets = 1) => {
    const weight = round((tm * percent) / 100, 2);
    const load = Math.max(barW, roundToNearestPlate(weight, step));
    return { kind, percent, reps, sets, weight, load, plates: platesPerSide(load, barW, inv).plates };
  };

  const weeks = WEEKS_531.map((w) => {
    const deload = w.key === 'deload';
    const sets = [
      ...(warmup && !deload ? WARMUP_531.map(([p, r]) => set('warmup', p, r)) : []),
      ...w.sets.map(([p, r]) => set('main', p, r)),
    ];
    if (!deload && supplemental === 'fsl') sets.push(set('supp', w.sets[0][0], '5', 5));
    if (!deload && supplemental === 'bbb') sets.push(set('supp', bbbPercent, '10', 5));
    return { key: w.key, sets };
  });

  const increase = CYCLE_INCREASE[unit][body === 'upper' ? 'upper' : 'lower'];
  return { tm, weeks, nextTm: round(tm + increase, 2), increase };
}
