// Vice Cover Studio — the entry program (Node 22, standard library only).
//
// It hands the app in: it copies this repository's app/ and screenshots/
// folders into the output directory and writes dossier.json there, using the
// vendored make.fun library (vendor/makefun-app.ts, byte-identical to the kit).
//
// Run it locally to check the hand-in:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader's container MAKEFUN_OUTPUT_DIR is unset and the output goes
// to /output. The program runs twice and must write identical bytes both
// times, so it does nothing time- or order-dependent here.

import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The folder this file lives in — the repository root.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own caps for this competition (see the kit's reference/gate.json):
// at most 4 screenshots of at most 256 KiB, app/ at most 993 files and
// 48 MiB, no app/ path over 1000 bytes, and the dossier text at most 160 KiB.
// buildDossier enforces them while it writes the dossier.
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

function copyTree(source, target) {
  if (!existsSync(source)) return;
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function handIn() {
  // Start from an empty output directory so a second run writes the same
  // bytes as the first (no stale screenshots or dossier left behind).
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  copyTree(join(repoRoot, 'app'), join(outputDir, 'app'));
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));

  const dossier = buildDossier(outputDir, DOSSIER_OPTIONS);
  const dossierPath = join(outputDir, 'dossier.json');
  writeFileSync(dossierPath, dossier);
  const bytes = statSync(dossierPath).size;
  console.log(`handed in app/ + screenshots/ + dossier.json (${bytes} bytes) to ${outputDir}`);
}

handIn();
