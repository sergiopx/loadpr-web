import {
  nearestAchievable, reverseCalc, sideFromCounts, solveInventory, achievableTotals,
  convert, roundToNearestPlate, warmupSets, oneRepMax, percentTable, round,
  KG_PLATES, LB_PLATES, BAR_PRESETS, colorFor,
} from '../engine/index.js';
import { renderDiagram, groupPlates } from './diagram.js';

// Trust boundary: the only HTML this file injects is (a) SVG built by the engine
// from numeric plate weights and (b) strings authored in our own locale JSON at
// build time. User input (target weight, reps, counts) reaches the engine only
// via Number(), and the DOM only via .value or textContent — never as markup —
// so innerHTML here carries no XSS surface.
const cfg = window.__LOADPR__ || {};
const s = cfg.strings || {};
const STORE_KEY = 'loadpr';
// A satellite's or scenario's starting case ({unit, target, barId | bar}).
// While it is set the widget ignores the saved state and saves nothing; the
// first user input releases it (holdPreset), and from then on the widget saves
// as usual.
let preset = cfg.preset || null;

// ── tiny DOM helper ────────────────────────────────────────────────────────
// `value` is set as a property after the children, so a <select> picks it up.
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') continue;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if ('value' in attrs && attrs.value != null) el.value = attrs.value;
  return el;
}
const fmt = (n) => (Math.round(n * 100) / 100).toString().replace('.', (s.meta && s.meta.decimal) || '.');

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveState(patch) {
  if (preset) return loadState();
  const next = { ...loadState(), ...patch };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
  return next;
}

function plateSet(unit) { return unit === 'lb' ? LB_PLATES : KG_PLATES; }

function field(label, control) {
  return h('label', { class: 'lp-field' }, [h('span', { class: 'lp-label' }, label), control]);
}

// Release the preset on the first input or button press inside root (capture
// phase, so it runs before the control's own handler saves), then persist the
// widget's current target via onRelease so a later remount keeps it.
function holdPreset(root, onRelease) {
  if (!preset) return;
  const release = (e) => {
    if (e.type === 'click' && !e.target.closest('button')) return;
    preset = null;
    for (const t of ['input', 'change', 'click']) root.removeEventListener(t, release, true);
    onRelease();
  };
  for (const t of ['input', 'change', 'click']) root.addEventListener(t, release, true);
}

// Re-render a widget from saved state (after a unit switch).
function remount(root, mount) { root.innerHTML = ''; mount(root); }

// ── shared equipment state ──────────────────────────────────────────────────
// Unit, bar, collars and the plate inventory are shared by the plate
// calculator, the bar reader and the home gym tool through one saved state.
function equipment() {
  if (preset) {
    const unit = preset.unit;
    // A scenario whose bar matches no preset sends {bar} instead of barId.
    return { unit, barId: preset.barId || 'custom', barCustom: preset.bar ?? (unit === 'lb' ? 45 : 20), collar: 0, inv: {} };
  }
  const st = loadState();
  const unit = st.unit || cfg.unitDefault || 'kg';
  return {
    unit,
    barId: st.barId || 'olympic_m',
    barCustom: st.barCustom || (unit === 'lb' ? 45 : 20),
    collar: st.collar || 0,
    inv: st.inv || {},
  };
}
const saveEquipment = (st) => saveState({ unit: st.unit, barId: st.barId, barCustom: st.barCustom, collar: st.collar, inv: st.inv });

// A custom bar must be a non-negative number, and so must the collars (an
// empty collar field counts as none); a negative entry hides the result
// instead of silently lowering the total.
const barValid = (st) => (st.barId !== 'custom' || (String(st.barCustom).trim() !== '' && Number(st.barCustom) >= 0))
  && !(Number(st.collar) < 0);

function barWeight(st) {
  if (st.barId === 'custom') return Math.max(0, Number(st.barCustom) || 0);
  const p = BAR_PRESETS[st.unit].find((b) => b.id === st.barId);
  return p ? p.weight : (st.unit === 'lb' ? 45 : 20);
}

// Ticked plates; a blank count means unlimited.
function inventoryOf(st) {
  return plateSet(st.unit)
    .filter((w) => st.inv[w]?.on !== false)
    .map((w) => (st.inv[w]?.count ? { weight: w, count: Number(st.inv[w].count) } : { weight: w }));
}

