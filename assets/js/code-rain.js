/* ============================================================================
   code-rain.js — the field the name comes out of.

   Columns of Devanagari, letters, digits and punctuation falling down the
   screen, which the loader then pulls the name out of: each syllable cycles
   through the Devanagari before locking to its real glyph, so the type reads
   as something the rain resolved into rather than something laid on top of it.

   Devanagari rather than katakana because the name is Devanagari. The falling
   column is what makes it read as code rain, not the particular script, and
   borrowing the alphabet of a film would have made it a costume.

   Columns come in five sizes and are laid out by walking the width, each
   taking the room its own size asks for. Bigger ones are brighter and cover
   more ground per second, so the size difference reads as distance.

   Two things worth knowing:

   1. The trail is not drawn. Each frame paints a translucent sheet of the
      paper colour over everything, and each column draws one glyph when it
      steps to a new row. Everything already on screen dims a little every
      frame, which is the trail — a hundred draws a frame instead of many
      thousands.

   2. Thinning out is done by not restarting columns, never by cutting one
      mid-fall. A trail that vanishes reads as a dropped frame; a column that
      finishes and does not come back reads as rain stopping.

   Exposes window.CGRain.mount(canvas) → { set(density), stop() }.
   ========================================================================= */

(function () {
  'use strict';

  /* Devanagari — consonants, a few vowels, and the digits. This is also the
     set the loader's scramble cycles through, which is what ties the resolve
     to the rain: the characters a syllable passes through on its way to itself
     are characters that were falling a moment earlier. */
  var DEV = ('अआइईउऊएऐओऔकखगघङचछजझटठडढणतथदधनपफबभमयरलवशषसह' +
             '०१२३४५६७८९').split('');

  /* The punctuation a language is actually made of, and the digits and letters
     between them. */
  var CODE = '{}[]()<>/\\|;:=+-*&^%$#@!?_~.,\'"`'.split('');
  var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

  /* Rozha carries the Devanagari, GeistMono the Latin and the punctuation.
     Both are already loaded for the page, so the field costs no extra bytes. */
  var FACE = "'Rozha', 'GeistMono', ui-monospace, monospace";

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

  /* Five sizes rather than a continuous range, because the font has to be set
     on the context once per size per frame and a continuous range would mean
     setting it once per column. Bigger columns are brighter and, since speed
     is counted in rows and their rows are taller, faster — so size reads as
     distance rather than as a glyph that happens to be large. */
  var SIZES = [0.78, 0.90, 1.0, 1.16, 1.38];
  var DEPTH = [0.55, 0.72, 0.86, 1.0, 1.0];     // brightness, by the same index

  window.CGRain = {
    /** Returns a handle, or null when there is no 2D context — the loader
     *  then simply runs without rain rather than failing. */
    mount: function (canvas) {
      if (!canvas || !window.requestAnimationFrame) return null;
      var ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return null;

      var W = 0, H = 0, dpr = 1, cell = 0;
      var cols = [], fonts = [];

      /* Weighted by repetition rather than by a table of probabilities, all of
         it in one flat array so picking is a single random index. */
      var POOL = [].concat(DEV, DEV, ALNUM, CODE, CODE);
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

        cell = Math.max(13, Math.min(18, W / 104));

        fonts.length = 0;
        for (var b = 0; b < SIZES.length; b++) {
          fonts.push('400 ' + (cell * SIZES[b] * 0.86).toFixed(1) + 'px ' + FACE);
        }

        /* Laid out by walking across the screen and giving each column the
           width its own size asks for, rather than dropping varied sizes onto
           a fixed pitch — on a fixed pitch the large ones sit on their
           neighbours and the small ones leave holes. */
        cols.length = 0;
        var x = 0;
        while (x < W) {
          var bi = (Math.random() * SIZES.length) | 0;
          var w = cell * SIZES[bi];
          cols.push({
            b: bi,
            x: x + w / 2,
            h: w,                                  // rows are as tall as they are wide
            n: Math.ceil(H / w) + 2,
            /* Spread down the screen, not stacked above it. Starting every
               column above the top edge means the first second is spent
               waiting for rain to arrive — and a column seeded forty rows up
               never arrives at all inside the life of a loader. */
            y: Math.random() * (H / w),
            v: 11 + Math.random() * 17,            // rows a second
            on: true,
            at: -999
          });
          /* Advanced by slightly less than the column's own width, so the
             field packs tighter than a strict tiling would. Latin and
             punctuation are much narrower than the full-width glyphs this
             started out with, and at a strict tiling that shows up as gaps. */
          x += w * 0.87;
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
        var tau = 0.14 + dens * 1.45;                  // seconds to fade out
        var fade = 1 - Math.exp(-dt / tau);
        ctx.fillStyle = 'rgba(' + paper.join(',') + ',' + fade.toFixed(4) + ')';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        /* Grouped by size, so the font is set five times a frame rather than
           once per column. Setting ctx.font is the expensive call in here;
           everything else is a fill. */
        for (var b = 0; b < SIZES.length; b++) {
          ctx.font = fonts[b];
          var head = 'rgba(' + ink.join(',') + ',' + (headA * DEPTH[b]).toFixed(3) + ')';
          var tail = 'rgba(' + accent.join(',') + ',' + (trailA * DEPTH[b]).toFixed(3) + ')';

          for (var i = 0; i < cols.length; i++) {
            var c = cols[i];
            if (c.b !== b || !c.on) continue;
            c.y += c.v * dt;

            var row = Math.floor(c.y);
            if (row !== c.at && row >= 0) {
              c.at = row;
              var py = row * c.h + c.h * 0.82;

              // the head is nearly white, the glyph behind it is the accent,
              // and everything older is whatever the fade has left of it
              ctx.fillStyle = head;
              ctx.fillText(POOL[(Math.random() * POOL.length) | 0], c.x, py);
              ctx.fillStyle = tail;
              ctx.fillText(POOL[(Math.random() * POOL.length) | 0], c.x, py - c.h);
            }

            if (row > c.n) {
              // off the bottom: restart just above the top, and only if there
              // is still rain to be had
              c.y = -Math.random() * 6;
              c.at = -999;
              c.v = 11 + Math.random() * 17;
              c.on = Math.random() < dens;
            }
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

    /** The Devanagari the loader's scramble cycles through. Only that part of
     *  the rain's alphabet: a syllable of the name resolving through Han and
     *  brackets would be a different idea, and the giant type is also the one
     *  place a missing glyph would be impossible to miss. */
    glyphs: DEV
  };
})();
