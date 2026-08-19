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
mkdirSync(join(OUT, 'dark'), { recursive: true });

/* One set per theme. The page swaps src when the theme changes, so only the
   set in use is ever fetched. */
const THEMES = [
  { dir: '',      paper: '#EFEAE1', ink: '#14120F', accent: '#E4441A' },
  { dir: 'dark',  paper: '#14120F', ink: '#EDE7DA', accent: '#FF5A2B' }
];

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

for (const theme of THEMES) {
  for (const [name, w, h, seed] of PLATES) {
    const url = await page.evaluate(
      ([n, w, h, s, p]) => window.render(n, w, h, s, p),
      [name, w, h, seed, { paper: theme.paper, ink: theme.ink, accent: theme.accent }]
    );
    const buf = Buffer.from(url.split(',')[1], 'base64');
    writeFileSync(join(OUT, theme.dir, `${name}.jpg`), buf);
    console.log((theme.dir || 'light').padEnd(6), name.padEnd(14), (buf.length / 1024).toFixed(0) + ' KB');
  }
}

await browser.close();
