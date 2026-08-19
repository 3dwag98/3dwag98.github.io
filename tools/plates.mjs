#!/usr/bin/env node
/* ============================================================================
   plates.mjs — re-render assets/plates from tools/plates.html.

     node tools/plates.mjs

   Each plate is drawn to a canvas in headless Chromium and exported as JPEG.
   Change a seed below to reroll a plate without touching the generator.
   Requires playwright and a Chromium build; the site itself never runs this.
   ========================================================================= */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'plates');
mkdirSync(OUT, { recursive: true });

/* name, width, height, seed */
const PLATES = [
  ['flow',         1100, 1375, 20260819],
  ['backpressure', 1100, 1375, 771],
  ['partition',    1100, 1375, 4242],
  ['storm',        1100, 1375, 9091],
  ['consensus',    1100, 1375, 3131],
  ['decay',        1100, 1375, 5150]
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(pathToFileURL(join(HERE, 'plates.html')).href);

for (const [name, w, h, seed] of PLATES) {
  const url = await page.evaluate(([n, w, h, s]) => window.render(n, w, h, s), [name, w, h, seed]);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(join(OUT, `${name}.jpg`), buf);
  console.log(name.padEnd(14), (buf.length / 1024).toFixed(0) + ' KB');
}

await browser.close();
