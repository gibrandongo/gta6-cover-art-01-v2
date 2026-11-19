// Vice Cover Studio — editor wiring.
// Owns the page state (photos, layout, grade, words, effects), the live preview
// canvas, drag-to-pan cropping, and the PNG export. The drawing itself lives in
// ./cover.js; the fixed ?shot= scenes for screenshots live in ./shots.js.
import {
  SIZES, LAYOUTS, GRADES, layoutPanelCount,
  renderCover, makeExportCanvas, defaultState, panelsForLayout,
} from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const statusEl = $('status');

const state = defaultState();
const photos = { A: null, B: null };
let selectedPanel = 0;

function redraw() {
  renderCover(canvas, state, photos);
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function setStatus(text) {
  statusEl.textContent = text;
}

/* ---------- panel tabs ---------- */

const PANEL_LABELS = {
  hero: ['Hero', 'Top', 'Middle', 'Bottom'],
  grid: ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
  bleed: ['Full photo'],
  strip: ['Tall', 'Top', 'Bottom'],
};

function rebuildPanelTabs() {
  const tabs = $('panelTabs');
  tabs.textContent = '';
  const labels = PANEL_LABELS[state.layout] ?? [];
  for (let i = 0; i < layoutPanelCount(state.layout); i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg-btn';
    btn.textContent = labels[i] ?? `Panel ${i + 1}`;
    btn.setAttribute('aria-pressed', String(i === selectedPanel));
    btn.addEventListener('click', () => {
      selectedPanel = i;
      syncPanelControls();
      rebuildPanelTabs();
    });
    tabs.appendChild(btn);
  }
}

function currentPanel() {
  return state.panels[selectedPanel] ?? state.panels[0];
}

function syncPanelControls() {
  const p = currentPanel();
  $('panelPhoto').value = p.photo;
  $('zoom').value = String(p.zoom);
  $('offsetX').value = String(p.ox);
  $('offsetY').value = String(p.oy);
  $('zoomVal').textContent = `${Number(p.zoom).toFixed(2)}×`;
  $('oxVal').textContent = String(p.ox);
  $('oyVal').textContent = String(p.oy);
}

function bindPanelControl(id, apply) {
  $(id).addEventListener('input', (e) => {
    apply(Number(e.target.value));
    syncPanelControls();
    redraw();
  });
}
bindPanelControl('zoom', (v) => { currentPanel().zoom = v; });
bindPanelControl('offsetX', (v) => { currentPanel().ox = v; });
bindPanelControl('offsetY', (v) => { currentPanel().oy = v; });
$('panelPhoto').addEventListener('change', (e) => {
  currentPanel().photo = e.target.value;
  redraw();
});

/* ---------- photos ---------- */

async function loadPhotoSlot(slot, url, label) {
  try {
    photos[slot] = await loadImage(url);
    $(slot === 'A' ? 'nameA' : 'nameB').textContent = label;
    setStatus(`Photo ${slot} loaded — ${label}.`);
    redraw();
  } catch {
    setStatus(`Could not load ${label}. Try another file.`);
  }
}

function bindFileInput(id, slot) {
  $(id).addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await loadPhotoSlot(slot, URL.createObjectURL(file), file.name);
  });
}
bindFileInput('photoA', 'A');
bindFileInput('photoB', 'B');

document.querySelectorAll('[data-sample]').forEach((chip) => {
  chip.addEventListener('click', async () => {
    const name = chip.getAttribute('data-sample');
    const slot = name === 'pier' ? 'B' : 'A';
    await loadPhotoSlot(slot, `samples/${name}.jpg`, `${name}.jpg (sample)`);
  });
});

/* ---------- layout, grade, size ---------- */

