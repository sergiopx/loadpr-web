// Language-agnostic equipment presets. Pure data — no strings, so every locale
// shares them. UI labels for bars/plates come from the locale string tables.

export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

// Plate colors matching the LoadPR iOS app's palette (iOS system colors).
// lb follows the app exactly (45 blue, 35 green, 5 red); kg keeps the IWF
// competition hues but in the app's brighter iOS tones. Keyed per unit.
export const PLATE_COLORS = {
  lb: { 45: '#0A84FF', 35: '#30D158', 25: '#FFD60A', 10: '#FF9F0A', 5: '#FF3B30', 2.5: '#8E8E93', 1.25: '#AEAEB2' },
  kg: { 25: '#FF3B30', 20: '#0A84FF', 15: '#FFD60A', 10: '#30D158', 5: '#AEAEB2', 2.5: '#1C1C1E', 1.25: '#8E8E93', 1: '#30D158', 0.5: '#AEAEB2', 0.25: '#8E8E93' },
};

// Back-compat alias (kg competition colors).
export const IWF_COLORS = PLATE_COLORS.kg;

// Bar presets by unit. Weight is the bar's own mass.
export const BAR_PRESETS = {
  kg: [
    { id: 'olympic_m', weight: 20 },
    { id: 'olympic_w', weight: 15 },
    { id: 'training', weight: 10 },
  ],
  lb: [
    { id: 'olympic_m', weight: 45 },
    { id: 'olympic_w', weight: 33 },
    { id: 'training', weight: 15 },
  ],
};

export const DEFAULT_BAR = { kg: 20, lb: 45 };

// Convenience: inventory arrays (unlimited counts) for the standard sets.
export const KG_INVENTORY = KG_PLATES.map((weight) => ({ weight }));
export const LB_INVENTORY = LB_PLATES.map((weight) => ({ weight }));

export function colorFor(weight, unit = 'kg') {
  const map = PLATE_COLORS[unit] || PLATE_COLORS.kg;
  return map[weight] || '#8E8E93';
}
