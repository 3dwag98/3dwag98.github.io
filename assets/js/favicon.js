/* ============================================================================
   favicon.js — the tab mark, animated.

   A pulse leaving the node: the same "one node becomes a system" figure the
   quote and the section hooks use, at 16 pixels.

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

  /** One frame. `p` runs 0 → 1 and wraps; the ring rides it outward. */
  function draw(p) {
    var paper = token('--paper', '#0F1214');
    var accent = token('--accent', '#F2B33D');
    var mid = S / 2;

    cx.clearRect(0, 0, S, S);
    cx.fillStyle = paper;
    cx.fillRect(0, 0, S, S);

    // the pulse on its way out, thinning and fading as it goes
    cx.strokeStyle = accent;
    cx.globalAlpha = 0.75 * (1 - p);
    cx.lineWidth = 6 * (1 - p) + 2;
    cx.beginPath();
    cx.arc(mid, mid, 11 + p * 20, 0, Math.PI * 2);
    cx.stroke();

    // the node itself, always solid
    cx.globalAlpha = 1;
    cx.fillStyle = accent;
    cx.beginPath();
    cx.arc(mid, mid, 11, 0, Math.PI * 2);
    cx.fill();

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
      draw(((now - start) / 1900) % 1);   // one pulse every 1.9s
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
