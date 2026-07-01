import {
  platesPerSide, nearestAchievable, reverseCalc,
  convert, roundToNearestPlate, warmupSets, oneRepMax,
  KG_PLATES, LB_PLATES, BAR_PRESETS, colorFor,
} from '../engine/index.js';
import { renderDiagram, groupPlates } from './diagram.js';

// Trust boundary: the only HTML this file injects is (a) SVG built by the engine
// from numeric plate weights and (b) strings authored in our own locale JSON at
// build time. User input (target weight, reps) reaches the engine only via
// Number(), never the DOM as markup — so innerHTML here carries no XSS surface.
const cfg = window.__LOADPR__ || {};
const s = cfg.strings || {};
const STORE_KEY = 'loadpr';

// ── tiny DOM helper ────────────────────────────────────────────────────────
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const fmt = (n) => (Math.round(n * 100) / 100).toString().replace('.', s.decimal || '.');

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveState(patch) {
  const next = { ...loadState(), ...patch };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
  return next;
}

function plateSet(unit) { return unit === 'lb' ? LB_PLATES : KG_PLATES; }

// ── plate calculator ────────────────────────────────────────────────────────
function mountPlateCalc(root) {
  const st = loadState();
  let unit = st.unit || cfg.unitDefault || 'kg';
  let barId = st.barId || 'olympic_m';
  let barCustom = st.barCustom || (unit === 'lb' ? 45 : 20);
  let collar = st.collar || 0;
  let inv = st.inv || {};

  const barWeight = () => {
    if (barId === 'custom') return Number(barCustom) || 0;
    const p = BAR_PRESETS[unit].find((b) => b.id === barId);
    return p ? p.weight : (unit === 'lb' ? 45 : 20);
  };
  const inventory = () => plateSet(unit)
    .filter((w) => inv[w]?.on !== false)
    .map((w) => (inv[w]?.count ? { weight: w, count: Number(inv[w].count) } : { weight: w }));

  const out = h('div', { class: 'lp-out', id: 'lp-out' });

  function compute() {
    const target = Number(document.getElementById('lp-target').value);
    saveState({ unit, barId, barCustom, collar, inv });
    if (!target || target < 0) { out.innerHTML = ''; return; }
    const bar = barWeight();
    const opts = { collar: Number(collar) || 0 };
    const near = nearestAchievable(target, bar, inventory(), opts);
    out.innerHTML = '';
    if (near.exact) {
      out.append(resultCard(near.plates, near.achieved, s.ui.exact, 'lp-exact'));
    } else {
      out.append(h('p', { class: 'lp-warn' }, s.ui.notExact));
      if (near.below) out.append(resultCard(near.below.plates, near.below.achieved, s.ui.closestBelow, 'lp-below'));
      if (near.above) out.append(resultCard(near.above.plates, near.above.achieved, s.ui.closestAbove, 'lp-above'));
    }
  }

  function resultCard(plates, achieved, label, cls) {
    const chips = groupPlates(plates).map((g) =>
      h('span', { class: 'lp-chip' }, [
        h('i', { class: 'lp-dot', style: `background:${colorFor(g.weight, unit)}` }),
        `${g.count} × ${fmt(g.weight)}`,
      ]));
    return h('div', { class: `lp-card ${cls}` }, [
      h('div', { class: 'lp-card-head' }, [
        h('span', { class: 'lp-badge' }, label),
        h('strong', { class: 'lp-weight-big' }, [`${fmt(achieved)} `, h('span', { class: 'lp-unit' }, unit)]),
      ]),
      h('div', { class: 'lp-diagram-wrap', html: renderDiagram(plates, { unit }) }),
      h('div', { class: 'lp-meta' }, [
        h('span', { class: 'lp-per-side' }, `${s.ui.perSide}`),
        ...(chips.length ? chips : [h('span', { class: 'lp-chip lp-chip-empty' }, s.ui.empty)]),
      ]),
    ]);
  }

  // form
  const barSelect = h('select', { id: 'lp-bar', onchange: (e) => { barId = e.target.value; toggleCustom(); compute(); } },
    [...BAR_PRESETS[unit].map((b) => h('option', { value: b.id }, s.ui.barPresets[b.id])),
     h('option', { value: 'custom' }, s.ui.barPresets.custom)]);
  barSelect.value = barId;
  const barCustomInput = h('input', { id: 'lp-bar-custom', type: 'number', step: '0.5', value: barCustom, min: '0',
    oninput: (e) => { barCustom = e.target.value; compute(); } });
  const toggleCustom = () => { barCustomInput.style.display = barId === 'custom' ? '' : 'none'; };

  const unitToggle = h('div', { class: 'lp-seg' }, ['kg', 'lb'].map((u) =>
    h('button', { type: 'button', class: 'lp-seg-btn' + (u === unit ? ' on' : ''),
      onclick: () => { if (u !== unit) { unit = u; rebuild(); } } }, s.ui[u])));

  const invRows = plateSet(unit).map((w) => {
    const on = inv[w]?.on !== false;
    const cb = h('input', { type: 'checkbox', checked: on,
      onchange: (e) => { inv[w] = { ...(inv[w] || {}), on: e.target.checked }; compute(); } });
    const count = h('input', { type: 'number', class: 'lp-count', min: '0', placeholder: s.ui.unlimited,
      value: inv[w]?.count || '', oninput: (e) => { inv[w] = { ...(inv[w] || {}), count: e.target.value }; compute(); } });
    return h('label', { class: 'lp-inv-row' }, [cb, h('span', { class: 'lp-inv-w' }, `${fmt(w)} ${unit}`), count]);
  });

  const form = h('div', { class: 'lp-form' }, [
    field(s.ui.targetWeight, h('input', { id: 'lp-target', type: 'number', step: '0.5', min: '0',
      inputmode: 'decimal', value: st.lastTarget || '', oninput: (e) => { saveState({ lastTarget: e.target.value }); compute(); } })),
    field(s.ui.unit, unitToggle),
    field(s.ui.bar, h('div', { class: 'lp-bar-group' }, [barSelect, barCustomInput])),
    field(s.ui.collar, h('input', { id: 'lp-collar', type: 'number', step: '0.5', min: '0', value: collar,
      oninput: (e) => { collar = e.target.value; compute(); } })),
    h('details', { class: 'lp-inv' }, [
      h('summary', {}, s.ui.inventory),
      h('div', { class: 'lp-inv-grid' }, invRows),
    ]),
  ]);

  function rebuild() {
    barCustom = unit === 'lb' ? 45 : 20; barId = 'olympic_m'; collar = 0;
    saveState({ unit, barId, barCustom, collar });
    root.innerHTML = ''; mountPlateCalc(root);
  }

  root.append(form, out);
  toggleCustom();
  compute();
}

