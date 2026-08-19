/* ============================================================================
   queue.js — "Hold the line": a small backpressure sandbox.

   Traffic arrives at a rate you do not control. You control how many workers
   are serving it. Too few and the queue builds, latency climbs past the SLO
   and requests start dropping; too many and you are paying for idle capacity.
   It is Little's law with a scoreboard, and it is the argument the rest of the
   page keeps making, made playable.

   Drag left/right on the board — or use the buttons — to change the worker
   count. Repaints itself when the theme changes; pauses when off screen.
   ========================================================================= */

(function () {
  'use strict';

  var TICK_MS = 100;              // simulation step
  var SERVICE_MS = 220;           // how long one worker takes per request
  var SLO_MS = 400;               // the line you are holding
  var MAX_QUEUE = 60;             // past this, requests are shed
  var MAX_WORKERS = 12;
  var HISTORY = 120;              // latency samples kept for the sparkline

  function init(root) {
    var canvas = root.querySelector('canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) { root.remove(); return; }

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var C = { paper: '#14120F', ink: '#F2EDE3', accent: '#FF5A2B', mute: '#8A8377', line: 'rgba(242,237,227,0.16)' };

    var state = {
      workers: 3,
      queue: 0,
      arrivals: 0,
      rps: 8,
      phase: 0,
      spike: 0,
      latency: SERVICE_MS,
      history: [],
      dropped: 0,
      held: 0,
      total: 0,
      best: 0,
      streak: 0
    };

    var running = false, onScreen = false, timer = null, dragging = false;

    var el = {
      rps: root.querySelector('[data-q-rps]'),
      workers: root.querySelector('[data-q-workers]'),
      depth: root.querySelector('[data-q-depth]'),
      latency: root.querySelector('[data-q-latency]'),
      uptime: root.querySelector('[data-q-uptime]'),
      toggle: root.querySelector('[data-q="toggle"]'),
      verdict: root.querySelector('[data-q-verdict]')
    };

    /* ---- simulation --------------------------------------------------- */

    function step() {
      state.phase += 0.04;

      // a base load that breathes, plus spikes that arrive uninvited
      if (state.spike > 0) state.spike -= 1;
      else if (Math.random() < 0.012) state.spike = 40 + Math.floor(Math.random() * 40);

      var base = 9 + Math.sin(state.phase) * 3.5 + Math.sin(state.phase * 0.37) * 2;
      state.rps = Math.max(1, base + (state.spike > 0 ? 16 : 0) + (Math.random() - 0.5) * 2);

      var arriving = state.rps * (TICK_MS / 1000);
      var capacity = state.workers * (TICK_MS / SERVICE_MS);

      state.queue += arriving;
      var served = Math.min(state.queue, capacity);
      state.queue -= served;

      var shed = 0;
      if (state.queue > MAX_QUEUE) { shed = state.queue - MAX_QUEUE; state.queue = MAX_QUEUE; }
      state.dropped += shed;

      // wait ≈ queue / service rate, plus the service itself
      state.latency = SERVICE_MS + (state.queue / Math.max(capacity, 0.0001)) * TICK_MS;

      state.history.push(state.latency);
      if (state.history.length > HISTORY) state.history.shift();

      state.total++;
      var ok = state.latency <= SLO_MS && shed < 0.5;
      if (ok) { state.held++; state.streak++; state.best = Math.max(state.best, state.streak); }
      else state.streak = 0;

      readout();
      draw();
    }

    function readout() {
      var pct = state.total ? Math.round((state.held / state.total) * 100) : 100;
      if (el.rps) el.rps.textContent = String(Math.round(state.rps)).padStart(2, '0');
      if (el.workers) el.workers.textContent = String(state.workers).padStart(2, '0');
      if (el.depth) el.depth.textContent = String(Math.round(state.queue)).padStart(2, '0');
      if (el.latency) el.latency.textContent = String(Math.round(state.latency)) + 'ms';
      if (el.uptime) el.uptime.textContent = pct + '%';

      root.classList.toggle('is-breached', state.latency > SLO_MS);

      if (el.verdict) {
        el.verdict.textContent =
          state.latency > SLO_MS ? 'Over the line — add workers'
          : state.queue < 0.5 && state.workers > Math.ceil(state.rps * SERVICE_MS / 1000) + 1 ? 'Holding, but over-provisioned'
          : 'Holding';
      }
    }

    /* ---- drawing ------------------------------------------------------- */

    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      draw();
    }

    function draw() {
      var w = canvas.width, h = canvas.height;
      var dpr = w / canvas.getBoundingClientRect().width || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var W = w / dpr, H = h / dpr;

      ctx.clearRect(0, 0, W, H);

      var padX = 14;
      var chartH = H * 0.52;
      var chartY = 10;

      /* --- latency chart --- */
      var sloY = chartY + chartH - (SLO_MS / (SLO_MS * 2.2)) * chartH;

      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, Math.round(chartY + chartH) + 0.5);
      ctx.lineTo(W - padX, Math.round(chartY + chartH) + 0.5);
      ctx.stroke();

      // the SLO line
      ctx.strokeStyle = C.accent;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padX, sloY);
      ctx.lineTo(W - padX, sloY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = C.accent;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('SLO ' + SLO_MS + 'ms', padX, sloY - 5);

      // the trace
      if (state.history.length > 1) {
        var stepX = (W - padX * 2) / (HISTORY - 1);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (var i = 0; i < state.history.length; i++) {
          var v = Math.min(state.history[i], SLO_MS * 2.2);
          var x = padX + i * stepX;
          var y = chartY + chartH - (v / (SLO_MS * 2.2)) * chartH;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = state.latency > SLO_MS ? C.accent : C.ink;
        ctx.stroke();
      }

      /* --- queue --- */
      var qY = chartY + chartH + 22;
      var qW = W - padX * 2;
      var fill = Math.min(1, state.queue / MAX_QUEUE);

      ctx.strokeStyle = C.line;
      ctx.strokeRect(padX + 0.5, qY + 0.5, qW - 1, 14);
      ctx.fillStyle = state.queue >= MAX_QUEUE - 0.5 ? C.accent : C.ink;
      ctx.globalAlpha = state.queue >= MAX_QUEUE - 0.5 ? 1 : 0.55;
      ctx.fillRect(padX + 1, qY + 1, Math.max(0, (qW - 2) * fill), 12);
      ctx.globalAlpha = 1;

      ctx.fillStyle = C.mute;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('QUEUE', padX, qY - 5);

      /* --- workers --- */
      var wY = qY + 34;
      var slot = Math.min(26, (qW - (MAX_WORKERS - 1) * 6) / MAX_WORKERS);
      // How many workers the current traffic actually needs. Fewer filled than
      // provisioned means idle capacity; all filled with a growing queue means
      // the arrival rate has outrun you.
      var offered = state.rps * SERVICE_MS / 1000;
      var busy = Math.min(state.workers, Math.ceil(offered));

      ctx.fillStyle = C.mute;
      ctx.fillText('WORKERS', padX, wY - 5);

      for (var k = 0; k < MAX_WORKERS; k++) {
        var x0 = padX + k * (slot + 6);
        var active = k < state.workers;
        ctx.strokeStyle = active ? (k < busy ? C.accent : C.ink) : C.line;
        ctx.globalAlpha = active ? 1 : 0.5;
        ctx.strokeRect(x0 + 0.5, wY + 0.5, slot, 14);
        if (k < busy) { ctx.fillStyle = C.accent; ctx.globalAlpha = 0.7; ctx.fillRect(x0 + 1, wY + 1, slot - 1, 13); }
        ctx.globalAlpha = 1;
      }
    }

    /* ---- controls ------------------------------------------------------ */

    function setWorkers(n) {
      state.workers = Math.max(1, Math.min(MAX_WORKERS, n));
      readout();
      draw();
    }

    function play() {
      if (running || !onScreen) return;
      running = true;
      root.classList.add('is-running');
      if (el.toggle) { el.toggle.textContent = 'Pause'; el.toggle.setAttribute('aria-pressed', 'true'); }
      timer = setInterval(step, TICK_MS);
    }

    function pause(hard) {
      running = false;
      clearInterval(timer);
      timer = null;
      if (hard) {
        root.classList.remove('is-running');
        if (el.toggle) { el.toggle.textContent = 'Run'; el.toggle.setAttribute('aria-pressed', 'false'); }
      }
    }

    function reset() {
      state.queue = 0; state.dropped = 0; state.held = 0; state.total = 0;
      state.streak = 0; state.best = 0; state.history = []; state.spike = 0;
      state.latency = SERVICE_MS;
      readout();
      draw();
    }

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-q]');
      if (!btn) return;
      var action = btn.getAttribute('data-q');
      if (action === 'toggle') { running ? pause(true) : play(); return; }
      if (action === 'add') { setWorkers(state.workers + 1); return; }
      if (action === 'drop') { setWorkers(state.workers - 1); return; }
      if (action === 'spike') { state.spike = 60; return; }
      if (action === 'reset') { reset(); return; }
    });

    // dragging across the board scrubs the worker count
    function workersFromX(e) {
      var r = canvas.getBoundingClientRect();
      var t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      setWorkers(Math.round(1 + t * (MAX_WORKERS - 1)));
    }

    canvas.addEventListener('pointerdown', function (e) {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      workersFromX(e);
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      e.preventDefault();
      workersFromX(e);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      canvas.addEventListener(ev, function () { dragging = false; });
    });

    canvas.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setWorkers(state.workers + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setWorkers(state.workers - 1); e.preventDefault(); }
    });

    /* ---- lifecycle ----------------------------------------------------- */

    function palette(detail) {
      C.paper = detail.paper; C.ink = detail.ink; C.accent = detail.accent;
      C.mute = detail.mute; C.line = detail.line;
      draw();
    }

    window.addEventListener('cg:theme', function (e) { palette(e.detail); });
    if (window.CGTheme) {
      palette({ paper: window.CGTheme.token('--paper'), ink: window.CGTheme.token('--ink'),
                accent: window.CGTheme.token('--accent'), mute: window.CGTheme.token('--mute'),
                line: window.CGTheme.token('--line') });
    }

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 180); });
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
    readout();

    if (!reduced) { onScreen = true; play(); }
    else if (el.toggle) el.toggle.textContent = 'Run';
  }

  function boot() { document.querySelectorAll('[data-q-root]').forEach(init); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
