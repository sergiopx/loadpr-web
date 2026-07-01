// Public engine surface. Language-agnostic, pure, unit-tested. Same functions
// power every locale's tool page and the build-time programmatic pages.
export { platesPerSide, nearestAchievable, reverseCalc } from './plates.js';
export { convert, roundToNearestPlate } from './convert.js';
export { warmupSets, DEFAULT_WARMUP_SCHEME } from './warmup.js';
export { oneRepMax, percentTable, FORMULAS } from './onerepmax.js';
export {
  KG_PLATES, LB_PLATES, KG_INVENTORY, LB_INVENTORY,
  BAR_PRESETS, DEFAULT_BAR, IWF_COLORS, colorFor,
} from './presets.js';
export { round } from './util.js';