function field(label, control) {
  return h('label', { class: 'lp-field' }, [h('span', { class: 'lp-label' }, label), control]);
}

// ── 1RM ─────────────────────────────────────────────────────────────────────
function mountOneRepMax(root) {
  const t = s.tools.oneRepMax;
  const out = h('div', { class: 'lp-out' });
  const st = loadState();
  const weight = h('input', { type: 'number', step: '0.5', min: '0', inputmode: 'decimal', value: st.ormW || '' });
  const reps = h('input', { type: 'number', min: '1', max: '20', value: st.ormR || '5' });
  const formula = h('select', {}, Object.keys(t.formulas).map((k) => h('option', { value: k }, t.formulas[k])));
  const go = () => {
    const w = Number(weight.value), r = Number(reps.value);
    saveState({ ormW: weight.value, ormR: reps.value });
    if (!w || !r) { out.innerHTML = ''; return; }
    const res = oneRepMax(w, r, formula.value);
    out.innerHTML = '';
    out.append(h('div', { class: 'lp-card' }, [
      h('div', { class: 'lp-card-head' }, [h('span', { class: 'lp-badge' }, t.estimated1rm), h('strong', { class: 'lp-weight-big' }, fmt(res.oneRepMax))]),
      h('table', { class: 'lp-table' }, [
        h('thead', {}, h('tr', {}, [h('th', {}, t.percent), h('th', {}, t.weight)])),
        h('tbody', {}, res.table.map((row) => h('tr', {}, [h('td', {}, row.percent + '%'), h('td', {}, fmt(row.weight))]))),
      ]),
    ]));
  };
  [weight, reps].forEach((el) => el.addEventListener('input', go));
  formula.addEventListener('change', go);
  root.append(h('div', { class: 'lp-form' }, [
    field(t.workingWeight || s.ui.targetWeight, weight), field(t.reps, reps), field(t.formula, formula),
  ]), out);
  go();
}