// Switching unit resets the bar and collars to that unit's defaults; the
// caller re-renders.
function unitToggle(st, onChange) {
  return h('div', { class: 'lp-seg' }, ['kg', 'lb'].map((u) =>
    h('button', { type: 'button', class: 'lp-seg-btn' + (u === st.unit ? ' on' : ''),
      onclick: () => {
        if (u === st.unit) return;
        Object.assign(st, { unit: u, barId: 'olympic_m', barCustom: u === 'lb' ? 45 : 20, collar: 0 });
        saveEquipment(st);
        onChange();
      } }, s.ui[u])));
}

function barSelect(st, onChange) {
  const custom = h('input', { id: 'lp-bar-custom', type: 'number', step: '0.5', min: '0', value: st.barCustom,
    oninput: (e) => { st.barCustom = e.target.value; onChange(); } });
  const toggle = () => { custom.style.display = st.barId === 'custom' ? '' : 'none'; };
  const select = h('select', { id: 'lp-bar', value: st.barId, onchange: (e) => { st.barId = e.target.value; toggle(); onChange(); } },
    [...BAR_PRESETS[st.unit].map((b) => h('option', { value: b.id }, s.ui.barPresets[b.id])),
     h('option', { value: 'custom' }, s.ui.barPresets.custom)]);
  toggle();
  return h('div', { class: 'lp-bar-group' }, [select, custom]);
}

function collarInput(st, onChange) {
  return h('input', { id: 'lp-collar', type: 'number', step: '0.5', min: '0', value: st.collar,
    oninput: (e) => { st.collar = e.target.value; onChange(); } });
}

function inventoryGrid(st, onChange) {
  return h('div', { class: 'lp-inv-grid' }, plateSet(st.unit).map((w) => {
    const cb = h('input', { type: 'checkbox', checked: st.inv[w]?.on !== false,
      onchange: (e) => { st.inv[w] = { ...(st.inv[w] || {}), on: e.target.checked }; onChange(); } });
    const count = h('input', { type: 'number', class: 'lp-count', min: '0', placeholder: s.ui.unlimited,
      value: st.inv[w]?.count || '', oninput: (e) => { st.inv[w] = { ...(st.inv[w] || {}), count: e.target.value }; onChange(); } });
    return h('label', { class: 'lp-inv-row' }, [cb, h('span', { class: 'lp-inv-w' }, `${fmt(w)} ${st.unit}`), count]);
  }));
}

// ── results ─────────────────────────────────────────────────────────────────
function chipsFor(plates, unit) {
  const chips = groupPlates(plates).map((g) =>
    h('span', { class: 'lp-chip' }, [
      h('i', { class: 'lp-dot', style: `background:${colorFor(g.weight, unit)}` }),
      `${g.count} × ${fmt(g.weight)}`,
    ]));
  return chips.length ? chips : [h('span', { class: 'lp-chip lp-chip-empty' }, s.ui.empty)];
}

function resultCard(plates, achieved, label, cls, unit, extra = null) {
  return h('div', { class: `lp-card ${cls}` }, [
    h('div', { class: 'lp-card-head' }, [
      h('span', { class: 'lp-badge' }, label),
      h('strong', { class: 'lp-weight-big' }, [`${fmt(achieved)} `, h('span', { class: 'lp-unit' }, unit)]),
    ]),
    extra,
    h('div', { class: 'lp-diagram-wrap', html: renderDiagram(plates, { unit, label: s.ui.diagramLabel }) }),
    h('div', { class: 'lp-meta' }, [h('span', { class: 'lp-per-side' }, `${s.ui.perSide}`), ...chipsFor(plates, unit)]),
  ]);
}

// An exact load, or the closest loads below and above (nearestAchievable or solveInventory).
function nearCards(near, unit) {
  if (near.exact) return [resultCard(near.plates, near.achieved, s.ui.exact, 'lp-exact', unit)];
  return [
    h('p', { class: 'lp-warn' }, s.ui.notExact),
    near.below && resultCard(near.below.plates, near.below.achieved, s.ui.closestBelow, 'lp-below', unit),
    near.above && resultCard(near.above.plates, near.above.achieved, s.ui.closestAbove, 'lp-above', unit),
  ].filter(Boolean);
}

// Tables scroll sideways inside the card instead of widening the page.
const scrollTable = (table) => h('div', { class: 'lp-table-wrap' }, table);