function pressOnly(rowId, btn) {
  document.querySelectorAll(`#${rowId} [aria-pressed]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(b === btn));
  });
}

$('layoutRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-layout]');
  if (!btn) return;
  const layout = btn.getAttribute('data-layout');
  if (!LAYOUTS[layout]) return;
  state.layout = layout;
  state.panels = panelsForLayout(state, layout);
  selectedPanel = 0;
  pressOnly('layoutRow', btn);
  rebuildPanelTabs();
  syncPanelControls();
  redraw();
});

$('gradeRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-grade]');
  if (!btn) return;
  const grade = btn.getAttribute('data-grade');
  if (!GRADES[grade]) return;
  state.grade = grade;
  pressOnly('gradeRow', btn);
  redraw();
});

$('sizeRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-size]');
  if (!btn) return;
  const size = btn.getAttribute('data-size');
  if (!SIZES[size]) return;
  state.size = size;
  pressOnly('sizeRow', btn);
  $('sizeLabel').textContent = SIZES[size].label;
  redraw();
});

/* ---------- words & effects ---------- */

$('title').addEventListener('input', (e) => { state.title = e.target.value; redraw(); });
$('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; redraw(); });
[['fxGrain', 'grain'], ['fxVignette', 'vignette'], ['fxHalftone', 'halftone']].forEach(([id, key]) => {
  $(id).addEventListener('change', (e) => {
    state.effects[key] = e.target.checked;
    redraw();
  });
});

/* ---------- one photo everywhere ---------- */

/* ---------- reset the panel crops ---------- */

$('resetBtn').addEventListener('click', () => {
  state.panels = panelsForLayout(defaultState(), state.layout);
  selectedPanel = 0;
  rebuildPanelTabs();
  syncPanelControls();
  redraw();
  setStatus('Panel crops reset.');
});

/* ---------- one photo everywhere ---------- */

$('fillAllA').addEventListener('click', () => {
  const slot = photos.A ? 'A' : 'B';
  state.panels.forEach((p) => { p.photo = slot; });
  syncPanelControls();
  redraw();
  setStatus(`Every panel now shows Photo ${slot}.`);
});

/* ---------- drag to pan the selected panel ---------- */

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    w: rect.width,
    h: rect.height,
  };
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const pt = canvasPoint(e);
  const bandH = Math.round(canvas.height * (state.layout === 'bleed' ? 0.26 : 0.22));
  const top = canvas.height - bandH;
  if (pt.y > top) return; // title band is not draggable
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  drag = { x: pt.x, y: pt.y, panel: currentPanel(), rectW: canvas.width, rectH: top };
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const pt = canvasPoint(e);
  const dx = ((pt.x - drag.x) / drag.rectW) * 100;
  const dy = ((pt.y - drag.y) / drag.rectH) * 100;
  drag.panel.ox = Math.max(-50, Math.min(50, drag.panel.ox + dx));
  drag.panel.oy = Math.max(-50, Math.min(50, drag.panel.oy + dy));
  drag.x = pt.x;
  drag.y = pt.y;
  syncPanelControls();
  redraw();
});
function endDrag() {
  drag = null;
  canvas.classList.remove('dragging');
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------- export ---------- */

function exportPNG() {
  const out = makeExportCanvas(state, photos);
  const size = SIZES[state.size];
  const name = `vice-cover-${size.w}x${size.h}.png`;
  out.toBlob((blob) => {
    if (!blob) {
      setStatus('Export failed — try again.');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus(`Saved ${name} (${size.label}).`);
  }, 'image/png');
}
$('exportBtn').addEventListener('click', exportPNG);
$('exportBtn2').addEventListener('click', exportPNG);

/* ---------- shot scenes & first paint ---------- */

const editorApi = {
  state,
  photos,
  redraw,
  loadImage,
  async loadSample(name, slot) {
    await loadPhotoSlot(slot, `samples/${name}.jpg`, `${name}.jpg (sample)`);
  },
  setLayout(layout) {
    state.layout = layout;
    state.panels = panelsForLayout(state, layout);
    selectedPanel = 0;
    rebuildPanelTabs();
    syncPanelControls();
  },
  setGrade(grade) { state.grade = grade; },
  setSize(size) { state.size = size; },
  setTitle(text) { state.title = text; $('title').value = text; },
  setSubtitle(text) { state.subtitle = text; $('subtitle').value = text; },
  setPanels(panels) { state.panels = panels; },
  setEffects(effects) {
    Object.assign(state.effects, effects);
    $('fxGrain').checked = state.effects.grain;
    $('fxVignette').checked = state.effects.vignette;
    $('fxHalftone').checked = state.effects.halftone;
  },
};

rebuildPanelTabs();
syncPanelControls();

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, editorApi);
} else {
  redraw();
}