// ── warmup ──────────────────────────────────────────────────────────────────
function mountWarmup(root) {
  const t = s.tools.warmup;
  const out = h('div', { class: 'lp-out' });
  const st = loadState();
  let unit = st.unit || cfg.unitDefault || 'kg';
  const weight = h('input', { type: 'number', step: '0.5', min: '0', inputmode: 'decimal', value: st.warmW || '' });
  const go = () => {
    const w = Number(weight.value);
    saveState({ warmW: weight.value });
    if (!w) { out.innerHTML = ''; return; }
    const sets = warmupSets(w, undefined, { roundTo: unit === 'lb' ? 5 : 2.5 });
    out.innerHTML = '';
    out.append(h('table', { class: 'lp-table lp-card' }, [
      h('thead', {}, h('tr', {}, [h('th', {}, t.set), h('th', {}, '%'), h('th', {}, s.ui.targetWeight), h('th', {}, s.tools.oneRepMax?.reps || 'reps')])),
      h('tbody', {}, sets.map((x, i) => h('tr', {}, [
        h('td', {}, i + 1), h('td', {}, Math.round(x.pct * 100) + '%'), h('td', {}, `${fmt(x.weight)} ${unit}`), h('td', {}, x.reps),
      ]))),
    ]));
  };
  weight.addEventListener('input', go);
  root.append(h('div', { class: 'lp-form' }, [field(t.workingWeight, weight)]), out);
  go();
}

// ── converter ────────────────────────────────────────────────────────────────
function mountConverter(root) {
  const t = s.tools.converter;
  const out = h('div', { class: 'lp-out' });
  let from = 'kg';
  const value = h('input', { type: 'number', step: '0.5', min: '0', inputmode: 'decimal' });
  const swap = h('button', { type: 'button', class: 'lp-seg-btn on' }, 'kg → lb');
  const go = () => {
    const v = Number(value.value);
    const to = from === 'kg' ? 'lb' : 'kg';
    swap.textContent = `${from} → ${to}`;
    if (!v) { out.innerHTML = ''; return; }
    const r = convert(v, from, to);
    const step = to === 'lb' ? 5 : 2.5;
    out.innerHTML = '';
    out.append(h('div', { class: 'lp-card' }, [
      h('div', { class: 'lp-card-head' }, [h('span', { class: 'lp-badge' }, t.result), h('strong', { class: 'lp-weight-big' }, [`${fmt(r)} `, h('span', { class: 'lp-unit' }, to)])]),
      h('p', { class: 'lp-meta' }, `≈ ${fmt(roundToNearestPlate(r, step))} ${to} (${s.ui.exact.toLowerCase?.() || ''})`),
    ]));
  };
  swap.addEventListener('click', () => { from = from === 'kg' ? 'lb' : 'kg'; go(); });
  value.addEventListener('input', go);
  root.append(h('div', { class: 'lp-form' }, [field(t.from + ' / ' + t.to, h('div', { class: 'lp-bar-group' }, [value, swap]))]), out);
  go();
}

// ── soft language suggestion (never a hard redirect) ─────────────────────────
function languageSuggestion() {
  const locales = cfg.locales || {};
  const current = cfg.currentLocale;
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  const dismissed = (() => { try { return localStorage.getItem('loadpr.langseen'); } catch { return null; } })();
  if (!nav || nav === current || !locales[nav] || dismissed === nav) return;
  const target = locales[nav];
  const banner = h('div', { class: 'lp-langbar' }, [
    h('span', {}, (s.ui.switchPrompt || 'View in {lang}?').replace('{lang}', target.name || nav)),
    h('a', { class: 'lp-btn-sm', href: target.url }, s.ui.switchYes || 'Switch'),
    h('button', { class: 'lp-btn-sm ghost', type: 'button',
      onclick: () => { try { localStorage.setItem('loadpr.langseen', nav); } catch {} banner.remove(); } }, s.ui.switchNo || 'No'),
  ]);
  document.body.prepend(banner);
}

// ── boot ─────────────────────────────────────────────────────────────────────
function boot() {
  languageSuggestion();
  const root = document.getElementById('lp-app');
  if (!root) return;
  root.classList.add('lp-ready');
  ({ plateCalc: mountPlateCalc, oneRepMax: mountOneRepMax, warmup: mountWarmup, converter: mountConverter }[cfg.tool] || mountPlateCalc)(root);
}
if (document.readyState !== 'loading') boot();
else document.addEventListener('DOMContentLoaded', boot);
