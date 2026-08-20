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

     The sizes are no longer here. The Devanagari takes a random one per
     syllable on every load, so the name never sets the same way twice, and the
     Latin is uniform — one size for all seven, as large as the viewport will
     take. The two scripts want opposite things: the Devanagari is a run of
     separate syllables and reads better with a rhythm, the Latin is one word
     and reads worse with one. */
  var GROUPS = [
    { dev: 'चिं', ams: 'ica/', lat: 'CHIN', w: 2.1 },
    { dev: 'ता',  ams: 'taa',  lat: 'TA',   w: 1.9 },
    { dev: 'म',   ams: 'ma',   lat: 'MA',   w: 1.8 },
    { dev: 'णी',  ams: 'NaI',  lat: 'NI',   w: 3.6 },
    { dev: 'गा',  ams: 'gaa',  lat: 'GA',   w: 2.1 },
    { dev: 'व',   ams: 'va',   lat: 'WA',   w: 2.4 },
    { dev: 'डे',  ams: 'De',   lat: 'DE',   w: 2.0 }
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
  /* Only a starting value. The Latin is solved for against the window in
     layout(), which is what lets it be as large as it is. */
  var LAT_SIZE = 88;

  /* The range a syllable's size is drawn from. The ceiling is not taste: the
     ink runs 1.19 em above the baseline, and BASE_Y leaves 126 units, so
     anything past about 1.32 climbs out of its own box. */
  var DEV_MIN = 0.72;
  var DEV_MAX = 1.30;

  function devSize() { return DEV_SIZE * (DEV_MIN + Math.random() * (DEV_MAX - DEV_MIN)); }

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
    var x = 0, out = [], x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var i = 0; i < run.length; i++) {
      var g = G[run.charAt(i)];
      if (!g) continue;
      if (g.d) {
        out.push(x ? shift(g.d, x) : g.d);
        x0 = Math.min(x0, g.b[0] + x);
        x1 = Math.max(x1, g.b[1] + x);
        y0 = Math.min(y0, g.b[2]);
        y1 = Math.max(y1, g.b[3]);
      }
      x += g.a;                       // matras have an advance of ~0 and overlay
    }
    if (x0 > x1) { x0 = 0; x1 = x; }
    if (y0 > y1) { y0 = 0; y1 = 0; }
    /* `w` is the ink, not the advance. These glyphs overhang: चिं advances
       1060 units and paints 1264, and a cell sized to the advance hands the
       difference to its neighbour. `mid` is where the ink is centred, which
       is not the middle of the advance box either.

       `up` and `dn` are how far the ink reaches either side of the baseline.
       The name's own runs were what the box was drawn around, but the scramble
       cycles through the whole alphabet, and some of those are far taller: ड
       drops 0.82 em below the baseline where ता, the deepest of the seven,
       drops 0.40. Nothing clips them — the cells are overflow: visible so the
       displacement can spill — so a run that does not fit has to be kept out
       of the pool instead. */
    return { d: out.join(''), w: x1 - x0, adv: x, mid: (x0 + x1) / 2, up: y1, dn: -y0 };
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
      /* A line break before every syllable but the first, all of them off
         until layout() decides how many lines the name takes. Always its own
         zero-height spacer, never a modifier on a real group — put on a cell,
         flex-basis: 100% collapses that syllable to nothing. */
      var br = null;
      if (i) {
        br = document.createElement('span');
        br.className = 'tl__break tl__break--off';
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
      var ds = devSize();
      var dev = document.createElementNS(ns, 'path');
      dev.setAttribute('class', 'tl__dev');
      if (run) {
        dev.setAttribute('d', run.d);
        dev.setAttribute('transform', place(vw / 2, ds, run));
      }

      var lat = document.createElementNS(ns, 'text');
      lat.setAttribute('class', 'tl__lat');
      lat.setAttribute('x', String(vw / 2));
      lat.setAttribute('y', String(BASE_Y));
      lat.setAttribute('text-anchor', 'middle');
      lat.setAttribute('opacity', '0');
      lat.style.fontSize = LAT_SIZE + 'px';   // a start; layout() solves for it
      lat.textContent = g.lat;

      group.appendChild(dev);
      group.appendChild(lat);
      svg.appendChild(group);
      cell.appendChild(svg);
      stage.appendChild(cell);

      made.push({ cell: cell, svg: svg, wrap: group, dev: dev, lat: lat, i: i,
                  run: run, size: ds, br: br });
    });

    return made;
  }

  /* How much room to leave around a group, as a fraction of its own width.
     Enough that neighbours never touch, not so much that the name falls
     apart into loose syllables. */
  var BEARING = 1.07;

  /* Rows per cell height, matching `height: calc(3 * var(--tl-u))` in the CSS.
     The two have to agree: this is what decides whether width or height ends
     up governing the glyph scale. */
  var ROW_H = 3;

  /* How much of the width the name takes before the close-up. The rest is what
     the swell grows into, so the finished state lands near full-bleed. */
  var FILL = 0.88;

  /* The entrance carries each cell up from ENTER_RISE percent of its own
     height below where it settles, and the overshoot lifts it OVERSHOOT
     pixels above. Both come off the vertical budget: a row that clears the
     footer at rest but not on the way in still lands on the footer, which is
     exactly what it was doing on a short wide window. */
  var ENTER_RISE = 7;
  var OVERSHOOT = 10;
  var EDGE = 8;                    // nothing paints closer than this to an edge

  var LAT_REF = 100;               // the size the Latin is measured at

  /* How far the capitals reach above the baseline, in em. Measured from the
     ink in latCeiling(); this is only the value to fall back on. */
  var LAT_UP = 0.73;

  /**
   * Each cell's Latin, measured once, as viewBox units per pixel of type size.
   *
   * One measurement answers for every size the solve below tries: type scales
   * linearly, and the tracking is set in em so it scales with it.
   *
   * getBBox, not getComputedTextLength: the latter is the advance, and the
   * Latin is set with negative tracking so it paints wider than it advances.
   * Sizing the cell to the advance left the glyphs touching after the close-up.
   */
  function measure(cells) {
    var ok = false;
    cells.forEach(function (c) {
      c.lat.style.fontSize = LAT_REF + 'px';
      var b;
      try { b = c.lat.getBBox(); } catch (e) { return; }
      if (!b || !b.width) return;
      c.latW = b.width / LAT_REF;
      ok = true;
    });
    return ok;
  }

  /**
   * The largest the Latin can be set before it paints out of its own box.
   *
   * From the ink, not from getBBox: on a <text> node that returns the em box,
   * which for this face runs 1.08 em above the baseline where the capitals —
   * and every string here is capitals — reach about 0.7. Sizing against the em
   * box would give away a third of the height to ascenders nothing draws.
   */
  function latCeiling() {
    var fallback = BASE_Y / 0.75;
    try {
      var cx = document.createElement('canvas').getContext('2d');
      if (!cx) return fallback;
      cx.font = '800 ' + LAT_REF + 'px Playfair';
      var m = cx.measureText(GROUPS.map(function (g) { return g.lat; }).join(''));
      var up = m.actualBoundingBoxAscent / LAT_REF;
      var dn = Math.max(0, m.actualBoundingBoxDescent) / LAT_REF;
      if (!(up > 0.3)) return fallback;          // metrics unavailable, or a
      LAT_UP = up;                               // fallback face answered
      return Math.min(BASE_Y / up,
                      dn > 0.01 ? (VBH - BASE_Y) / dn : Infinity);
    } catch (e) { return fallback; }
  }

  /** Every cell's viewBox width, in viewBox units, for a given Latin size.
   *  Whichever script needs more room wins, so the cell never changes width
   *  mid-morph and the row does not reflow while the groups turn over. */
  function widths(cells, size) {
    var em = (window.CGAms && window.CGAms.em) || 1000;
    return cells.map(function (c) {
      var dw = c.run ? c.run.w * (c.size / em) : 0;
      return Math.round(Math.max(dw, (c.latW || 0) * size) * BEARING);
    });
  }

  /** The width unit those cells would need: the room going spare divided by
   *  whichever row of the split asks for most. */
  function unitByWidth(vws, split, availW, gap) {
    var out = Infinity;
    split.forEach(function (r) {
      var n = r[1] - r[0];
      if (n <= 0) return;
      var units = 0;
      for (var i = r[0]; i < r[1]; i++) units += vws[i] / UNIT;
      // gaps are a fixed number of pixels, so they come off before dividing
      if (units) out = Math.min(out, (availW * FILL - gap * (n - 1)) / units);
    });
    return out;
  }

  /* How the name may break. Seven syllables across two words, and a word is
     never split between candidates that keep it whole — CHIN TA on one line
     and MA NI on the next is still CHINTAMANI, but GA WA DE crossing into
     CHINTAMANI's line would not be.

     Two rows is the designed shape and reads best, but on a phone four
     syllables across the width caps the type at about a fifth of what the
     screen would take. Offering the taller shape and picking by measurement
     is what lets the name be as large on a phone as it is on a desktop; the
     ordering below is fewest rows first, and the taller candidate has to beat
     the one before it by a clear margin to be taken.

     GAWADE is not offered split. Three syllables fit any width the four of
     CHINTAMANI do, and every way of breaking them leaves one syllable alone
     on a line of its own, which reads as a word that ran out of room. */
  var SPLITS = [
    [[0, 4], [4, 7]],
    [[0, 2], [2, 4], [4, 7]]
  ];
  var SPLIT_GAIN = 1.12;           // how much taller has to win by

  /**
   * The width unit the height allows, which is two separate limits.
   *
   * The stage centres in the room the loader's padding leaves above the
   * footer, so it runs out at the top and at the bottom at different rates:
   * growing the stack by one pixel costs half a pixel at each edge, but only
   * the bottom also carries the entrance dip.
   */
  function unitByHeight(root, rowCount) {
    var pad = parseFloat(getComputedStyle(root).paddingBottom) || 0;
    var box = root.clientHeight - pad;          // the stage centres in this
    var foot = root.querySelector('.loader__foot');
    var floor = foot ? foot.getBoundingClientRect().top : root.clientHeight;

    var rows = rowCount * ROW_H;                // cell heights in the stack
    var dip = ROW_H * ENTER_RISE / 100;         // how far the entrance rides low

    var above = (box - 2 * (EDGE + OVERSHOOT)) / rows;
    var below = (floor - EDGE - box / 2) / (rows / 2 + dip);
    return Math.min(above, below);
  }

  /**
   * Lays the name out at the largest Latin the window will take.
   *
   * The Latin used to be a constant, and a constant cannot be very large and
   * also fit: it has to be small enough for the worst window, which leaves
   * every other window smaller than it needed to be. On a short wide one the
   * height governs the scale and a third of the width goes unused, which is
   * exactly the room a bigger Latin wants.
   *
   * So it is solved for rather than chosen. Past the point where the width
   * starts governing, a larger Latin buys nothing — the unit shrinks by as
   * much as the type grows — and it costs the Devanagari, which shrinks with
   * the unit. That crossover is the answer: the largest Latin that is free.
   * Below it sits a floor, the size at which the Latin is as wide as the
   * Devanagari in every cell, so the English is never the smaller of the two.
   */
  function layout(cells, stage, root) {
    if (!cells.length || !stage) return null;

    var cs = getComputedStyle(stage);
    var gap = parseFloat(cs.columnGap) || 0;
    // clientWidth counts the padding; the cells only get what is inside it
    var availW = stage.clientWidth -
                 (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (availW <= 0) return null;

    /* The floor on the Latin: the size at which it is at least as wide as the
       Devanagari in every cell. Below that the Devanagari governs the widths,
       so the Latin gets smaller and nothing gets larger. It does not depend on
       the split, so it is worked out once. */
    var em = (window.CGAms && window.CGAms.em) || 1000;
    var floor = 0;
    cells.forEach(function (c) {
      if (!c.latW || !c.run) return;
      floor = Math.max(floor, c.run.w * (c.size / em) / c.latW);
    });
    var ceiling = Math.max(floor, latCeiling());

    var best = null;
    SPLITS.forEach(function (split) {
      var byHeight = unitByHeight(root, split.length);
      var lo = floor, hi = ceiling, size = hi;

      if (unitByWidth(widths(cells, hi), split, availW, gap) < byHeight) {
        // somewhere between the two the width starts governing; find it
        for (var i = 0; i < 20; i++) {
          var mid = (lo + hi) / 2;
          if (unitByWidth(widths(cells, mid), split, availW, gap) < byHeight) hi = mid;
          else lo = mid;
        }
        size = lo;
      }

      var vws = widths(cells, size);
      var unit = Math.min(unitByWidth(vws, split, availW, gap), byHeight);
      if (!isFinite(unit) || unit <= 4) return;
      // fewest rows first, and a taller shape has to be clearly better
      if (!best || unit > best.unit * SPLIT_GAIN) {
        best = { split: split, size: size, vws: vws, unit: unit };
      }
    });

    if (!best) return null;

    cells.forEach(function (c, i) {
      if (!c.br) return;
      var starts = best.split.some(function (r) { return r[0] === i; });
      c.br.classList.toggle('tl__break--off', !starts);
    });

    apply(cells, best.size, best.vws);
    stage.style.setProperty('--tl-u', best.unit.toFixed(2) + 'px');
    return best;
  }

  /** Writes the solved size and widths onto the cells, and picks each one's
   *  scramble alphabet — only the runs that fit the room it ended up with. */
  function apply(cells, size, vws) {
    var em = (window.CGAms && window.CGAms.em) || 1000;

    /* The alphabet, composed once. A cell may only cycle through the runs
       that fit it: a group whose Devanagari is the wider of its two scripts
       has no slack at all, and a fat glyph dropped into it sits on the
       syllable next door — or, for the tall ones, on the row above. */
    var alphabet = [];
    if (window.CGAms) {
      POOL_AMS.forEach(function (run) {
        var a = ams(run);
        if (a && a.d) alphabet.push(a);
      });
    }

    cells.forEach(function (c, i) {
      var vw = vws[i];
      var k = c.size / em;                     // font units -> viewBox units

      c.svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + VBH);
      c.cell.style.setProperty('--tl-w', (vw / UNIT).toFixed(3));
      c.lat.style.fontSize = size.toFixed(1) + 'px';
      c.lat.setAttribute('x', String(vw / 2));
      if (c.run) c.dev.setAttribute('transform', place(vw / 2, c.size, c.run));

      c.cx = vw / 2;
      c.room = Math.max(c.run ? c.run.w * k : 0, (c.latW || 0) * size);
      c.pool = alphabet.filter(function (a) {
        return a.w * k <= c.room &&
               a.up * k <= BASE_Y && a.dn * k <= VBH - BASE_Y;
      });
      if (c.pool.length < 8) {                 // nothing fits: take the slimmest
        c.pool = alphabet.slice().sort(function (x, y) { return x.w - y.w; }).slice(0, 8);
      }
    });
  }

  /** Measure, then lay out. Both re-run on the late font arrival, because a
   *  measurement taken against the fallback face is the whole bug this is
   *  here to prevent. */
  function relayout(cells, root) {
    measure(cells);
    layout(cells, root.querySelector('[data-tl-stage]'), root);
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
        relayout(cells, root);
        if (window.CGRain && rainEl) rain = window.CGRain.mount(rainEl);
        if (!rain && rainEl) rainEl.style.display = 'none';
        tl.play();
      });

      /* If the ceiling won that race the cells were measured against the
         fallback face, which is the whole bug this is here to prevent. Fitting
         again the moment the real fonts arrive costs one reflow in a case that
         should be rare, and is much better than leaving the glyphs overlapping. */
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(function () {
          relayout(cells, root);
        }, function () {});
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

      gsap.set(cells.map(function (c) { return c.cell; }), { opacity: 0, yPercent: ENTER_RISE });

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

      /* The vertical half of the same idea. A cell is as tall as the
         Devanagari needs — ि above and ृ below, a box more than twice the
         height of a capital — and the Latin sits on one baseline inside it
         using barely a third. Leaving that room in place is what left the two
         lines floating apart with a band of empty screen between them, when
         the whole point of this phase is that they become one name.

         So the second row comes up by whatever is measurably dead between the
         two, less the leading a display setting wants. Measured for the same
         reason the horizontal close is: the dead room is a share of the
         Devanagari's box, not a fixed slice of anything. */
      var LEAD = 0.18;                          // between the rows, in cap heights

      /** Where the Latin's ink sits in a cell, in page pixels.
       *
       *  Not getBBox: on a text node that is the em box, which runs 1.08 em
       *  above the baseline for this face while every string here is capitals
       *  reaching 0.73. Sizing the gap off the em box would leave it a third
       *  of a cap height wrong. */
      function band(c) {
        var m = c.lat.getScreenCTM();
        if (!m) { var r = c.cell.getBoundingClientRect(); return { top: r.top, bot: r.bottom }; }
        var base = m.d * BASE_Y + m.f;
        return { top: base - LAT_UP * (parseFloat(c.lat.style.fontSize) || 0) * m.d, bot: base };
      }

      /* The rows as they were actually laid out, resolved once and reused.
         Not read while these tweens are being built: layout() picks how many
         lines the name takes, and it runs after this timeline is created. */
      var plan = null;
      function grid() {
        if (plan) return plan;
        var r = rows(), at = [];
        r.forEach(function (row, i) { row.forEach(function (c) { at[c.i] = i; }); });
        plan = { rows: r, at: at };
        return plan;
      }

      /* Resolved once, for every row at once. The tweens that need this all
         start together, and any of them measuring after another had already
         moved the stage would read a different page. */
      var lifted = null;
      function lift() {
        if (lifted) return lifted;
        var r = grid().rows;
        lifted = r.map(function () { return 0; });
        for (var i = 1; i < r.length; i++) {
          var bottom = -Infinity, over = Infinity, cap = 0;
          r[i - 1].forEach(function (c) {
            var b = band(c);
            bottom = Math.max(bottom, b.bot);
            cap = Math.max(cap, b.bot - b.top);
          });
          r[i].forEach(function (c) { over = Math.min(over, band(c).top); });
          if (isFinite(bottom) && isFinite(over) && cap > 0) {
            /* Only this row's own gap. A negative margin takes that much off
               its line, which carries every row after it up as well, so the
               rows close cumulatively without any of them being told to. */
            lifted[i] = Math.max(0, Math.round(over - bottom - LEAD * cap));
          }
        }
        return lifted;
      }

      function liftTotal() {
        return lift().reduce(function (a, b) { return a + b; }, 0);
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

        /* Against the height the stage is about to have, not the one it has:
           the rows close at the same time as this runs, and the stage centres
           in a fixed box, so it ends up shorter about the same middle. */
        var h = Math.max(1, box.height - liftTotal());

        /* The stage grows about its own centre, so it runs out of room at both
           edges at once — and not at the same rate, because the footer sits
           closer than the top of the screen does. Guarding only the footer let
           the first row climb off the top of a wide short window. */
        var mid = box.top + box.height / 2;
        var below = ((floor - EDGE) - mid) * 2 / h;
        var above = (mid - EDGE) * 2 / h;

        var byWidth = widest ? (window.innerWidth * 0.96) / widest : 1.24;
        return Math.max(1, Math.min(1.24, byWidth, below, above));
      }

      tl.to(cells.map(function (c) { return c.cell; }), {
        marginLeft: tighten, marginRight: tighten,
        duration: 0.55, ease: 'power3.inOut'
      }, last)
        .to(stage, { scale: swell, duration: 0.55, ease: 'power3.inOut' }, last);

      /* One tween over every cell, each asking which row it ended up in, so
         this works for whichever of the shapes layout() chose. */
      tl.to(cells.map(function (c) { return c.cell; }), {
        marginTop: function (i) { return -(lift()[grid().at[i]] || 0); },
        duration: 0.55, ease: 'power3.inOut'
      }, last);

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
