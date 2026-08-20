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

  /* Seven groups. `ams` is the run of AMS keystrokes that draws the syllable —
     ि is typed before its consonant because legacy fonts take visual order,
     and `a` is the stem that completes a consonant, so ता is `taa`. Those
     keystrokes never reach the document: build() turns them into path data.

     `lat` is the syllable, not an arbitrary slice of the name. It used to read
     CH · IN · TA · MANI, which does not line up with the Devanagari at all;
     each group now morphs into the Latin that actually says it.

     `w` is a starting width in relative units, and only a starting one — fit()
     replaces it with what the two faces measure.

     `s` is the group's size, and it is the one number here that is pure art
     direction. Setting every syllable at the same size is the safe choice and
     a flat one; letting them differ gives the name a rhythm, and it costs
     nothing structurally because the widths are measured after the size is
     applied. The four-letter cluster is set smallest, whichever one it is:
     at equal size it dominates the line it shares. That used to be MANI and
     is now CHIN, so the sizes moved with the split rather than staying put. */
  var GROUPS = [
    { dev: 'चिं', ams: 'ica/', lat: 'CHIN', w: 2.1, s: 0.84 },
    { dev: 'ता',  ams: 'taa',  lat: 'TA',   w: 1.9, s: 1.18 },
    { dev: 'म',   ams: 'ma',   lat: 'MA',   w: 1.8, s: 0.92 },
    { dev: 'णी',  ams: 'NaI',  lat: 'NI',   w: 3.6, s: 1.26 },
    { dev: 'गा',  ams: 'gaa',  lat: 'GA',   w: 2.1, s: 1.15 },
    { dev: 'व',   ams: 'va',   lat: 'WA',   w: 2.4, s: 0.90 },
    { dev: 'डे',  ams: 'De',   lat: 'DE',   w: 2.0, s: 1.24 }
  ];

  /* The alphabet the scramble cycles through, as AMS runs. Every consonant
     carries its stem, so each one is a letter rather than a half form. */
  var POOL_AMS = ('ka Ka ga Ga ca Ca ja Ja Ta Da Za Na da na fa ba Ba ma ya ' +
                  'ra la va Sa sa ha Pa Qa Oa 0 1 2 3 4 5 6 7 8 9').split(' ');

  var UNIT = 60;                   // viewBox units per width unit

  /* Measured from the outlines rather than guessed. Across the seven runs the
     ink spans -398 to 1190 font units — 1.19 em above the baseline for the
     tall चिं and णी, 0.4 em below for ता's descender — so at the largest size
     factor the box has to hold 1.5 em above and 0.5 em below.

     DEV_SIZE is set against LAT_SIZE by body height rather than em: these
     glyphs run about 0.77 em from headline to baseline where Playfair's caps
     are about 0.70, so matching ems would have set the Devanagari far too
     large. The previous pair was tuned for Rozha, whose proportions are not
     these. */
  var VBH = 172;
  var BASE_Y = 126;

  var DEV_SIZE = 80;               // viewBox units at size 1
  var LAT_SIZE = 88;

  var WORD_BREAK = 4;              // groups 0..3 are the first word

  /* Shift every x in a path built only from M / L / Q / Z. The generator emits
     nothing else, so a full path parser would be dead weight. */
  function shift(d, dx) {
    return d.replace(/([MLQ])([^MLQZ]*)/g, function (_, cmd, args) {
      var n = args.trim().split(/[\s,]+/);
      for (var i = 0; i < n.length; i += 2) n[i] = +n[i] + dx;
      return cmd + n.join(' ');
    });
  }

  /**
   * An AMS run -> one path and its advance width, both in font units.
   *
   * Laying the glyphs out by advance alone is exact here: the font carries no
   * kern table and no GPOS, which the generator checks and refuses to run
   * without. Verified against the browser setting the same text in the real
   * font — the two agree to 0.03px at 110px type, which is the rounding to
   * whole font units and nothing else.
   */
  function ams(run) {
    var G = window.CGAms && window.CGAms.g;
    if (!G) return null;
    var x = 0, out = [], x0 = Infinity, x1 = -Infinity;
    for (var i = 0; i < run.length; i++) {
      var g = G[run.charAt(i)];
      if (!g) continue;
      if (g.d) {
        out.push(x ? shift(g.d, x) : g.d);
        x0 = Math.min(x0, g.b[0] + x);
        x1 = Math.max(x1, g.b[1] + x);
      }
      x += g.a;                       // matras have an advance of ~0 and overlay
    }
    if (x0 > x1) { x0 = 0; x1 = x; }
    /* `w` is the ink, not the advance. These glyphs overhang: चिं advances
       1060 units and paints 1264, and a cell sized to the advance hands the
       difference to its neighbour. `mid` is where the ink is centred, which
       is not the middle of the advance box either. */
    return { d: out.join(''), w: x1 - x0, adv: x, mid: (x0 + x1) / 2 };
  }

  /** Where a run sits in a cell: centred on `cx`, sitting on the baseline, at
   *  the group's own size. The negative y scale is the flip from font
   *  coordinates, which count upwards, to SVG, which counts down. */
  function place(cx, size, run) {
    var k = size / (window.CGAms ? window.CGAms.em : 1000);
    return 'translate(' + cx.toFixed(2) + ' ' + BASE_Y + ') scale(' +
           k.toFixed(5) + ' ' + (-k).toFixed(5) + ') translate(' + (-run.mid).toFixed(1) + ' 0)';
  }

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

      /* The Devanagari is a path, not text. Its face is a legacy non-Unicode
         one that carries the shapes on ASCII codepoints, so setting it as text
         would mean putting `ica/taamaNaI` in the document and showing exactly
         that at display size whenever the font failed to arrive. The outlines
         are baked out of the font instead (tools/ams-to-paths.py), which keeps
         the letterforms and leaves the markup alone — the stage still carries
         the real name in its aria-label. */
      var run = ams(g.ams);
      var dev = document.createElementNS(ns, 'path');
      dev.setAttribute('class', 'tl__dev');
      if (run) {
        dev.setAttribute('d', run.d);
        dev.setAttribute('transform', place(vw / 2, DEV_SIZE * g.s, run));
      }

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

      made.push({ cell: cell, svg: svg, wrap: group, dev: dev, lat: lat, i: i,
                  run: run, size: DEV_SIZE * g.s });
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
  /**
   * Sizes every cell from what its two scripts actually take up.
   *
   * The Devanagari no longer needs measuring: its width is the sum of the
   * advances in its run, which is known before anything renders. Only the
   * Latin has to be measured, and only once its face has arrived.
   *
   * The widths in GROUPS are a guess, and a guess is all they can be — they
   * were art-directed against one Latin face, and against a wider one every
   * group overflowed its cell and sat on top of its neighbour.
   */
  function fit(cells) {
    var em = (window.CGAms && window.CGAms.em) || 1000;

    /* The scramble alphabet, measured once. A cell may only cycle through the
       runs that fit the room it was sized for: a group whose Devanagari is the
       wider of its two scripts has no slack at all, and a fat glyph dropped
       into it sits on the syllable next door. */
    var alphabet = [];
    if (window.CGAms) {
      POOL_AMS.forEach(function (run) {
        var a = ams(run);
        if (a && a.d) alphabet.push(a);
      });
    }

    cells.forEach(function (c, i) {
      /* getBBox, not getComputedTextLength: the latter is the advance, and the
         Latin is set with negative tracking so it paints wider than it
         advances. Sizing the cell to the advance left the glyphs touching
         after the close-up. */
      var lw;
      try { lw = c.lat.getBBox().width || c.lat.getComputedTextLength(); }
      catch (e) { return; }
      if (!lw) return;

      var k = c.size / em;                     // font units -> viewBox units
      var dw = c.run ? c.run.w * k : 0;
      var room = Math.max(dw, lw);

      var vw = Math.round(room * BEARING);
      c.svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + VBH);
      c.cell.style.setProperty('--tl-w', (vw / UNIT).toFixed(3));
      c.lat.setAttribute('x', String(vw / 2));
      if (c.run) c.dev.setAttribute('transform', place(vw / 2, c.size, c.run));

      c.cx = vw / 2;
      c.room = room;
      c.pool = alphabet.filter(function (a) { return a.w * k <= room; });
      if (c.pool.length < 8) {                 // nothing fits: take the slimmest
        c.pool = alphabet.slice().sort(function (x, y) { return x.w - y.w; }).slice(0, 8);
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

    var lat = GROUPS.map(function (g) { return g.lat; }).join('');

    try {
      Promise.all([
        // the Devanagari is path data and needs nothing; only the Latin does
        f.load('800 88px Playfair', lat),
        // the rain draws in these two, and a canvas does not honour
        // font-display either
        f.load('400 20px Rozha', 'कखग'),
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
            if (!c.pool || !c.pool.length) return;
            var a = c.pool[(Math.random() * c.pool.length) | 0];
            c.dev.setAttribute('d', a.d);
            c.dev.setAttribute('transform', place(c.cx, c.size, a));
          }
        }, from);

        // and it settles on the one it was always going to be
        tl.call(function () {
          if (!c.run) return;
          c.dev.setAttribute('d', c.run.d);
          c.dev.setAttribute('transform', place(c.cx, c.size, c.run));
        }, null, from + SCRAMBLE);
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

      /** Where a cell's content actually paints, in page pixels.
       *
       *  From the widths fit() already worked out, not from getBBox on the
       *  path: a path's bbox comes back in its own user space, which for these
       *  is font units — around a thousand where the cell is around a hundred
       *  and fifty — so mixing the two silently compares numbers on different
       *  scales. `room` is the wider of the two scripts, in viewBox units,
       *  which is what the cell was sized around in the first place. */
      function ink(c) {
        var box = c.cell.getBoundingClientRect();
        var vb = parseFloat((c.svg.getAttribute('viewBox') || '').split(' ')[2]) || 1;
        var scale = Math.min(box.width / vb, c.svg.getBoundingClientRect().height / VBH);
        var mid = box.left + box.width / 2;
        var half = (c.room ? c.room * scale : box.width) / 2;
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