// ── plate calculator ────────────────────────────────────────────────────────
function mountPlateCalc(root) {
  const st = equipment();
  const out = h('div', { class: 'lp-out', id: 'lp-out' });
  const target = h('input', { id: 'lp-target', type: 'number', step: '0.5', min: '0', inputmode: 'decimal',
    value: preset ? preset.target : (loadState().lastTarget || ''), oninput: (e) => { saveState({ lastTarget: e.target.value }); compute(); } });
  holdPreset(root, () => saveState({ lastTarget: target.value }));

  function compute() {
    const t = Number(target.value);
    saveEquipment(st);
    out.innerHTML = '';
    if (!t || t < 0 || !barValid(st)) return;
    const inv = inventoryOf(st);
    const opts = { collar: Number(st.collar) || 0 };
    // Counted plates need the exact solver (greedy misses 80 kg from 2×25 + 4×15);
    // an unlimited set keeps the greedy search.
    const near = inv.some((d) => d.count !== undefined)
      ? solveInventory(t, barWeight(st), inv, opts)
      : nearestAchievable(t, barWeight(st), inv, opts);
    out.append(...nearCards(near, st.unit));
  }

  root.append(h('div', { class: 'lp-form' }, [
    field(s.ui.targetWeight, target),
    field(s.ui.unit, unitToggle(st, () => remount(root, mountPlateCalc))),
    field(s.ui.bar, barSelect(st, compute)),
    field(s.ui.collar, collarInput(st, compute)),
    h('details', { class: 'lp-inv' }, [h('summary', {}, s.ui.inventory), inventoryGrid(st, compute)]),
  ]), out);
  compute();
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
    out.innerHTML = '';
    // Rep formulas are only meaningful for 1–20 reps; Brzycki diverges at 37 and goes negative past it.
    if (!(w > 0) || !(r >= 1 && r <= 20)) return;
    const res = oneRepMax(w, r, formula.value);
    if (!Number.isFinite(res.oneRepMax) || res.oneRepMax <= 0) return;
    out.append(h('div', { class: 'lp-card' }, [
      h('div', { class: 'lp-card-head' }, [h('span', { class: 'lp-badge' }, t.estimated1rm), h('strong', { class: 'lp-weight-big' }, fmt(res.oneRepMax))]),
      scrollTable(h('table', { class: 'lp-table' }, [
        h('thead', {}, h('tr', {}, [h('th', {}, t.percent), h('th', {}, t.weight)])),
        h('tbody', {}, res.table.map((row) => h('tr', {}, [h('td', {}, row.percent + '%'), h('td', {}, fmt(row.weight))]))),
      ])),
    ]));
  };
  [weight, reps].forEach((el) => el.addEventListener('input', go));
  formula.addEventListener('change', go);
  root.append(h('div', { class: 'lp-form' }, [
    field(t.workingWeight || s.ui.targetWeight, weight), field(t.reps, reps), field(t.formula, formula),
  ]), out);
  go();
}

// ── 1RM percentage table ────────────────────────────────────────────────────
const PCT_OPTIONS = Array.from({ length: 15 }, (_, i) => 100 - i * 5); // 100..30

function mountPercentTable(root) {
  const t = s.tools.percentTable;
  const st = equipment();
  const saved = loadState();
  const out = h('div', { class: 'lp-out' });
  const pctSelect = (value) => h('select', { value: String(value) },
    PCT_OPTIONS.map((p) => h('option', { value: String(p) }, `${p}%`)));
  const orm = h('input', { type: 'number', step: '0.5', min: '0', inputmode: 'decimal', value: saved.pctOrm || '' });
  const from = pctSelect(saved.pctFrom || 100);
  const to = pctSelect(saved.pctTo || 50);
  const step = h('select', { value: String(saved.pctStep || 5) },
    [5, 2.5].map((v) => h('option', { value: String(v) }, `${fmt(v)}%`)));

  const go = () => {
    saveState({ pctOrm: orm.value, pctFrom: from.value, pctTo: to.value, pctStep: step.value });
    out.innerHTML = '';
    const w = Number(orm.value);
    if (!w || w < 0) return;
    const [hi, lo] = [Number(from.value), Number(to.value)].sort((a, b) => b - a);
    const rows = percentTable(w, { from: hi, to: lo, step: Number(step.value), roundTo: st.unit === 'lb' ? 5 : 2.5 });
    out.append(h('div', { class: 'lp-card' }, scrollTable(h('table', { class: 'lp-table' }, [
      h('thead', {}, h('tr', {}, [h('th', {}, t.percent), h('th', {}, t.weight), h('th', {}, t.loadable)])),
      h('tbody', {}, rows.map((r) => h('tr', {}, [
        h('td', {}, `${fmt(r.percent)}%`), h('td', {}, `${fmt(r.weight)} ${st.unit}`), h('td', {}, `${fmt(r.loadable)} ${st.unit}`),
      ]))),
    ]))));
  };
  orm.addEventListener('input', go);
  [from, to, step].forEach((el) => el.addEventListener('change', go));
  root.append(h('div', { class: 'lp-form' }, [
    field(t.oneRm, orm),
    field(s.ui.unit, unitToggle(st, () => remount(root, mountPercentTable))),
    h('div', { class: 'lp-bar-group lp-pct-range' }, [field(t.from, from), field(t.to, to), field(t.step, step)]),
  ]), out);
  go();
}

