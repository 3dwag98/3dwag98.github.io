/* ============================================================================
   typography-loader.js — चिंतामणी गावडे → CHINTAMANI GAWADE

   Giant Devanagari, a liquid wave that sweeps across it, and each syllable
   group pulled apart and reformed as Latin as the wave passes over it. Not a
   crossfade: a group only changes while the liquid is actually on it.

   Two decisions worth knowing about before reading the code:

   1. The glyphs stay live SVG <text>, not extracted paths. Devanagari needs
      real shaping — चिं puts its i-matra before the consonant and its
      anusvara above — and the browser's shaper is the only thing here that
      gets that right. A build-time path extractor (opentype.js) does not
      shape Devanagari, so baking paths would have produced authentic-looking
      nonsense. The brief allows this: "if paths aren't compatible, combine
      morphing with masks/opacity instead of forcing a bad path morph."

   2. The swap is hidden inside the distortion. Each group is displaced hard
      enough to be illegible at the wave's peak, and that is the frame where
      Devanagari hands over to Latin, so the eye reads one continuous liquid
      event rather than two states cross-dissolving.

   The wave itself is WebGL (liquid-wave.js); the per-glyph tearing stays on
   feTurbulence + feDisplacementMap, whose scale GSAP animates per group. Reduced motion never reaches here at all — core.js drops the loader
   before this runs, which gets those visitors to the page faster than any
   still version would.
   ========================================================================= */

