// Neon Bay — make.fun gta6-01 entry program (Node 22, standard library only).
//
// The game lives in this directory's game/ folder: plain static files that a
// desktop browser loads offline (game/index.html plus its ES modules and the
// vendored three.js build under game/vendor/ — no network request at all).
// This program hands it in: it copies game/ and screenshots/ from beside
// this file to /output (or $MAKEFUN_OUTPUT_DIR outside the grader) and
// writes /output/dossier.json with the vendored make.fun library.
//
// Run it locally first:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Then play the game with:
//   node serve.ts        (http://localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

const MAX_SCREENSHOT_BYTES = 262144; // 256 KiB per screenshot
const MAX_SCREENSHOTS = 4;
const MIN_SCREENSHOTS = 3;

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

/** Read the screenshot filenames (skipping dotfiles), or fail if absent. */
function listScreenshots() {
  if (!existsSync(shotsDir)) return [];
  return readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
}

/** Sanity checks before handing anything in. */
function validate(shots) {
  if (!existsSync(join(gameDir, 'index.html'))) {
    fail('game/index.html is missing');
  }
  if (!existsSync(join(gameDir, 'vendor', 'three.module.min.js'))) {
    fail('game/vendor/three.module.min.js is missing');
  }
  if (shots.length < MIN_SCREENSHOTS || shots.length > MAX_SCREENSHOTS) {
    fail(`expected ${MIN_SCREENSHOTS} to ${MAX_SCREENSHOTS} screenshots, found ${shots.length}`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > MAX_SCREENSHOT_BYTES) {
      fail(`screenshot ${name} is ${size} bytes, over the 256 KiB cap`);
    }
  }
}

/** Copy the game and screenshots into the output directory. */
function copyInputs() {
  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
}

/** Write the dossier, mirroring the scorer's own caps (reference/gate.json). */
function writeDossier() {
  // Only text_max_bytes shapes the bytes; the other caps refuse an entry
  // the scorer would refuse (too many / too large screenshots, too many
  // game files, too many game bytes, or a game path over 1000 bytes).
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: 163840,
      screenshots: { max: MAX_SCREENSHOTS, max_bytes: MAX_SCREENSHOT_BYTES },
      game_max_files: 993,
      game_max_bytes: 50331648,
      game_path_max_bytes: 1000,
    }),
  );
}

const shots = listScreenshots();
validate(shots);
copyInputs();
writeDossier();

console.log(
  `Neon Bay handed in: ${shots.length} screenshots, dossier written to ${join(out, 'dossier.json')}`,
);
