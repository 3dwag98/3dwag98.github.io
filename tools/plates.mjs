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

/* One set, drawn on the dark ground, used by both themes — on the light page
   the plates read as prints rather than as part of the background. */
const PALETTE = { paper: '#0A0B0A', ink: '#EAEFE4', accent: '#C6F24E' };

/* name, width, height, seed */
const PLATES = [
  ['flow',         1100, 1375, 20260819],
  ['backpressure', 1100, 1375, 771],
  ['partition',    1100, 1375, 4242],
  ['storm',        1100, 1375, 9091],
  ['consensus',    1100, 1375, 5150],
  ['decay',        1100, 1375, 8123],
  ['queue',        1100, 1375, 3307],
  ['shard',        1100, 1375, 6612],
  ['cascade',      1100, 1375, 1904],
  ['latency',      1100, 1375, 7756],
  ['mesh',         1100, 1375, 2288],
  ['drift',        1100, 1375, 9431]
];

const browser = await chromium.launch({
  args: ['--no-sandbox'],
  // set CHROME_PATH when the machine already has a Chromium and Playwright
  // has not downloaded its own
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(pathToFileURL(join(HERE, 'plates.html')).href);

for (const [name, w, h, seed] of PLATES) {
  const url = await page.evaluate(([n, w, h, s, p]) => window.render(n, w, h, s, p), [name, w, h, seed, PALETTE]);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(join(OUT, `${name}.jpg`), buf);
  console.log(name.padEnd(14), (buf.length / 1024).toFixed(0) + ' KB');
}

await browser.close();
