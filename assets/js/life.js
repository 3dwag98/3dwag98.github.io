/* ============================================================================
   life.js — Conway's Game of Life, drawn with the cursor.

   Four rules, no cleverness, and the behaviour that comes out of them is the
   whole argument of the quote above it: complex systems evolve from simple
   ones that worked. Drag to draw cells, drop a pattern, watch it run.

   Pauses when off screen, starts paused under reduced motion, and never
   throws if the canvas is missing.
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

  /** `root` is the whole section: the board, the HUD and the buttons all live
   *  inside it. Binding to the board alone silently loses every control. */
  function init(root) {
    var canvas = root.querySelector('canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) { root.remove(); return; }

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var css = getComputedStyle(document.documentElement);
    var ink = (css.getPropertyValue('--ink') || '#14120F').trim();
    var accent = (css.getPropertyValue('--accent') || '#E4441A').trim();
    var line = 'rgba(20,18,15,0.10)';

    var cols = 0, rows = 0, cells = null, next = null, age = null;
    var dpr = 1, timer = null, raf = null;
    var running = false, onScreen = false, painting = false, generation = 0;

    var genEl = root.querySelector('[data-life-gen]');
    var liveEl = root.querySelector('[data-life-live]');
    var playBtn = root.querySelector('[data-life="toggle"]');

    var idx = function (x, y) { return y * cols + x; };

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
      var w = canvas.width, h = canvas.height;
      var size = (w / cols);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // grid
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 1; gx < cols; gx++) { ctx.moveTo(Math.round(gx * size) + 0.5, 0); ctx.lineTo(Math.round(gx * size) + 0.5, h); }
      for (var gy = 1; gy < rows; gy++) { ctx.moveTo(0, Math.round(gy * size) + 0.5); ctx.lineTo(w, Math.round(gy * size) + 0.5); }
      ctx.stroke();

      var cellH = h / rows;
      var pad = Math.max(1, size * 0.12);

      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var i = idx(x, y);
          if (!cells[i]) continue;
          // freshly born cells land in vermilion and settle to ink
          ctx.fillStyle = age[i] < 2 ? accent : ink;
          ctx.globalAlpha = age[i] < 2 ? 1 : 0.82;
          ctx.fillRect(x * size + pad, y * cellH + pad, size - pad * 2, cellH - pad * 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    function step() {
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var n = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              // the field wraps, so gliders leave one edge and arrive at the other
              var nx = (x + dx + cols) % cols;
              var ny = (y + dy + rows) % rows;
              n += cells[idx(nx, ny)];
            }
          }
          var i = idx(x, y);
          var alive = cells[i] ? (n === 2 || n === 3) : (n === 3);
          next[i] = alive ? 1 : 0;
          age[i] = alive ? (cells[i] ? Math.min(255, age[i] + 1) : 0) : 0;
        }
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

    /* ---- drawing with the pointer ------------------------------------- */

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
      if (action === 'step') { pause(true); step(); return; }
      stamp(action);
      if (!running && !reduced) play();
    });

    /* ---- lifecycle ----------------------------------------------------- */

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(false); else if (onScreen && root.classList.contains('is-running')) play();
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
    stamp('gun');
    readout();

    if (!reduced) {
      onScreen = true;
      play();
    } else if (playBtn) {
      playBtn.textContent = 'Play';
    }
  }

  function boot() {
    document.querySelectorAll('[data-life-root]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
