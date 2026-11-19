// Fixed scenes for screenshots, driven by ?shot= in the URL.
//   ?shot=cover    — the cover alone, full frame (the exported art)
//   ?shot=editor   — the editor with a sample photo loaded
//   ?shot=portrait — a portrait cover alone, full frame
//   ?shot=square   — a square cover alone, full frame
// Extra query knobs: layout, grade, size, photo (boulevard|pier), photoB,
// caption, subtitle. window.__shotReady is set once the scene has painted,
// so a screenshot script can wait for it instead of guessing a delay.
export async function runShot(shot, query, api) {
  const pick = (key, fallback) => query.get(key) ?? fallback;

  if (shot === 'cover' || shot === 'portrait' || shot === 'square') {
    document.body.classList.add('shot-cover');
  }

  // size: explicit ?size= wins, otherwise the scene decides
  const size = pick('size', shot === 'portrait' ? 'portrait' : shot === 'square' ? 'square' : 'wide');
  api.setSize(size);

  api.setLayout(pick('layout', size === 'portrait' ? 'strip' : 'hero'));
  api.setGrade(pick('grade', 'sunset'));
  api.setTitle(pick('caption', 'NEON BOULEVARD'));
  api.setSubtitle(pick('subtitle', 'PALMS, NEON & GOLD'));
  api.setEffects({ grain: true, vignette: true, halftone: true });

  // photos: ?photo= goes to slot A, ?photoB= to slot B
  await api.loadSample(pick('photo', 'boulevard'), 'A');
  await api.loadSample(pick('photoB', 'pier'), 'B');

  // Per-panel crops that show off the multi-panel look. The two sample photos
  // are portrait/square, so a wide panel only shows a slice of one: the
  // vertical offsets below pull each slice up onto the subject's face
  // (positive oy shifts the photo down inside its panel, revealing its top).
  const crops = {
    hero: [
      { photo: 'A', zoom: 1.05, ox: -6, oy: 42 },
      { photo: 'B', zoom: 1.15, ox: 4, oy: 75 },
      { photo: 'A', zoom: 1.6, ox: 10, oy: -6 },
      { photo: 'B', zoom: 1.3, ox: -8, oy: 60 },
    ],
    grid: [
      { photo: 'A', zoom: 1.05, ox: -4, oy: 38 },
      { photo: 'B', zoom: 1.1, ox: 4, oy: 55 },
      { photo: 'B', zoom: 1.4, ox: -10, oy: 20 },
      { photo: 'A', zoom: 1.45, ox: 8, oy: 25 },
    ],
    bleed: [{ photo: 'B', zoom: 1.05, ox: 0, oy: 45 }],
    strip: [
      { photo: 'A', zoom: 1.1, ox: -4, oy: 3 },
      { photo: 'B', zoom: 1.15, ox: 5, oy: 55 },
      { photo: 'A', zoom: 1.5, ox: -8, oy: 20 },
    ],
  };
  api.setPanels(crops[api.state.layout] ?? crops.hero);

  api.redraw();
  // two frames: one for the canvas paint, one for the browser to settle.
  // Fonts settle first so the poster lettering is final when the shot lands.
  await document.fonts.ready.catch(() => undefined);
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
