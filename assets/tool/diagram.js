import { colorFor } from '../engine/presets.js';

const esc = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// The app's plate visual (Disques/.../PlateVisualView.swift) as an SVG string:
// ONE side of the bar, sleeve → collar → plates smallest to largest, every
// plate sized by sqrt(weight / reference) in both height and width, so the
// biggest plate sits on the outside. Same metrics as the app: 120 pt max
// height, 40 pt max width, 3 pt between plates, 6 pt corners, a light material
// wash, a thin white edge (stronger in dark mode, see .plate-edge in site.css)
// and a soft glow in the plate's own color.
// Pure + dependency-free so it runs identically at build time (static HTML)
// and live in the browser.
//
// `plates` is one side's denominations, in any order. `label` is the localized
// "plates per side" (ui.diagramLabel) read after the count by screen readers.
const MAX_H = 120, MIN_H = 16, MAX_W = 40, MIN_W = 6, GAP = 3, RX = 6;
const SLEEVE_W = 15, SLEEVE_H = 12, COLLAR_W = 12, COLLAR_H = 24, COLLAR_GAP = 4;

// Heavier than the reference (45 lb / 20 kg) is 15% bigger, never more.
function size(w, ref, max, min) {
  return w > ref ? max * 1.15 : Math.max(min, max * Math.sqrt(w / ref));
}

export function renderDiagram(plates, { unit = 'kg', label = '' } = {}) {
  const ref = unit === 'lb' ? 45 : 20;
  const asc = [...plates].sort((a, b) => a - b);
  const H = MAX_H * 1.2;
  const cy = H / 2;

  let x = SLEEVE_W + COLLAR_W + COLLAR_GAP;
  const glows = new Map();
  const rects = asc.map((w, i) => {
    const pw = size(w, ref, MAX_W, MIN_W);
    const ph = size(w, ref, MAX_H, MIN_H);
    const fill = colorFor(w, unit);
    const solid = fill.startsWith('#');
    // One glow filter per hue; the grays (CSS variables) get a neutral one.
    const gid = solid ? `lp-glow-${fill.slice(1).toLowerCase()}` : 'lp-glow-n';
    glows.set(gid, solid ? fill : 'rgba(0,0,0,.25)');
    const box = `x="${x.toFixed(1)}" y="${(cy - ph / 2).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="${RX}"`;
    const g = `<g class="plate" style="--i:${i}" filter="url(#${gid})">` +
      `<rect ${box} style="fill:${fill}"/>` +
      `<rect ${box} fill="url(#lp-wash)"/>` +
      `<rect ${box} class="plate-edge" fill="none"/></g>`;
    x += pw + GAP;
    return g;
  });
  const W = Math.max(x - GAP + 4, SLEEVE_W + COLLAR_W + COLLAR_GAP + 40);

  const sleeve = `<rect x="0" y="${cy - SLEEVE_H / 2}" width="${SLEEVE_W}" height="${SLEEVE_H}" fill="#8E8E93" fill-opacity=".4"/>`;
  const collar = `<rect x="${SLEEVE_W}" y="${cy - COLLAR_H / 2}" width="${COLLAR_W}" height="${COLLAR_H}" fill="#8E8E93" fill-opacity=".7"/>`;
  const defs = `<defs><linearGradient id="lp-wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient>` +
    [...glows].map(([id, c]) => `<filter id="${id}" x="-40%" y="-20%" width="180%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="${c}" flood-opacity=".3"/></filter>`).join('') +
    `</defs>`;

  return `<svg class="lp-diagram" viewBox="0 0 ${W.toFixed(1)} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(`${plates.length} ${label}`.trim())}" xmlns="http://www.w3.org/2000/svg">` +
    `${defs}${sleeve}${collar}${rects.join('')}</svg>`;
}

// Small chips listing plates + counts, e.g. "25 × 1, 15 × 1". Handy label under
// the diagram. Returns an array of { weight, count } grouped, heaviest first.
export function groupPlates(plates) {
  const map = new Map();
  for (const w of plates) map.set(w, (map.get(w) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([weight, count]) => ({ weight, count }));
}