(function () {
  'use strict';

  /* Seven groups. The brief's table splits ग and ा into separate units, but a
     lone matra is not a thing that can stand on its own — and the brief's own
     rule is to treat visually connected groups as one unit, so they are joined
     here as गा. That also makes the Latin come out right: the split version
     reads GA + WA + WA + DE = GAWAWADE. */
  /* `w` is the cell's width in relative units, wide enough for whichever of
     the two scripts needs more room. It is here rather than measured so the
     spacing stays art-directable — nudge a number, not a layout algorithm. */
  var GROUPS = [
    { dev: 'चिं', lat: 'CH',   w: 2.1 },
    { dev: 'ता',  lat: 'IN',   w: 1.9 },
    { dev: 'म',   lat: 'TA',   w: 1.8 },
    { dev: 'णी',  lat: 'MANI', w: 3.6 },
    { dev: 'गा',  lat: 'GA',   w: 2.1 },
    { dev: 'व',   lat: 'WA',   w: 2.4 },
    { dev: 'डे',  lat: 'DE',   w: 2.0 }
  ];

  var UNIT = 60;                   // viewBox units per width unit

  var WORD_BREAK = 4;              // groups 0..3 are the first word

  function build(root) {
    var stage = root.querySelector('[data-tl-stage]');
    if (!stage) return null;

    var ns = 'http://www.w3.org/2000/svg';
    var made = [];

    GROUPS.forEach(function (g, i) {
      // the second word starts a new line: a zero-height spacer of its own,
      // never a modifier on a real group, which would collapse that syllable
      if (i === WORD_BREAK) {
        var br = document.createElement('span');
        br.className = 'tl__break';
        stage.appendChild(br);
      }

      var cell = document.createElement('span');
      cell.className = 'tl__cell';

      var svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'tl__svg');
      svg.setAttribute('aria-hidden', 'true');
      /* A viewBox is what makes the type actually scale with the viewport —
         without it the text renders at its literal pixel size no matter how
         large the element gets. These are starting values; fit() replaces them
         with what the two scripts actually measure once the fonts are in. */
      var vw = Math.round(g.w * UNIT);
      svg.setAttribute('viewBox', '0 0 ' + vw + ' 150');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      cell.style.setProperty('--tl-w', String(g.w));

      var group = document.createElementNS(ns, 'g');
      group.setAttribute('filter', 'url(#tl-liquid-' + i + ')');

      var dev = document.createElementNS(ns, 'text');
      dev.setAttribute('class', 'tl__dev');
      dev.setAttribute('x', String(vw / 2));
      dev.setAttribute('y', '112');
      dev.setAttribute('text-anchor', 'middle');
      dev.textContent = g.dev;

      var lat = document.createElementNS(ns, 'text');
      lat.setAttribute('class', 'tl__lat');
      lat.setAttribute('x', String(vw / 2));
      lat.setAttribute('y', '112');
      lat.setAttribute('text-anchor', 'middle');
      lat.setAttribute('opacity', '0');
      lat.textContent = g.lat;

      group.appendChild(dev);
      group.appendChild(lat);
      svg.appendChild(group);
      cell.appendChild(svg);
      stage.appendChild(cell);

      made.push({ cell: cell, svg: svg, wrap: group, dev: dev, lat: lat, i: i });
    });

    return made;
  }

  /* How much room to leave around a group, as a fraction of its own width.
     Enough that neighbours never touch, not so much that the name falls
     apart into loose syllables. */
  var BEARING = 1.07;

  /**
   * Sizes every cell from what its two scripts actually measure.
   *
   * The widths in GROUPS are a starting guess, and a guess is all they can be:
   * they were art-directed against a different Latin face, and Dela Gothic is
   * a good deal wider, so every group overflowed its cell and sat on top of
   * its neighbour. Measuring instead of guessing fixes that, and keeps fixing
   * it if either font is ever swapped again.
   *
   * The cell is sized to whichever script needs more room — always the Latin
   * here — so the width never changes mid-morph and the row does not reflow
   * under the wave. Keeping the viewBox and the cell in step also keeps the
   * scale identical across all seven, which is what stops one syllable
   * rendering fractionally larger than the rest.
   */
  function fit(cells) {
    cells.forEach(function (c) {
      var dw, lw;
      try {
        dw = c.dev.getComputedTextLength();
        lw = c.lat.getComputedTextLength();
      } catch (e) { return; }                 // not rendered yet; keep the guess
      if (!dw || !lw) return;

      var vw = Math.round(Math.max(dw, lw) * BEARING);
      c.svg.setAttribute('viewBox', '0 0 ' + vw + ' 150');
      c.cell.style.setProperty('--tl-w', (vw / UNIT).toFixed(3));
      c.dev.setAttribute('x', String(vw / 2));
      c.lat.setAttribute('x', String(vw / 2));
    });
  }

  /** Runs `fn` once the webfonts are in — measuring before that would size
   *  every cell to the fallback face. The ceiling matters more than the
   *  promise: a font that never arrives must not strand the loader. */
  function whenFonts(fn) {
    var done = false;
    function go() { if (done) return; done = true; fn(); }

    if (document.fonts && document.fonts.status === 'loaded') { go(); return; }
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(go, go);
      window.setTimeout(go, 1200);
    } else {
      window.setTimeout(go, 60);
    }
  }

  /** One turbulence + displacement pair per group, so each can be driven alone. */
  function filters(root) {
    var defs = root.querySelector('[data-tl-defs]');
    if (!defs) return [];
    var ns = 'http://www.w3.org/2000/svg';
    var out = [];

    GROUPS.forEach(function (g, i) {
      var f = document.createElementNS(ns, 'filter');
      f.setAttribute('id', 'tl-liquid-' + i);
      f.setAttribute('x', '-60%'); f.setAttribute('y', '-60%');
      f.setAttribute('width', '220%'); f.setAttribute('height', '220%');
      f.setAttribute('color-interpolation-filters', 'sRGB');

      var turb = document.createElementNS(ns, 'feTurbulence');
      turb.setAttribute('type', 'fractalNoise');
      turb.setAttribute('baseFrequency', '0.006 0.013');
      turb.setAttribute('numOctaves', '2');
      turb.setAttribute('seed', String(11 + i * 7));
      turb.setAttribute('result', 'noise');

      var disp = document.createElementNS(ns, 'feDisplacementMap');
      disp.setAttribute('in', 'SourceGraphic');
      disp.setAttribute('in2', 'noise');
      disp.setAttribute('scale', '0');
      disp.setAttribute('xChannelSelector', 'R');
      disp.setAttribute('yChannelSelector', 'G');

      f.appendChild(turb);
      f.appendChild(disp);
      defs.appendChild(f);
      out.push({ turb: turb, disp: disp });
    });

    return out;
  }

  /* ── the timeline ───────────────────────────────────────────────────── */

  window.CGTypeLoader = {
    /**
     * Builds the sequence and returns a GSAP timeline, or null when it cannot
     * run — the caller falls back to simply removing the loader.
     */
    create: function (root) {
      var gsap = window.gsap;
      if (!gsap || !root) return null;

      var cells = build(root);
      if (!cells || !cells.length) return null;

      var fx = filters(root);
      var wave = root.querySelector('[data-tl-wave]');
      var sheet = root.querySelector('[data-tl-sheet]');
      var pct = root.querySelector('[data-tl-pct]');

      var count = { v: 0 };

      /* Held until the cells have been measured, so the first frame the
         visitor sees is already correctly spaced rather than snapping into
         place a moment later. */
      var tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
      whenFonts(function () { fit(cells); tl.play(); });

      /* If the ceiling won that race the cells were measured against the
         fallback face, which is the whole bug this is here to prevent. Fitting
         again the moment the real fonts arrive costs one reflow in a case that
         should be rare, and is much better than leaving the glyphs overlapping. */
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(function () { fit(cells); });
      }

      /* Phase 1 — the Devanagari arrives and breathes. */
      gsap.set(cells.map(function (c) { return c.cell; }), { opacity: 0, yPercent: 18 });
      tl.to(cells.map(function (c) { return c.cell; }), {
        opacity: 1, yPercent: 0, duration: 0.5, ease: 'expo.out', stagger: 0.045
      }, 0);

      // the counter runs underneath the whole thing
      tl.to(count, {
        v: 100, duration: 2.35, ease: 'power1.inOut',
        onUpdate: function () { if (pct) pct.textContent = String(Math.round(count.v)).padStart(3, '0'); }
      }, 0);

      /* Phase 2 — the wave crosses. It is a WebGL layer rather than a sliding
         gradient: a gradient is a rectangle however it is dressed, which is
         what made the old one read as a scan. Here the front is warped by the
         same noise that moves the body, so it arrives as a ragged tongue. The
         timeline drives one number and the shader derives the rest. */
      var liquid = (window.CGWave && wave) ? window.CGWave.mount(wave) : null;

      if (liquid) {
        var head = { p: 0 };
        gsap.set(wave, { opacity: 0 });
        tl.to(wave, { opacity: 1, duration: 0.24 }, 0.4)
          .to(head, {
            p: 1, duration: 1.62, ease: 'power1.inOut',
            onUpdate: function () { liquid.set(head.p); }
          }, 0.46)
          .to(wave, { opacity: 0, duration: 0.3 }, 2.05);
      } else if (wave) {
        wave.style.display = 'none';       // no WebGL: the morphs still run
      }

      /* Phase 3 — the wave passes over each group in turn, and only while it
         is on a group does that group distort, swap and settle. */
      cells.forEach(function (c, i) {
        var at = 0.58 + i * 0.19;                  // when the wave arrives here
        var f = fx[i];
        var strength = { v: 0 };

        if (f) {
          // 0 → 100% → 20% → 0, the profile the brief asks for
          tl.to(strength, {
            v: 68, duration: 0.16, ease: 'power2.in',
            onUpdate: function () { f.disp.setAttribute('scale', strength.v.toFixed(1)); }
          }, at)
            .to(strength, {
              v: 14, duration: 0.22, ease: 'power2.out',
              onUpdate: function () { f.disp.setAttribute('scale', strength.v.toFixed(1)); }
            }, at + 0.16)
            .to(strength, {
              v: 0, duration: 0.2, ease: 'power2.out',
              onUpdate: function () { f.disp.setAttribute('scale', strength.v.toFixed(1)); }
            }, at + 0.38);

          // the noise itself crawls while it is displacing
          var freq = { x: 0.006, y: 0.013 };
          tl.to(freq, {
            x: 0.016, y: 0.03, duration: 0.38,
            onUpdate: function () {
              f.turb.setAttribute('baseFrequency', freq.x.toFixed(4) + ' ' + freq.y.toFixed(4));
            }
          }, at);
        }

        // the glyph is pulled about while the liquid is on it
        tl.to(c.wrap, {
          scaleX: 1.5, scaleY: 0.7, rotate: i % 2 ? 2.4 : -2.4,
          duration: 0.16, ease: 'power2.in', transformOrigin: '50% 60%'
        }, at)
          .to(c.wrap, {
            scaleX: 1, scaleY: 1, rotate: 0,
            duration: 0.44, ease: 'elastic.out(1, 0.55)'
          }, at + 0.16);

        // and the swap happens buried in the peak, where nothing is legible
        tl.to(c.dev, { opacity: 0, duration: 0.09 }, at + 0.13)
          .to(c.lat, { opacity: 1, duration: 0.09 }, at + 0.15);

        // a small overshoot as it stabilises
        tl.fromTo(c.cell, { y: 0 }, {
          y: -10, duration: 0.14, ease: 'power2.out'
        }, at + 0.16)
          .to(c.cell, { y: 0, duration: 0.4, ease: 'elastic.out(1, 0.6)' }, at + 0.3);
      });

      /* Phase 4 — the groups close up into one word and swell past
         comfortable. Until now they have been spaced as separate syllables;
         CHINTAMANI GAWADE only reads as a name once the gaps go. */
      var last = 0.58 + (cells.length - 1) * 0.19 + 0.5;
      var stage = root.querySelector('[data-tl-stage]');

      /* Pulling the cells together with a negative margin rather than tweening
         the gap: the gap's computed value is a clamp() token stream, which
         there is no sensible start value to interpolate from.

         How far to pull has to come from the cells themselves. Once they are
         measured, all the room between two glyphs is the side bearing on each
         plus the flex gap — a few percent, not a fixed slice of the viewport.
         Taking a share of that closes the syllables into a word; taking a
         flat fraction of the window instead is what put letters on top of
         each other. Function-based so it is read after fit() has run. */

      /** Where a cell's Latin actually paints. The Latin, not whatever is
       *  showing right now: the close-up has to be safe for the widest of the
       *  two scripts, which is the one left on screen when it finishes. */
      function ink(c) {
        var box = c.cell.getBoundingClientRect();
        var vb = parseFloat((c.svg.getAttribute('viewBox') || '').split(' ')[2]) || 1;
        var scale = Math.min(box.width / vb, c.svg.getBoundingClientRect().height / 150);
        var half = 0;
        try { half = c.lat.getComputedTextLength() * scale / 2; } catch (e) { half = box.width / 2; }
        var mid = box.left + box.width / 2;
        return { left: mid - half, right: mid + half };
      }

      /* Close most of the real space between neighbours, and leave the rest.
         A share of what is measurably there behaves at every width; a flat
         slice of the viewport does not — it is far more than the gap on a
         phone and rather less than it on a wide screen. */
      function tighten() {
        var min = Infinity;
        rows().forEach(function (r) {
          for (var i = 1; i < r.length; i++) {
            min = Math.min(min, ink(r[i]).left - ink(r[i - 1]).right);
          }
        });
        if (!isFinite(min) || min <= 0) return 0;
        return -Math.round(min * 0.7 / 2);        // half taken off each side
      }

      /** The cells as laid out, grouped into rows. A row break is wherever a
       *  cell starts at or left of the one before it. */
      function rows() {
        var out = [[cells[0]]];
        for (var i = 1; i < cells.length; i++) {
          var l = cells[i].cell.getBoundingClientRect().left;
          var prev = cells[i - 1].cell.getBoundingClientRect().left;
          if (l <= prev + 1) out.push([cells[i]]); else out[out.length - 1].push(cells[i]);
        }
        return out;
      }

      /* How far the name can swell before it runs out of screen. A fixed 1.24
         forced the type to start small enough that the end state still fit,
         which on a phone left it looking timid the whole way through. Working
         it out from the widest row instead lets the name start as large as the
         viewport allows and still finish filling it. */
      function swell() {
        var t = Math.abs(tighten());
        var widest = 0;
        rows().forEach(function (r) {
          var a = r[0].cell.getBoundingClientRect();
          var z = r[r.length - 1].cell.getBoundingClientRect();
          widest = Math.max(widest, (z.right - a.left) - 2 * t * r.length);
        });
        if (!widest) return 1.24;
        return Math.min(1.24, (window.innerWidth * 0.96) / widest);
      }

      tl.to(cells.map(function (c) { return c.cell; }), {
        marginLeft: tighten, marginRight: tighten,
        duration: 0.55, ease: 'power3.inOut'
      }, last)
        .to(stage, { scale: swell, duration: 0.55, ease: 'power3.inOut' }, last);

      /* Phase 5 — hold the finished name, then the liquid takes the screen
         and is itself the reveal. */
      if (sheet) {
        gsap.set(sheet, { scaleY: 0, transformOrigin: '50% 100%' });
        tl.to(sheet, { scaleY: 1, duration: 0.5, ease: 'power3.inOut' }, last + 1.05)
          .to(root, { yPercent: -100, duration: 0.7, ease: 'expo.inOut' }, last + 1.45);
      } else {
        tl.to(root, { yPercent: -100, duration: 0.7, ease: 'expo.inOut' }, last + 1.1);
      }

      /* Cleanup goes in the timeline, not on onComplete: core.js replaces that
         callback with its own handover, and a renderer left running after the
         loader is gone is a rAF that never stops. */
      tl.call(function () { if (liquid) liquid.stop(); }, null, last + 2.3);

      return tl;
    }
  };
})();
