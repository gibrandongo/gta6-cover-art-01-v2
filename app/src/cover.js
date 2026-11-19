// Vice Cover Studio — cover rendering engine.
// Draws the multi-panel GTA-style poster onto any 2D canvas: panels with per-panel
// crop/zoom, a colour grade, a halftone title band with bold poster lettering,
// film grain and a vignette. No external assets, no fonts to download — the
// lettering uses heavy system stacks ('Arial Black', Impact) with letter-spacing.
// All drawing is plain Canvas 2D, so the live preview and the PNG export share
// exactly the same code path.

export const SIZES = {
  square: { w: 1080, h: 1080, label: '1080 × 1080' },
  portrait: { w: 1080, h: 1350, label: '1080 × 1350' },
  wide: { w: 1920, h: 1080, label: '1920 × 1080' },
};

export const LAYOUTS = {
  hero: { name: 'Hero + 3', panels: 4 },
  grid: { name: '4-panel grid', panels: 4 },
  bleed: { name: 'Full-bleed', panels: 1 },
  strip: { name: 'Strip', panels: 3 },
};

export const GRADES = {
  sunset: {
    name: 'Sunset',
    sky: ['#ffd166', '#ff7a2f', '#e83e6b', '#5b1a5e'],
    wash: 'rgba(255, 94, 58, 0.20)',
    deep: 'rgba(91, 26, 94, 0.34)',
    titleFrom: '#fff3c4', titleTo: '#ff7a2f',
    accent: '#ffc93c', band: '#160a24', sub: '#ffd166',
  },
  neon: {
    name: 'Neon night',
    sky: ['#19e3d0', '#2f6df6', '#7b2ff7', '#12082e'],
    wash: 'rgba(123, 47, 247, 0.26)',
    deep: 'rgba(10, 8, 46, 0.42)',
    titleFrom: '#eafffb', titleTo: '#19e3d0',
    accent: '#ff2e88', band: '#0a0618', sub: '#19e3d0',
  },
  vice: {
    name: 'Teal / pink',
    sky: ['#0ff0c8', '#0a7fa8', '#c81e6b', '#1c0b2e'],
    wash: 'rgba(255, 94, 168, 0.20)',
    deep: 'rgba(10, 60, 90, 0.36)',
    titleFrom: '#ffffff', titleTo: '#ff5ea8',
    accent: '#0ff0c8', band: '#08131f', sub: '#0ff0c8',
  },
  noir: {
    name: 'Noir',
    sky: ['#f5f0e6', '#b9b3a4', '#55505a', '#0c0c10'],
    wash: 'rgba(200, 200, 210, 0.10)',
    deep: 'rgba(0, 0, 0, 0.42)',
    titleFrom: '#ffffff', titleTo: '#c9c9c9',
    accent: '#e8e8e8', band: '#0a0a0c', sub: '#d8d8d8',
  },
};

export function layoutPanelCount(layout) {
  return (LAYOUTS[layout] ?? LAYOUTS.hero).panels;
}

/** Panel rectangles for a layout, in cover pixels. `bandH` is the title band height. */
export function panelRects(layout, w, h, bandH) {
  const g = Math.max(6, Math.round(w * 0.012)); // white gutter between panels
  const top = h - bandH; // panels fill the area above the title band
  const inner = (x, y, pw, ph) => ({ x, y, w: pw, h: ph });
  if (layout === 'grid') {
    const cw = (w - g * 3) / 2;
    const ch = (top - g * 3) / 2;
    return [
      inner(g, g, cw, ch), inner(g * 2 + cw, g, cw, ch),
      inner(g, g * 2 + ch, cw, ch), inner(g * 2 + cw, g * 2 + ch, cw, ch),
    ];
  }
  if (layout === 'bleed') return [inner(0, 0, w, top)];
  if (layout === 'strip') {
    const leftW = Math.round(w * 0.55);
    const rightW = w - leftW - g * 3;
    const rh = (top - g * 3) / 2;
    return [
      inner(g, g, leftW - g, top - g * 2),
      inner(leftW + g, g, rightW, rh),
      inner(leftW + g, g * 2 + rh, rightW, rh),
    ];
  }
  // hero: one big panel left, three stacked right
  const heroW = Math.round(w * 0.62);
  const sideW = w - heroW - g * 3;
  const sh = (top - g * 4) / 3;
  return [
    inner(g, g, heroW - g, top - g * 2),
    inner(heroW + g, g, sideW, sh),
    inner(heroW + g, g * 2 + sh, sideW, sh),
    inner(heroW + g, g * 3 + sh * 2, sideW, sh),
  ];
}

