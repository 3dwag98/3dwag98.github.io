/* ============================================================================
   favicon.js — the tab mark, animated.

   ASCII: a terminal prompt with a spinner turning next to it.

   Drawn to a canvas and pushed into the existing <link rel="icon"> as a data
   URL, because SVG favicons do not animate in Chromium — a canvas swap is the
   only approach that moves in every browser.

   Costs nothing when it should not run: static under reduced motion, paused
   while the tab is hidden, and it repaints on a theme change so the mark
   follows the page.
   ========================================================================= */

(function () {
  'use strict';

  var link = document.querySelector('link[rel="icon"]');
  if (!link || !window.requestAnimationFrame) return;

  var S = 64;                       // draw large; the browser downscales cleanly
  var cv = document.createElement('canvas');
  cv.width = cv.height = S;

  var cx = cv.getContext && cv.getContext('2d');
  if (!cx) return;                  // no 2d context, keep the inline SVG

  var still = link.getAttribute('href');   // the fallback we were handed
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function token(name, fallback) {
    return (window.CGTheme && window.CGTheme.token(name, fallback)) || fallback;
  }

  /* A terminal prompt: a chevron, and a spinner cycling the four characters
     everyone has watched a build run behind. Two glyphs is all that survives
     being drawn at sixteen pixels. */
  var SPIN = ['-', '\\', '|', '/'];

  /** One frame. `p` runs 0 → 1 and wraps; the spinner steps through it. */
  function draw(p) {
    var paper = token('--paper', '#0A0B0A');
    var accent = token('--accent', '#C6F24E');
    var mute = token('--mute', '#858C80');

    cx.clearRect(0, 0, S, S);
    cx.fillStyle = paper;
    cx.fillRect(0, 0, S, S);

    cx.font = 'bold ' + Math.round(S * 0.52) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    cx.textBaseline = 'middle';

    // the prompt, held
    cx.fillStyle = mute;
    cx.textAlign = 'right';
    cx.fillText('>', S * 0.52, S * 0.54);

    // the spinner, turning
    cx.fillStyle = accent;
    cx.textAlign = 'left';
    cx.fillText(SPIN[Math.floor(p * SPIN.length) % SPIN.length], S * 0.56, S * 0.54);

    try {
      link.href = cv.toDataURL('image/png');
    } catch (e) {
      link.href = still;            // tainted or unsupported — put the mark back
    }
  }

  if (reduced) { draw(0); return; }

  var FPS = 10;                     // a tab icon needs no more than this
  var start = 0;
  var last = 0;
  var timer = 0;

  function tick(now) {
    if (document.hidden) { stop(); return; }
    if (!start) start = now;
    if (now - last >= 1000 / FPS) {
      last = now;
      draw(((now - start) / 900) % 1);    // a full turn every 0.9s
    }
    timer = window.requestAnimationFrame(tick);
  }

  function play() {
    if (timer || document.hidden) return;
    last = 0;
    timer = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (timer) window.cancelAnimationFrame(timer);
    timer = 0;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else play();
  });

  // a theme swap should land on the mark immediately, not on the next frame
  window.addEventListener('cg:theme', function () { if (document.hidden) draw(0); });

  play();
})();
