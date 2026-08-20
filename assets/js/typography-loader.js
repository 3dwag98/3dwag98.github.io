/* ============================================================================
   typography-loader.js — चिंतामणी गावडे → CHINTAMANI GAWADE

   Giant Devanagari, each syllable group pulled apart and reformed as Latin in
   turn, so the change travels along the name rather than arriving everywhere
   at once. Not a crossfade: a group is torn to the point of illegibility and
   hands over inside its own distortion.

   Two decisions worth knowing about before reading the code:

   1. The glyphs stay live SVG <text>, not extracted paths. Devanagari needs
      real shaping — चिं puts its i-matra before the consonant and its
      anusvara above — and the browser's shaper is the only thing here that
      gets that right. A build-time path extractor (opentype.js) does not
      shape Devanagari, so baking paths would have produced authentic-looking
      nonsense. The brief allows this: "if paths aren't compatible, combine
      morphing with masks/opacity instead of forcing a bad path morph."

   2. The swap is hidden inside the distortion. Each group is displaced hard
      enough to be illegible at the peak, and that is the frame where the
      Devanagari hands over to the Latin, so the eye reads one continuous
      event rather than two states cross-dissolving.

   The tearing is feTurbulence + feDisplacementMap, one pair per group, whose
   scale GSAP animates. There was a wave layer over this at one point, drawn
   first as a gradient band and then as a WebGL fluid; both read as a scan
   passing over the type, and the sequence says the same thing more clearly
   without anything on top of it.

   Reduced motion never reaches here at all — core.js drops the loader before
   this runs, which gets those visitors to the page faster than any still
   version would.
   ========================================================================= */