/** Deterministic pseudo-random generator so the grain looks the same every render. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 160; tile.height = 160;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(160, 160);
  const rand = mulberry32(20261119);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  grainTile = tile;
  return tile;
}

/** A sunny placeholder scene for panels with no photo yet: sky, sun, skyline. */
function drawPlaceholder(ctx, rect, grade) {
  const { x, y, w, h } = rect;
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  grade.sky.forEach((c, i) => sky.addColorStop(i / (grade.sky.length - 1), c));
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  // sun disc
  const sunR = Math.min(w, h) * 0.22;
  const sunX = x + w * 0.68;
  const sunY = y + h * 0.38;
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 2.1);
  glow.addColorStop(0, 'rgba(255, 240, 180, 0.85)');
  glow.addColorStop(1, 'rgba(255, 240, 180, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#fff6cf';
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
  // skyline silhouette
  ctx.fillStyle = 'rgba(20, 8, 30, 0.55)';
  const base = y + h * 0.78;
  let bx = x;
  const rand = mulberry32(Math.round(w + h));
  while (bx < x + w) {
    const bw = w * (0.08 + rand() * 0.12);
    const bh = h * (0.10 + rand() * 0.22);
    ctx.fillRect(bx, base - bh, bw, bh);
    bx += bw + w * 0.015;
  }
  ctx.fillRect(x, base, w, y + h - base);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `800 ${Math.round(Math.min(w, h) * 0.055)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('ADD A PHOTO', x + w / 2, y + h * 0.56);
}

/** Draws one photo into a panel rect with cover-fit, zoom and pan offsets. */
function drawPanelPhoto(ctx, img, rect, panel, grade) {
  const { x, y, w, h } = rect;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const base = Math.max(w / iw, h / ih) * (panel.zoom || 1);
  const dw = iw * base;
  const dh = ih * base;
  const maxOx = Math.max(0, (dw - w) / 2);
  const maxOy = Math.max(0, (dh - h) / 2);
  const ox = Math.max(-maxOx, Math.min(maxOx, ((panel.ox || 0) / 100) * w));
  const oy = Math.max(-maxOy, Math.min(maxOy, ((panel.oy || 0) / 100) * h));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + w / 2 - dw / 2 + ox, y + h / 2 - dh / 2 + oy, dw, dh);
  // colour grade: warm wash from the top, deep shade from the bottom
  const wash = ctx.createLinearGradient(0, y, 0, y + h);
  wash.addColorStop(0, grade.wash);
  wash.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  wash.addColorStop(1, grade.deep);
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** Halftone dot field, used inside the title band. */
function drawHalftone(ctx, x, y, w, h, step) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
  for (let row = 0; row * step < h; row++) {
    for (let col = 0; col * step < w; col++) {
      const r = (step * 0.16) * (1 - row * step / (h * 1.6));
      if (r <= 0.4) continue;
      ctx.beginPath();
      ctx.arc(x + col * step + (row % 2 ? step / 2 : 0), y + row * step, Math.max(0.5, r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Fits the title to one line, shrinking until it fits the band. */
function fitTitleFont(ctx, text, maxWidth, startSize) {
  let size = startSize;
  const set = () => { ctx.font = `900 ${size}px "Arial Black", Impact, "Franklin Gothic Heavy", sans-serif`; };
  set();
  while (size > 16 && ctx.measureText(text).width > maxWidth) {
    size = Math.max(16, size - Math.ceil(size * 0.06));
    set();
  }
  return size;
}

/** The title band: dark base, halftone, gradient poster lettering, subtitle, accent rule. */
function drawTitleBand(ctx, w, h, bandY, bandH, state, grade) {
  const band = ctx.createLinearGradient(0, bandY, 0, h);
  band.addColorStop(0, grade.band);
  band.addColorStop(1, '#000000');
  ctx.fillStyle = band;
  ctx.fillRect(0, bandY, w, bandH);
  if (state.effects.halftone) {
    drawHalftone(ctx, 0, bandY, w, bandH * 0.42, Math.max(10, Math.round(w / 96)));
  }
  // accent rule above the title
  const ruleY = bandY + bandH * 0.14;
  const rule = ctx.createLinearGradient(0, 0, w, 0);
  rule.addColorStop(0, grade.accent);
  rule.addColorStop(0.5, grade.titleTo);
  rule.addColorStop(1, grade.accent);
  ctx.fillStyle = rule;
  ctx.fillRect(w * 0.06, ruleY, w * 0.88, Math.max(3, bandH * 0.022));

  const title = (state.title || '').trim().toUpperCase();
  const sub = (state.subtitle || '').trim().toUpperCase();
  const cx = w / 2;
  if (title) {
    const size = fitTitleFont(ctx, title, w * 0.9, Math.round(bandH * 0.44));
    try { ctx.letterSpacing = `${Math.round(size * 0.045)}px`; } catch { /* older canvas */ }
    const grad = ctx.createLinearGradient(0, bandY + bandH * 0.16, 0, bandY + bandH * 0.72);
    grad.addColorStop(0, grade.titleFrom);
    grad.addColorStop(1, grade.titleTo);
    ctx.save();
    ctx.translate(cx, bandY + bandH * 0.5);
    ctx.transform(1, 0, -0.06, 1, 0, 0); // slight forward slant, poster style
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = Math.max(3, size * 0.09);
    ctx.strokeText(title, 0, 0);
    ctx.fillStyle = grad;
    ctx.fillText(title, 0, 0);
    ctx.restore();
    try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
    if (sub) {
      const subSize = Math.max(13, Math.round(size * 0.26));
      ctx.font = `800 ${subSize}px system-ui, sans-serif`;
      try { ctx.letterSpacing = `${Math.round(subSize * 0.42)}px`; } catch { /* older canvas */ }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = grade.sub;
      ctx.fillText(sub, cx, bandY + bandH * 0.87);
      try { ctx.letterSpacing = '0px'; } catch { /* older canvas */ }
    }
  }
}

/** Small corner stamp, top-right of the cover. */
function drawStamp(ctx, w, grade, state) {
  const pad = Math.max(10, w * 0.018);
  const fs = Math.max(13, Math.round(w * 0.016));
  ctx.save();
  ctx.font = `800 ${fs}px system-ui, sans-serif`;
  const label = '★ COVER STUDIO';
  const tw = ctx.measureText(label).width + fs * 1.6;
  const th = fs * 2.1;
  ctx.translate(w - pad - tw / 2, pad + th / 2);
  ctx.rotate(-0.07);
  ctx.fillStyle = grade.accent;
  ctx.beginPath();
  ctx.roundRect(-tw / 2, -th / 2, tw, th, th / 2);
  ctx.fill();
  ctx.fillStyle = '#14060f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

/**
 * Renders a full cover onto `canvas` (resized to the chosen export size).
 * `state` holds layout/grade/title/panels; `photos` maps 'A'/'B' to images (or null).
 */
export function renderCover(canvas, state, photos) {
  const size = SIZES[state.size] ?? SIZES.wide;
  const w = size.w;
  const h = size.h;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const bandH = Math.round(h * (state.layout === 'bleed' ? 0.26 : 0.22));
  const bandY = h - bandH;

  // white poster frame
  ctx.fillStyle = '#f8f4ec';
  ctx.fillRect(0, 0, w, h);

  const rects = panelRects(state.layout, w, h, bandH);
  rects.forEach((rect, i) => {
    const panel = state.panels[i] || { photo: 'A', zoom: 1, ox: 0, oy: 0 };
    const img = photos[panel.photo] || null;
    if (img) drawPanelPhoto(ctx, img, rect, panel, grade);
    else drawPlaceholder(ctx, rect, grade);
    // thin white frame around each panel
    ctx.strokeStyle = '#f8f4ec';
    ctx.lineWidth = Math.max(4, Math.round(w * 0.006));
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });

  drawTitleBand(ctx, w, h, bandY, bandH, state, grade);
  drawStamp(ctx, w, grade, state);

  if (state.effects.vignette) {
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
  if (state.effects.grain) {
    const tile = getGrainTile();
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  return canvas;
}

/** Builds a fresh offscreen canvas with the cover rendered at export size. */
export function makeExportCanvas(state, photos) {
  const canvas = document.createElement('canvas');
  return renderCover(canvas, state, photos);
}

/** Default cover state: hero layout, sunset grade, boulevard wording. */
export function defaultState() {
  return {
    size: 'wide',
    layout: 'hero',
    grade: 'sunset',
    title: 'NEON BOULEVARD',
    subtitle: 'PALMS, NEON & GOLD',
    effects: { grain: true, vignette: true, halftone: true },
    panels: [
      { photo: 'A', zoom: 1, ox: 0, oy: 0 },
      { photo: 'B', zoom: 1, ox: 0, oy: 0 },
      { photo: 'A', zoom: 1.25, ox: 0, oy: 0 },
      { photo: 'B', zoom: 1.15, ox: 0, oy: 0 },
    ],
  };
}

/** Resizes a state's panel list to a layout's panel count, keeping existing crops. */
export function panelsForLayout(state, layout) {
  const count = layoutPanelCount(layout);
  const next = [];
  for (let i = 0; i < count; i++) {
    next.push(state.panels[i] || { photo: i % 2 === 0 ? 'A' : 'B', zoom: 1, ox: 0, oy: 0 });
  }
  return next;
}
