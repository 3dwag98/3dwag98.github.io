/* ============================================================================
   life.js — Conway's Game of Life, drawn with the cursor.

   Four rules, no cleverness, and the behaviour that comes out of them is the
   argument of the quote above it: complicated systems that work turn out to
   have grown from simple ones that worked.

   Three parts:

   1. `stepGrid` — the rules, and the only place they exist. Both the board and
      the little teaching diagrams call it, so a diagram cannot drift away from
      what the board actually does. If the rules were duplicated for the
      diagrams they would eventually be lying.
   2. The board. Drag to draw, stamp a pattern, watch it run.
   3. The tutorial. Four before/after diagrams for the rules, and a coach that
      follows what you have actually done rather than telling you everything at
      once.

   Pauses off screen and when the tab is hidden, repaints on a theme change,
   starts paused under reduced motion, and never throws if the canvas is gone.
   ========================================================================= */

(function () {
  'use strict';

  var CELL = 13;                 // css px per cell at 1x
  var TICK = 105;                // ms between generations

  /* Seeds worth watching. Coordinates are cell offsets from a corner. */
  var PATTERNS = {
    glider: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
    pulsar: [
      [2,0],[3,0],[4,0],[8,0],[9,0],[10,0],
      [0,2],[5,2],[7,2],[12,2],[0,3],[5,3],[7,3],[12,3],[0,4],[5,4],[7,4],[12,4],
      [2,5],[3,5],[4,5],[8,5],[9,5],[10,5],
      [2,7],[3,7],[4,7],[8,7],[9,7],[10,7],
      [0,8],[5,8],[7,8],[12,8],[0,9],[5,9],[7,9],[12,9],[0,10],[5,10],[7,10],[12,10],
      [2,12],[3,12],[4,12],[8,12],[9,12],[10,12]
    ],
    /* Gosper glider gun — the small thing that keeps producing */
    gun: [
      [24,0],[22,1],[24,1],[12,2],[13,2],[20,2],[21,2],[34,2],[35,2],
      [11,3],[15,3],[20,3],[21,3],[34,3],[35,3],
      [0,4],[1,4],[10,4],[16,4],[20,4],[21,4],
      [0,5],[1,5],[10,5],[14,5],[16,5],[17,5],[22,5],[24,5],
      [10,6],[16,6],[24,6],[11,7],[15,7],[12,8],[13,8]
    ]
  };

  /* ── the rules ─────────────────────────────────────────────────────────
     One generation, wrapping at the edges so a glider leaving the right side
     arrives at the left. Writes into `out` and returns it. */
  function stepGrid(cells, out, cols, rows) {
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var n = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            n += cells[((y + dy + rows) % rows) * cols + ((x + dx + cols) % cols)];
          }
        }
        var i = y * cols + x;
        out[i] = (cells[i] ? (n === 2 || n === 3) : (n === 3)) ? 1 : 0;
      }
    }
    return out;
  }

  function token(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  /* ── the teaching diagrams ─────────────────────────────────────────────
     Each is a 5x5 field drawn twice — before, then the generation the real
     rules produce from it — with the cell the rule is about ringed in both.
     A diagram rather than an animation on purpose: it is legible the moment
     it is on screen, it needs no timer, and it says the same thing to someone
     who has asked for reduced motion. */
  var RULES = [
    { seed: [[2,1],[1,2],[3,2]],                  focus: [2,2], cap: 'Three neighbours &rarr; <b>born</b>' },
    { seed: [[1,2],[2,2],[3,2]],                  focus: [2,2], cap: 'Two or three &rarr; <b>lives on</b>' },
    { seed: [[2,2],[3,2]],                        focus: [2,2], cap: 'Fewer than two &rarr; <b>dies</b>' },
    { seed: [[1,1],[2,1],[3,1],[1,2],[2,2]],      focus: [2,2], cap: 'More than three &rarr; <b>dies</b>' }
  ];

  var N = 5;                     // diagram is 5 x 5
  var GAP = 1.1;                 // cells of space between before and after

  function drawRule(canvas, rule) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;

    var before = new Uint8Array(N * N);
    rule.seed.forEach(function (p) { before[p[1] * N + p[0]] = 1; });
    var after = stepGrid(before, new Uint8Array(N * N), N, N);

    var box = canvas.getBoundingClientRect();
    if (!box.width) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var unit = box.width / (N * 2 + GAP);         // css px per cell
    var h = unit * N;

    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, h);

    var ink = token('--ink', '#F4F6F2');
    var accent = token('--accent', '#C6F24E');
    var mute = token('--mute', '#858C80');
    var line = token('--line', 'rgba(255,255,255,0.12)');

    function grid(cells, ox) {
      var pad = Math.max(1, unit * 0.14);
      for (var y = 0; y < N; y++) {
        for (var x = 0; x < N; x++) {
          var cx = ox + x * unit, cy = y * unit;
          ctx.strokeStyle = line;
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(cx) + 0.5, Math.round(cy) + 0.5, Math.round(unit), Math.round(unit));

          if (cells[y * N + x]) {
            var isFocus = x === rule.focus[0] && y === rule.focus[1];
            ctx.fillStyle = isFocus ? accent : ink;
            ctx.globalAlpha = isFocus ? 1 : 0.55;
            ctx.fillRect(cx + pad, cy + pad, unit - pad * 2, unit - pad * 2);
            ctx.globalAlpha = 1;
          }
        }
      }
      // ring the cell the rule is about, alive or not, in both halves
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(
        Math.round(ox + rule.focus[0] * unit) + 0.5,
        Math.round(rule.focus[1] * unit) + 0.5,
        Math.round(unit), Math.round(unit)
      );
    }

    grid(before, 0);
    grid(after, unit * (N + GAP));

    // the arrow between them
    var ax = unit * N + unit * GAP * 0.2, aw = unit * GAP * 0.6, ay = h / 2;
    ctx.strokeStyle = mute;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(ax + aw, ay);
    ctx.stroke();
    ctx.fillStyle = mute;
    ctx.beginPath();
    ctx.moveTo(ax + aw + 3, ay); ctx.lineTo(ax + aw - 2, ay - 3); ctx.lineTo(ax + aw - 2, ay + 3);
    ctx.closePath(); ctx.fill();
  }

  /* ── the panel ─────────────────────────────────────────────────────────── */

  /** `root` is the whole section: the board, the HUD, the buttons and the
   *  tutorial all live inside it. Binding to the board alone silently loses
   *  every control. */
  function init(root) {
    var canvas = root.querySelector('[data-life-board]');
    if (!canvas) return;

    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) { root.remove(); return; }

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var C = { ink: '#F4F6F2', accent: '#C6F24E', line: 'rgba(255,255,255,0.12)' };
    function palette() {
      C.ink = token('--ink', C.ink);
      C.accent = token('--accent', C.accent);
      C.line = token('--line', C.line);
    }
    palette();

    var cols = 0, rows = 0, cells = null, next = null, age = null;
    var dpr = 1, timer = null;
    var running = false, onScreen = false, painting = false, generation = 0;

    var genEl = root.querySelector('[data-life-gen]');
    var liveEl = root.querySelector('[data-life-live]');
    var playBtn = root.querySelector('[data-life="toggle"]');

    var idx = function (x, y) { return y * cols + x; };

    /* ---- the coach ----------------------------------------------------
       Three steps, each ticked off by the thing it asks for rather than by a
       Next button, so it can only ever be describing something you have not
       done yet. */
    var coachEl = root.querySelector('[data-life-coach]');
    var STEPS = [
      { key: 'draw',  text: 'Drag across the grid to draw living cells.' },
      { key: 'step',  text: 'Press Step. It advances exactly one generation, so you can watch the four rules fire.' },
      { key: 'stamp', text: 'Now drop in a Glider or the Gun and leave it alone.' }
    ];
    var did = {};

    function coach() {
      if (!coachEl) return;
      var step = 0;
      while (step < STEPS.length && did[STEPS[step].key]) step++;
      if (step >= STEPS.length) {
        coachEl.innerHTML = '<b>That is the whole game.</b> Four rules, and everything above ' +
          'came out of them &mdash; nothing here knows what a glider is.';
        coachEl.setAttribute('data-done', 'true');
        return;
      }
      coachEl.innerHTML = '<span class="life__step">' + (step + 1) + ' / ' + STEPS.length +
        '</span> ' + STEPS[step].text;
    }

    function didStep(key) {
      if (did[key]) return;
      did[key] = true;
      coach();
    }

    /* ---- board --------------------------------------------------------- */

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;

      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var nc = Math.max(8, Math.floor(r.width / CELL));
      var nr = Math.max(6, Math.floor(r.height / CELL));

      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);

      if (nc !== cols || nr !== rows) {
        var old = cells, oc = cols, or_ = rows;
        cols = nc; rows = nr;
        cells = new Uint8Array(cols * rows);
        next = new Uint8Array(cols * rows);
        age = new Uint8Array(cols * rows);
        if (old) {                              // keep what is already alive
          for (var y = 0; y < Math.min(or_, rows); y++)
            for (var x = 0; x < Math.min(oc, cols); x++)
              cells[idx(x, y)] = old[y * oc + x];
        }
      }

      draw();
    }

    function draw() {
      if (!cells) return;
      var w = canvas.width, h = canvas.height;
      var size = w / cols, cellH = h / rows;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 1; gx < cols; gx++) { ctx.moveTo(Math.round(gx * size) + 0.5, 0); ctx.lineTo(Math.round(gx * size) + 0.5, h); }
      for (var gy = 1; gy < rows; gy++) { ctx.moveTo(0, Math.round(gy * cellH) + 0.5); ctx.lineTo(w, Math.round(gy * cellH) + 0.5); }
      ctx.stroke();

      var pad = Math.max(1, size * 0.12);
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var i = idx(x, y);
          if (!cells[i]) continue;
          // freshly born cells land in accent and settle to ink
          ctx.fillStyle = age[i] < 2 ? C.accent : C.ink;
          ctx.globalAlpha = age[i] < 2 ? 1 : 0.82;
          ctx.fillRect(x * size + pad, y * cellH + pad, size - pad * 2, cellH - pad * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    function step() {
      stepGrid(cells, next, cols, rows);
      for (var i = 0; i < cells.length; i++) {
        age[i] = next[i] ? (cells[i] ? Math.min(255, age[i] + 1) : 0) : 0;
      }
      var swap = cells; cells = next; next = swap;
      generation++;
      readout();
      draw();
    }

    function readout() {
      var live = 0;
      for (var i = 0; i < cells.length; i++) live += cells[i];
      if (genEl) genEl.textContent = String(generation).padStart(4, '0');
      if (liveEl) liveEl.textContent = String(live).padStart(3, '0');
    }

    function play() {
      if (running || !onScreen) return;
      running = true;
      root.classList.add('is-running');
      if (playBtn) { playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true'); }
      timer = setInterval(step, TICK);
    }

    function pause(hard) {
      running = false;
      clearInterval(timer);
      timer = null;
      if (hard) root.classList.remove('is-running');
      if (playBtn && hard) { playBtn.textContent = 'Play'; playBtn.setAttribute('aria-pressed', 'false'); }
    }

    /* ---- drawing with the pointer -------------------------------------- */

    function cellAt(e) {
      var r = canvas.getBoundingClientRect();
      var x = Math.floor((e.clientX - r.left) / (r.width / cols));
      var y = Math.floor((e.clientY - r.top) / (r.height / rows));
      return (x >= 0 && y >= 0 && x < cols && y < rows) ? idx(x, y) : -1;
    }

    function paintAt(e) {
      var i = cellAt(e);
      if (i < 0 || cells[i]) return;
      cells[i] = 1;
      age[i] = 0;
      readout();
      didStep('draw');
      if (!running) draw();
    }

    canvas.addEventListener('pointerdown', function (e) {
      painting = true;
      canvas.setPointerCapture(e.pointerId);
      paintAt(e);
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!painting) return;
      e.preventDefault();
      paintAt(e);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      canvas.addEventListener(ev, function () { painting = false; });
    });

    /* ---- controls ------------------------------------------------------ */

    function stamp(name) {
      var pts = PATTERNS[name];
      if (!pts) return;

      var w = Math.max.apply(null, pts.map(function (p) { return p[0]; })) + 1;
      var h = Math.max.apply(null, pts.map(function (p) { return p[1]; })) + 1;
      var ox = Math.max(0, Math.floor((cols - w) / 2));
      var oy = Math.max(0, Math.floor((rows - h) / 2));

      pts.forEach(function (p) {
        var x = ox + p[0], y = oy + p[1];
        if (x < cols && y < rows) { cells[idx(x, y)] = 1; age[idx(x, y)] = 0; }
      });

      readout();
      draw();
    }

    function clear() {
      cells.fill(0);
      age.fill(0);
      generation = 0;
      readout();
      draw();
    }

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-life]');
      if (!btn) return;
      var action = btn.getAttribute('data-life');

      if (action === 'toggle') { running ? pause(true) : play(); return; }
      if (action === 'clear') { pause(true); clear(); return; }
      if (action === 'step') { pause(true); didStep('step'); step(); return; }

      stamp(action);
      didStep('stamp');
      if (!running && !reduced) play();
    });

    /* ---- lifecycle ------------------------------------------------------ */

    var rules = [].slice.call(root.querySelectorAll('[data-life-rule]'));
    function drawRules() {
      rules.forEach(function (c, i) { if (RULES[i]) drawRule(c, RULES[i]); });
    }

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { resize(); drawRules(); }, 180);
    });

    window.addEventListener('cg:theme', function () { palette(); draw(); drawRules(); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(false);
      else if (onScreen && root.classList.contains('is-running')) play();
    });

    if (window.ScrollTrigger) {
      window.ScrollTrigger.create({
        trigger: root,
        start: 'top 85%',
        end: 'bottom 15%',
        onToggle: function (self) {
          onScreen = self.isActive;
          if (!onScreen) pause(false);
          else if (root.classList.contains('is-running')) play();
        }
      });
    } else {
      onScreen = true;
    }

    resize();
    drawRules();
    stamp('gun');
    readout();
    coach();

    if (!reduced) {
      onScreen = true;
      play();
    } else if (playBtn) {
      playBtn.textContent = 'Play';
      playBtn.setAttribute('aria-pressed', 'false');
    }
  }

  function boot() {
    var roots = document.querySelectorAll('[data-life-root]');
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
