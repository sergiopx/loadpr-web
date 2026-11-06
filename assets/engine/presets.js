// Language-agnostic equipment presets. Pure data — no strings, so every locale
// shares them. UI labels for bars/plates come from the locale string tables.

export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

// The app's palette (Shared/PlateColors.swift): the same hues for lb and kg by
// size rank. Plates with no hue of their own use the app's system grays, as CSS
// variables so they follow light and dark like UIColor.systemGray3/4.
export const PLATE_COLORS = {
  lb: { 45: '#3380E6', 35: '#33BFA6', 25: '#F2CC33', 10: '#F28C26', 5: '#E64040', 2.5: 'var(--plate-small)', 1.25: 'var(--plate-small)' },
  kg: { 25: '#3380E6', 20: '#33BFA6', 15: '#F2CC33', 10: '#F28C26', 5: '#E64040', 2.5: 'var(--plate-small)', 1.25: 'var(--plate-small)' },
};

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
  return map[weight] || 'var(--plate-other)';
}
