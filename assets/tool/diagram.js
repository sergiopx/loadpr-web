import { colorFor } from '../engine/presets.js';

// Render the LoadPR-app-style plate visual as an SVG string: ONE side, plates
// as tall rounded bars ramping up in height from a short grey bar sleeve, with
// soft drop shadows and the app's iOS colors. Pure + dependency-free so it runs
// identically at build time (static HTML) and live in the browser.
//
// `plates` is one side's denominations (any order — drawn smallest→largest so
// the silhouette ramps up outward, matching the app).
export function renderDiagram(plates, { unit = 'kg' } = {}) {
  const maxRef = unit === 'lb' ? 45 : 25; // biggest common plate = tallest
  const asc = [...plates].sort((a, b) => a - b);
  const pw = 34;        // plate width
  const gap = 6;
  const rx = 10;        // rounded corners
  const H = 240;
  const cy = H / 2;
  const barStub = 44;   // grey bar shown to the left of the sleeve
  const sleeveW = 16;
  const hFor = (w) => 74 + (Math.min(w, maxRef) / maxRef) * 150; // 74..224

  let x = barStub + sleeveW;
  const rects = asc.map((w) => {
    const h = hFor(w);
    const r = `<rect x="${x.toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${pw}" height="${h.toFixed(1)}" rx="${rx}" fill="${colorFor(w, unit)}" filter="url(#lp-shadow)"/>`;
    x += pw + gap;
    return r;
  });
  const W = Math.max(x + 8, barStub + sleeveW + 40);

  const bar = `<rect x="0" y="${cy - 6}" width="${barStub + 3}" height="12" rx="6" fill="#C7C7CC"/>`;
  const sleeve = `<rect x="${barStub}" y="${cy - 11}" width="${sleeveW}" height="22" rx="5" fill="#AEAEB2"/>`;

  return `<svg class="lp-diagram" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${plates.length} plates per side" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><filter id="lp-shadow" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.20)"/></filter></defs>` +
    `${bar}${sleeve}${rects.join('')}</svg>`;
}

// Small chips listing plates + counts, e.g. "25 × 1, 15 × 1". Handy label under
// the diagram. Returns an array of { weight, count } grouped, heaviest first.
export function groupPlates(plates) {
  const map = new Map();
  for (const w of plates) map.set(w, (map.get(w) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([weight, count]) => ({ weight, count }));
}