// ── what's on the bar (plates on one side → total) ──────────────────────────
function mountPlateReader(root) {
  const t = s.tools.plateReader;
  const st = equipment();
  const all = loadState().readerCounts || {};
  const counts = { ...(all[st.unit] || {}) };
  const out = h('div', { class: 'lp-out' });

  const compute = () => {
    saveEquipment(st);
    saveState({ readerCounts: { ...loadState().readerCounts, [st.unit]: counts } });
    out.innerHTML = '';
    if (!barValid(st)) return;
    const side = sideFromCounts(counts);
    const total = reverseCalc(side, barWeight(st), { collar: Number(st.collar) || 0 });
    const other = st.unit === 'kg' ? 'lb' : 'kg';
    out.append(resultCard(side, total, s.ui.totalOnBar, 'lp-reader', st.unit,
      h('p', { class: 'lp-meta lp-other' }, t.otherUnitLine.replace('{value}', `${fmt(round(convert(total, st.unit, other), 1))} ${other}`))));
  };

  const steppers = plateSet(st.unit).map((w) => {
    const n = h('output', { class: 'lp-step-n' }, String(counts[w] || 0));
    const set = (v) => { counts[w] = Math.max(0, Math.min(20, v)); n.textContent = String(counts[w]); compute(); };
    return h('div', { class: 'lp-step-row' }, [
      h('i', { class: 'lp-dot', style: `background:${colorFor(w, st.unit)}` }),
      h('span', { class: 'lp-inv-w' }, `${fmt(w)} ${st.unit}`),
      h('button', { type: 'button', class: 'lp-step-btn', 'aria-label': `${s.ui.removePlate} ${fmt(w)} ${st.unit}`, onclick: () => set((counts[w] || 0) - 1) }, '−'),
      n,
      h('button', { type: 'button', class: 'lp-step-btn', 'aria-label': `${s.ui.add} ${fmt(w)} ${st.unit}`, onclick: () => set((counts[w] || 0) + 1) }, '+'),
    ]);
  });
  const reset = h('button', { type: 'button', class: 'lp-btn-sm ghost', onclick: () => {
    for (const k of Object.keys(counts)) delete counts[k];
    remount(root, mountPlateReader);
  } }, s.ui.reset);

  root.append(h('div', { class: 'lp-form' }, [
    field(s.ui.unit, unitToggle(st, () => remount(root, mountPlateReader))),
    field(s.ui.bar, barSelect(st, compute)),
    field(s.ui.collar, collarInput(st, compute)),
    h('div', { class: 'lp-field', role: 'group', 'aria-label': s.ui.reverseMode }, [
      h('span', { class: 'lp-label' }, t.perSidePlates),
      h('p', { class: 'lp-hint' }, s.ui.reverseHint),
      h('div', { class: 'lp-step-grid' }, steppers),
      h('div', {}, reset),
    ]),
  ]), out);
  compute();
}

// ── home gym (the plates you own → exact load) ──────────────────────────────
const CAN_LOAD_MAX = 40;

