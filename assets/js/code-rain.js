/* ============================================================================
   code-rain.js — the field the name comes out of.

   Columns of Devanagari falling down the screen, which the loader then pulls
   the name out of: each syllable cycles through the same character set before
   locking to its real glyph, so the type reads as something the rain resolved
   into rather than something laid on top of it.

   Devanagari rather than katakana because the name is Devanagari. The form is
   what makes it read as code rain — falling columns, a bright head, a trail
   behind it — not the particular script, and borrowing the alphabet of a film
   would have made it a costume.

   Two things worth knowing:

   1. The trail is not drawn. Each frame paints a translucent sheet of the
      paper colour over everything, and each column draws one glyph when it
      steps to a new row. Everything already on screen dims a little every
      frame, which is the trail — sixty-odd draws a frame instead of well over
      a thousand.

   2. Thinning out is done by not restarting columns, never by cutting one
      mid-fall. A trail that vanishes reads as a dropped frame; a column that
      finishes and does not come back reads as rain stopping.

   Exposes window.CGRain.mount(canvas) → { set(density), stop() }.
   ========================================================================= */

(function () {
  'use strict';

  /* Consonants, a few vowels, and the Devanagari digits — the digits are what
     stop it reading as decorative script and start it reading as code. */
  var GLYPHS = ('अआइईउऊएऐओऔकखगघङचछजझटठडढणतथदधनपफबभमयरलवशषसह' +
                '०१२३४५६७८९').split('');

  function rgb(hex, fallback) {
    var h = (hex || '').trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) h = fallback;
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function token(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  window.CGRain = {
    /** Returns a handle, or null when there is no 2D context — the loader
     *  then simply runs without rain rather than failing. */
    mount: function (canvas) {
      if (!canvas || !window.requestAnimationFrame) return null;
      var ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return null;

      var W = 0, H = 0, dpr = 1, cell = 0, rows = 0;
      var y = [], v = [], on = [], at = [];
      var paper = [10, 11, 10], accent = [198, 242, 78], ink = [244, 246, 242];
      var headA = 0.92, trailA = 0.55;

      function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }

      function palette() {
        paper = rgb(token('--paper', '#0A0B0A'), '0A0B0A');
        accent = rgb(token('--accent', '#C6F24E'), 'C6F24E');
        ink = rgb(token('--ink', '#F4F6F2'), 'F4F6F2');

        /* Lighter on a light ground. The same alpha does not read the same on
           both: light glyphs on dark are points of light and the eye reads the
           field as sparse, while dark glyphs on light are ink on paper and the
           same density reads as a page of noise. Decided by measuring the two
           tokens rather than by looking for a theme attribute, so it follows
           whatever palette is set. */
        var light = lum(paper) > lum(ink);
        headA = light ? 0.62 : 0.92;
        trailA = light ? 0.3 : 0.55;
      }

      function size() {
        var r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = r.width; H = r.height;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        cell = Math.max(17, Math.min(30, W / 62));
        rows = Math.ceil(H / cell) + 2;
        var n = Math.ceil(W / cell);

        y.length = v.length = on.length = at.length = 0;
        for (var i = 0; i < n; i++) {
          /* Spread down the screen, not stacked above it. Starting every
             column above the top edge means the first second is spent waiting
             for rain to arrive — and a column seeded forty rows up never
             arrives at all inside the life of a loader. */
          y[i] = Math.random() * rows;
          v[i] = 11 + Math.random() * 17;         // rows a second
          on[i] = true;
          at[i] = -999;
        }

        ctx.fillStyle = 'rgb(' + paper.join(',') + ')';
        ctx.fillRect(0, 0, W, H);
      }

      palette();
      size();

      var dens = 0;              // 0 → 1, how much rain there should be
      var raf = 0, last = 0, live = true;

      function frame(now) {
        if (!live) return;
        var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
        last = now;

        /* The sheet that makes the trails, as a decay over time rather than a
           fixed alpha per frame. A fixed alpha ties the length of every trail
           to the frame rate: the same code gives long tails on a fast machine
           and stubs on a slow one, which is exactly backwards. Shorter half
           life as the rain thins, so the screen is clear by the time the name
           has to stand on its own. */
        var tau = 0.12 + dens * 0.62;                  // seconds to fade out
        var fade = 1 - Math.exp(-dt / tau);
        ctx.fillStyle = 'rgba(' + paper.join(',') + ',' + fade.toFixed(4) + ')';
        ctx.fillRect(0, 0, W, H);

        ctx.font = "400 " + (cell * 0.86).toFixed(1) + "px 'Rozha', serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        for (var i = 0; i < y.length; i++) {
          if (!on[i]) continue;
          y[i] += v[i] * dt;

          var row = Math.floor(y[i]);
          if (row !== at[i] && row >= 0) {
            at[i] = row;
            var g = GLYPHS[(Math.random() * GLYPHS.length) | 0];
            var px = i * cell + cell / 2;
            var py = row * cell + cell * 0.82;

            // the head is nearly white, and the glyph behind it is the accent;
            // everything older is whatever the fade has left of it
            ctx.fillStyle = 'rgba(' + ink.join(',') + ',' + headA + ')';
            ctx.fillText(g, px, py);
            ctx.fillStyle = 'rgba(' + accent.join(',') + ',' + trailA + ')';
            ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], px, py - cell);
          }

          if (row > rows) {
            // off the bottom: restart just above the top, and only if there is
            // still rain to be had
            y[i] = -Math.random() * 6;
            at[i] = -999;
            v[i] = 11 + Math.random() * 17;
            on[i] = Math.random() < dens;
          }
        }

        raf = window.requestAnimationFrame(frame);
      }
      raf = window.requestAnimationFrame(frame);

      var rt = 0;
      function onResize() { clearTimeout(rt); rt = setTimeout(size, 160); }
      window.addEventListener('resize', onResize);
      window.addEventListener('cg:theme', palette);

      return {
        /** 0 → 1. Columns that reach the bottom restart with this probability,
         *  so the field thickens and thins without any column being cut. */
        set: function (p) { dens = p < 0 ? 0 : p > 1 ? 1 : p; },
        stop: function () {
          live = false;
          if (raf) window.cancelAnimationFrame(raf);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('cg:theme', palette);
        }
      };
    },

    /** The same alphabet, for the loader's scramble — one character set for
     *  the rain and the resolve is what ties them together. */
    glyphs: GLYPHS
  };
})();
