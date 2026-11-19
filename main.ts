// Neon Bay — the entry program (Node 22, standard library only).
// It hands the game in: it copies this repository's game/ and
// screenshots/ into the output directory and writes the dossier.json the
// judge reads, using the vendored make.fun library. The output directory
// is created if needed and only ever added to — nothing here deletes,
// empties or unlinks it, because on the grader it is a mount that must
// stay intact. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for
// /output:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Create the output directory (and any parents) if it is not there yet.
mkdirSync(out, { recursive: true });
// Copy the whole playable game in, files and folders alike.
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
// Copy the screenshots in beside it, creating their folder first.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Write the dossier exactly as the vendored library builds it, under the
// gate's own caps: at most 4 screenshots of 256 KiB, game/ under 993
// entries and 48 MiB, and the dossier text capped at 160 KiB. The write
// is the last step, so a failed copy above never leaves a stale dossier.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log('Neon Bay handed in: game/, screenshots/ and dossier.json are in ' + out);