function mountHomeGym(root) {
  const t = s.tools.homeGym;
  const st = equipment();
  const out = h('div', { class: 'lp-out' });
  const target = h('input', { id: 'lp-home-target', type: 'number', step: '0.5', min: '0', inputmode: 'decimal',
    value: preset ? preset.target : (loadState().homeTarget || ''), oninput: (e) => { saveState({ homeTarget: e.target.value }); compute(); } });
  holdPreset(root, () => saveState({ homeTarget: target.value }));

  // The smallest standard plate whose extra pair makes the target exact.
  function missingPlate(goal, bar, opts) {
    for (const w of [...plateSet(st.unit)].sort((a, b) => a - b)) {
      if (st.inv[w]?.on !== false && !st.inv[w]?.count) continue; // already unlimited
      const inv = inventoryOf(st).filter((d) => d.weight !== w);
      const owned = st.inv[w]?.on !== false ? Number(st.inv[w]?.count) || 0 : 0;
      if (solveInventory(goal, bar, [...inv, { weight: w, count: owned + 2 }], opts).exact) return w;
    }
    return null;
  }

  function compute() {
    saveEquipment(st);
    // Keep the "What you can load" list open across rebuilds.
    const wasOpen = !!out.querySelector?.('.lp-can-load')?.open;
    out.innerHTML = '';
    if (!barValid(st)) return;
    const bar = barWeight(st);
    const opts = { collar: Number(st.collar) || 0 };
    const inv = inventoryOf(st);
    const goal = Number(target.value);
    if (goal > 0) {
      const res = solveInventory(goal, bar, inv, opts);
      out.append(...nearCards(res, st.unit));
      const w = !res.exact && goal >= bar + 2 * opts.collar ? missingPlate(goal, bar, opts) : null;
      if (w !== null) out.append(h('p', { class: 'lp-hint lp-missing' }, t.missing.replace('{plate}', `${fmt(w)} ${st.unit}`)));
    }
    const totals = achievableTotals(bar, inv, opts);
    const shown = totals.slice(0, CAN_LOAD_MAX);
    out.append(h('details', { class: 'lp-inv lp-can-load', open: wasOpen ? '' : false }, [
      h('summary', {}, t.canLoad),
      h('ul', { class: 'lp-totals' }, [
        ...shown.map((x) => h('li', {}, `${fmt(x)} ${st.unit}`)),
        totals.length > CAN_LOAD_MAX && h('li', { class: 'lp-more' }, t.canLoadMore.replace('{n}', String(totals.length - CAN_LOAD_MAX))),
      ].filter(Boolean)),
    ]));
  }

  root.append(h('div', { class: 'lp-form' }, [
    field(t.owned, inventoryGrid(st, compute)),
    field(t.target, target),
    field(s.ui.unit, unitToggle(st, () => remount(root, mountHomeGym))),
    field(s.ui.bar, barSelect(st, compute)),
    field(s.ui.collar, collarInput(st, compute)),
  ]), out);
  compute();
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
    if (!(w > 0)) { out.innerHTML = ''; return; }
    const sets = warmupSets(w, undefined, { roundTo: unit === 'lb' ? 5 : 2.5 });
    out.innerHTML = '';
    out.append(h('div', { class: 'lp-card' }, scrollTable(h('table', { class: 'lp-table' }, [
      h('thead', {}, h('tr', {}, [h('th', {}, t.set), h('th', {}, '%'), h('th', {}, s.ui.targetWeight), h('th', {}, s.ui.reps)])),
      h('tbody', {}, sets.map((x, i) => h('tr', {}, [
        h('td', {}, i + 1), h('td', {}, Math.round(x.pct * 100) + '%'), h('td', {}, `${fmt(x.weight)} ${unit}`), h('td', {}, x.reps),
      ]))),
    ]))));
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
  const swap = h('button', { type: 'button', class: 'lp-seg-btn on' });
  const go = () => {
    const v = Number(value.value);
    const to = from === 'kg' ? 'lb' : 'kg';
    swap.textContent = s.ui.convertArrow.replace('{from}', from).replace('{to}', to);
    if (!(v > 0)) { out.innerHTML = ''; return; }
    const r = convert(v, from, to);
    const step = to === 'lb' ? 5 : 2.5;
    out.innerHTML = '';
    out.append(h('div', { class: 'lp-card' }, [
      h('div', { class: 'lp-card-head' }, [h('span', { class: 'lp-badge' }, t.result), h('strong', { class: 'lp-weight-big' }, [`${fmt(r)} `, h('span', { class: 'lp-unit' }, to)])]),
      h('p', { class: 'lp-meta' }, `≈ ${fmt(roundToNearestPlate(r, step))} ${to} (${s.ui.nearestLoadable})`),
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
    h('span', {}, s.ui.switchPrompt.replace('{lang}', target.name || nav)),
    h('a', { class: 'lp-btn-sm', href: target.url }, s.ui.switchYes),
    h('button', { class: 'lp-btn-sm ghost', type: 'button',
      onclick: () => { try { localStorage.setItem('loadpr.langseen', nav); } catch {} banner.remove(); } }, s.ui.switchNo),
  ]);
  document.body.prepend(banner);
}

// ── boot ─────────────────────────────────────────────────────────────────────
const WIDGETS = {
  plateCalc: mountPlateCalc, oneRepMax: mountOneRepMax, warmup: mountWarmup, converter: mountConverter,
  percentTable: mountPercentTable, plateReader: mountPlateReader, homeGym: mountHomeGym,
};

function boot() {
  languageSuggestion();
  const root = document.getElementById('lp-app');
  if (!root) return;
  root.classList.add('lp-ready');
  let mount = WIDGETS[cfg.tool];
  if (!mount) {
    console.error(`LoadPR: unknown tool "${cfg.tool}", mounting plateCalc`);
    mount = mountPlateCalc;
  }
  mount(root);
}
if (document.readyState !== 'loading') boot();
else document.addEventListener('DOMContentLoaded', boot);