(function () {
  'use strict';

  /* Seven groups. The brief's table splits ग and ा into separate units, but a
     lone matra is not a thing that can stand on its own — and the brief's own
     rule is to treat visually connected groups as one unit, so they are joined
     here as गा. That also makes the Latin come out right: the split version
     reads GA + WA + WA + DE = GAWAWADE. */
  /* `w` is a starting width in relative units, and only a starting one — fit()
     replaces it with what the two faces actually measure. It is kept so there
     is something sane on screen if measurement is impossible.

     `s` is the group's size, and it is the one number here that is pure art
     direction. Setting every syllable at the same size is the safe choice and
     a flat one; letting them differ gives the name a rhythm, and it costs
     nothing structurally because the widths are measured after the size is
     applied. The long cluster is set smallest on purpose — MANI is four
     letters against everyone else's two, so at equal size it dominates the
     line it is on. */
  var GROUPS = [
    { dev: 'चिं', lat: 'CH',   w: 2.1, s: 1.15 },
    { dev: 'ता',  lat: 'IN',   w: 1.9, s: 0.90 },
    { dev: 'म',   lat: 'TA',   w: 1.8, s: 1.26 },
    { dev: 'णी',  lat: 'MANI', w: 3.6, s: 0.84 },
    { dev: 'गा',  lat: 'GA',   w: 2.1, s: 1.18 },
    { dev: 'व',   lat: 'WA',   w: 2.4, s: 0.92 },
    { dev: 'डे',  lat: 'DE',   w: 2.0, s: 1.24 }
  ];

  var UNIT = 60;                   // viewBox units per width unit

  /* The viewBox is taller than the type needs, and the baseline sits low in
     it, because the sizes differ: a group set at 1.26 has to have somewhere to
     put its ascenders and its matras without climbing into the row above.
     Every cell keeps the same box and the same baseline, so however much the
     sizes vary the glyphs still sit on one line. */
  var VBH = 174;
  var BASE_Y = 137;

  var DEV_SIZE = 116;              // viewBox units at size 1
  var LAT_SIZE = 88;

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
      svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + VBH);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      cell.style.setProperty('--tl-w', String(g.w));

      var group = document.createElementNS(ns, 'g');
      group.setAttribute('filter', 'url(#tl-liquid-' + i + ')');

      /* Inline, because the class rule would win over a presentation
         attribute. Both scripts of a group carry the same factor, so a group
         is one size whichever script is showing. */
      var dev = document.createElementNS(ns, 'text');
      dev.setAttribute('class', 'tl__dev');
      dev.setAttribute('x', String(vw / 2));
      dev.setAttribute('y', String(BASE_Y));
      dev.setAttribute('text-anchor', 'middle');
      dev.style.fontSize = (DEV_SIZE * g.s).toFixed(1) + 'px';
      dev.textContent = g.dev;

      var lat = document.createElementNS(ns, 'text');
      lat.setAttribute('class', 'tl__lat');
      lat.setAttribute('x', String(vw / 2));
      lat.setAttribute('y', String(BASE_Y));
      lat.setAttribute('text-anchor', 'middle');
      lat.setAttribute('opacity', '0');
      lat.style.fontSize = (LAT_SIZE * g.s).toFixed(1) + 'px';
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
   * The widths in GROUPS are a guess, and a guess is all they can be: they were
   * art-directed against one Latin face, and against a wider one every group
   * overflowed its cell and sat on top of its neighbour. Measuring instead of
   * guessing fixed that, and went on fixing it through the next font swap
   * without a line changing — which is the point.
   *
   * The cell is sized to whichever script needs more room — usually the Latin,
   * though not for every group — so the width never changes mid-morph and the
   * row does not reflow while the groups are turning over.
   *
   * Measuring after the per-group size is applied is what makes the uneven
   * sizes free: a group set larger simply measures wider and gets a wider
   * cell, with no second scale factor to keep in step.
   */
  /* Widths of the whole scramble alphabet, measured once at a reference size.
     Width scales with font size, so one pass over the alphabet serves every
     cell rather than one pass per cell — and it has to be measured at all,
     because a random glyph wider than the cell was sized for pushes straight
     into the neighbouring syllable. */
  var REF = 100;

  function poolWidths(cell, pool) {
    var ns = 'http://www.w3.org/2000/svg';
    var probe = document.createElementNS(ns, 'text');
    probe.setAttribute('class', 'tl__dev');
    probe.setAttribute('x', '0');
    probe.setAttribute('y', '0');
    probe.setAttribute('visibility', 'hidden');
    probe.style.fontSize = REF + 'px';
    cell.svg.appendChild(probe);

    var out = [];
    try {
      for (var i = 0; i < pool.length; i++) {
        probe.textContent = pool[i];
        out.push({ g: pool[i], w: probe.getComputedTextLength() });
      }
    } catch (e) { out = []; }
    cell.svg.removeChild(probe);
    return out;
  }

  function fit(cells) {
    var pool = (window.CGRain && window.CGRain.glyphs) || [];
    var widths = (pool.length && cells[0]) ? poolWidths(cells[0], pool) : [];

    cells.forEach(function (c, i) {
      /* Measure the glyph this cell will settle on, not whatever the scramble
         is showing at this instant — the late re-fit can land mid-resolve, and
         sizing a cell to a character it is only passing through would undo the
         whole point of measuring. */
      var showing = c.dev.textContent;
      var real = GROUPS[i].dev;
      if (showing !== real) c.dev.textContent = real;

      var dw, lw;
      try {
        dw = c.dev.getComputedTextLength();
        lw = c.lat.getComputedTextLength();
      } catch (e) { dw = 0; }                 // not rendered yet; keep the guess
      if (showing !== real) c.dev.textContent = showing;
      if (!dw || !lw) return;

      var vw = Math.round(Math.max(dw, lw) * BEARING);
      c.svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + VBH);
      c.cell.style.setProperty('--tl-w', (vw / UNIT).toFixed(3));
      c.dev.setAttribute('x', String(vw / 2));
      c.lat.setAttribute('x', String(vw / 2));

      /* The characters this cell may cycle through: the ones no wider than
         what it was measured to hold. A cell whose Devanagari is the wider of
         its two scripts has no slack at all, and a fat glyph dropped into it
         sits on the syllable next door. */
      if (widths.length) {
        var room = Math.max(dw, lw) * REF / (DEV_SIZE * GROUPS[i].s);
        var ok = widths.filter(function (x) { return x.w <= room; });
        if (ok.length < 8) {                    // nothing fits: take the slimmest
          ok = widths.slice().sort(function (a, b) { return a.w - b.w; }).slice(0, 8);
        }
        c.pool = ok.map(function (x) { return x.g; });
      }
    });
  }

  /** Runs `fn` once the two faces this needs are in — measuring before that
   *  would size every cell to the fallback face.
   *
   *  Two faces, not `fonts.ready`: ready waits on everything the document
   *  asks for, which on a slow machine is seconds after the only two that
   *  matter here have arrived. And the text has to be passed, because the
   *  Devanagari face is declared with a unicode-range — `load()` probes with
   *  a Latin string by default, decides the face is not needed for it, and
   *  resolves without ever fetching the file.
   *
   *  The ceiling matters more than the promise: a font that never arrives
   *  must not strand the loader. */
  function whenFonts(fn) {
    var done = false;
    function go() { if (done) return; done = true; fn(); }

    var f = document.fonts;
    if (!f || !f.load) { window.setTimeout(go, 60); return; }

    var dev = GROUPS.map(function (g) { return g.dev; }).join('');
    var lat = GROUPS.map(function (g) { return g.lat; }).join('');

    try {
      Promise.all([
        f.load('400 116px Rozha', dev),
        f.load('800 88px Fraunces', lat),
        // the rain draws its Latin and its punctuation in this one, and a
        // canvas does not honour font-display either
        f.load('400 20px GeistMono', '01AB{}')
      ]).then(go, go);
    } catch (e) { go(); }

    window.setTimeout(go, 1200);
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
      var sheet = root.querySelector('[data-tl-sheet]');
      var pct = root.querySelector('[data-tl-pct]');

      var count = { v: 0 };

      /* Held until the cells have been measured, so the first frame the
         visitor sees is already correctly spaced rather than snapping into
         place a moment later. */
      var tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });

      /* The rain is mounted with the timeline rather than on load, because a
         canvas does not honour font-display: it draws whatever is available
         the instant it is asked, and asking before Rozha is in gets a screen
         of fallback glyphs. */
      var rainEl = root.querySelector('[data-tl-rain]');
      var rain = null;
      whenFonts(function () {
        fit(cells);
        if (window.CGRain && rainEl) rain = window.CGRain.mount(rainEl);
        if (!rain && rainEl) rainEl.style.display = 'none';
        tl.play();
      });

      /* If the ceiling won that race the cells were measured against the
         fallback face, which is the whole bug this is here to prevent. Fitting
         again the moment the real fonts arrive costs one reflow in a case that
         should be rare, and is much better than leaving the glyphs overlapping. */
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(function () { fit(cells); }, function () {});
      }

      /* Phase 1 — the field fills with rain, and the name resolves out of it.

         Each syllable cycles through the Devanagari the rain is also falling
         in before locking to its real glyph. Sharing the characters is the
         whole trick: the type does not arrive over the rain, it settles out
         of it.
         A small rise underneath, in percent of a cell that is now most of the
         screen — 18 was tuned against a much shorter cell and became a drop of
         fifty pixels, enough to put the second row over the footer. */
      var POOL = (window.CGRain && window.CGRain.glyphs) || ['0', '1'];
      var SCRAMBLE = 0.38;             // how long a syllable stays undecided
      var LOCK_STEP = 0.105;           // between one syllable locking and the next

      gsap.set(cells.map(function (c) { return c.cell; }), { opacity: 0, yPercent: 7 });

      if (rainEl) {
        var field = { d: 0 };
        gsap.set(rainEl, { opacity: 0 });
        tl.to(rainEl, { opacity: 1, duration: 0.28 }, 0)
          .to(field, {
            d: 1, duration: 0.5, ease: 'power2.out',
            onUpdate: function () { if (rain) rain.set(field.d); }
          }, 0)
          // it thins from the moment the last syllable is certain of itself
          .to(field, {
            d: 0, duration: 0.75, ease: 'power2.in',
            onUpdate: function () { if (rain) rain.set(field.d); }
          }, 1.05)
          .to(rainEl, { opacity: 0, duration: 0.5 }, 1.35);
      }

      cells.forEach(function (c, i) {
        var from = 0.3 + i * LOCK_STEP;
        var flick = { t: 0 };

        tl.to(c.cell, { opacity: 1, yPercent: 0, duration: 0.3, ease: 'power2.out' }, from);

        /* Throttled: a new glyph every frame is a blur, and it also means
           seven text nodes rewritten sixty times a second for no gain. */
        tl.to(flick, {
          t: SCRAMBLE, duration: SCRAMBLE, ease: 'none',
          onUpdate: function () {
            var step = Math.floor(flick.t / 0.055);
            if (step === c.step) return;
            c.step = step;
            var pool = c.pool || POOL;
            c.dev.textContent = pool[(Math.random() * pool.length) | 0];
          }
        }, from);

        // and it settles on the one it was always going to be
        tl.call(function () { c.dev.textContent = GROUPS[i].dev; }, null, from + SCRAMBLE);
      });

      // the counter runs underneath the whole thing
      tl.to(count, {
        v: 100, duration: 2.35, ease: 'power1.inOut',
        onUpdate: function () { if (pct) pct.textContent = String(Math.round(count.v)).padStart(3, '0'); }
      }, 0);

      /* Phase 2 — each group in turn: distort, swap, settle. The offsets are
         what make it read as a change travelling along the name. It starts as
         the last syllable locks, so the two runs overlap by a hair rather than
         queueing, which is most of what keeps the whole entry under five
         seconds. */
      var MORPH = 0.3 + (cells.length - 1) * LOCK_STEP + SCRAMBLE + 0.08;
      cells.forEach(function (c, i) {
        var at = MORPH + i * 0.16;                 // when this group's turn comes
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

        // the glyph is pulled apart, hard enough to stop being legible
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

      /* Phase 3 — the groups close up into one word and swell past
         comfortable. Until now they have been spaced as separate syllables;
         CHINTAMANI GAWADE only reads as a name once the gaps go. */
      var last = MORPH + (cells.length - 1) * 0.16 + 0.5;
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
       *  two scripts, which is the one left on screen when it finishes.
       *
       *  getBBox rather than getComputedTextLength, because the two are not
       *  the same number: the Latin is set with negative tracking, so its
       *  advance width is narrower than the box it paints into, and closing
       *  the gap by advance width alone left the glyphs touching. */
      function ink(c) {
        var box = c.cell.getBoundingClientRect();
        var vb = parseFloat((c.svg.getAttribute('viewBox') || '').split(' ')[2]) || 1;
        var scale = Math.min(box.width / vb, c.svg.getBoundingClientRect().height / VBH);
        var mid = box.left + box.width / 2;
        var half;
        try {
          var b = c.lat.getBBox();
          half = Math.max(b.width, c.dev.getBBox().width) * scale / 2;
        } catch (e) { half = box.width / 2; }
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
         it out from what is left over instead lets the name start as large as
         the viewport allows and still finish filling it.

         Both axes: the swell scales the stage, so it grows the stack of rows
         as well as each row, and the footer is what it runs into first on a
         wide short window. */
      function swell() {
        var t = Math.abs(tighten());
        var widest = 0;
        rows().forEach(function (r) {
          var a = r[0].cell.getBoundingClientRect();
          var z = r[r.length - 1].cell.getBoundingClientRect();
          widest = Math.max(widest, (z.right - a.left) - 2 * t * r.length);
        });

        var box = stage.getBoundingClientRect();
        var foot = root.querySelector('.loader__foot');
        var floor = foot ? foot.getBoundingClientRect().top : window.innerHeight;
        /* The stage grows about its own centre, so the room below is what
           separates its centre from the footer. */
        var room = box.height ? ((floor - 16) - (box.top + box.height / 2)) * 2 / box.height : 1.24;

        var byWidth = widest ? (window.innerWidth * 0.96) / widest : 1.24;
        return Math.max(1, Math.min(1.24, byWidth, room));
      }

      tl.to(cells.map(function (c) { return c.cell; }), {
        marginLeft: tighten, marginRight: tighten,
        duration: 0.55, ease: 'power3.inOut'
      }, last)
        .to(stage, { scale: swell, duration: 0.55, ease: 'power3.inOut' }, last);

      /* Phase 4 — hold the finished name, then a sheet of accent rises and
         carries the whole loader off. */
      if (sheet) {
        gsap.set(sheet, { scaleY: 0, transformOrigin: '50% 100%' });
        tl.to(sheet, { scaleY: 1, duration: 0.5, ease: 'power3.inOut' }, last + 0.72)
          .to(root, { yPercent: -100, duration: 0.7, ease: 'expo.inOut' }, last + 1.12);
      } else {
        tl.to(root, { yPercent: -100, duration: 0.7, ease: 'expo.inOut' }, last + 1.1);
      }

      /* Cleanup goes in the timeline, not on onComplete: core.js replaces that
         callback with its own handover, and a renderer left running after the
         loader is gone is a rAF that never stops. */
      tl.call(function () { if (rain) rain.stop(); }, null, last + 1.9);

      return tl;
    }
  };
})();
