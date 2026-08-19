/* ============================================================================
   trace.js — "Find the bottleneck".

   A service graph where one node has gone slow. Every node above it on the
   call path looks slow too, because it is sitting there waiting — which is
   exactly why a dashboard full of red is not an answer. Click the node that is
   actually spending the time.

   Rounds, a score and a streak. Repaints on cg:theme; pauses nothing, because
   nothing runs on a timer except the reveal.
   ========================================================================= */

(function () {
  'use strict';

  /* A fixed topology: client at the left, stores at the right. `to` lists the
     nodes a service calls; a node's total = its own time + the slowest child. */
  var GRAPH = [
    { id: 'edge',    label: 'Edge',        col: 0, row: 1.5, to: ['gateway'] },
    { id: 'gateway', label: 'API gateway', col: 1, row: 1.5, to: ['orders', 'accounts'] },
    { id: 'orders',  label: 'Orders',      col: 2, row: 0.5, to: ['pricing', 'ledger'] },
    { id: 'accounts',label: 'Accounts',    col: 2, row: 2.5, to: ['profile'] },
    { id: 'pricing', label: 'Pricing',     col: 3, row: 0,   to: ['cache'] },
    { id: 'ledger',  label: 'Ledger',      col: 3, row: 1.2, to: ['postgres'] },
    { id: 'profile', label: 'Profile',     col: 3, row: 2.6, to: ['postgres'] },
    { id: 'cache',   label: 'Redis',       col: 4, row: 0,   to: [] },
    { id: 'postgres',label: 'Postgres',    col: 4, row: 2,   to: [] }
  ];

  var BASE = {                                   // healthy self time, ms
    edge: 4, gateway: 8, orders: 12, accounts: 9,
    pricing: 14, ledger: 18, profile: 11, cache: 2, postgres: 22
  };

  function init(root) {
    var canvas = root.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) { root.remove(); return; }

    var C = { paper: '#14120F', paper2: '#1C1915', ink: '#F2EDE3', accent: '#FF5A2B', mute: '#8A8377', line: 'rgba(242,237,227,0.16)' };

    var byId = {};
    GRAPH.forEach(function (n) { byId[n.id] = n; });

    var state = { culprit: null, self: {}, total: {}, picked: null, revealed: false, round: 0, score: 0, streak: 0, best: 0 };
    var hover = null, boxes = [];

    var el = {
      round: root.querySelector('[data-t-round]'),
      score: root.querySelector('[data-t-score]'),
      streak: root.querySelector('[data-t-streak]'),
      verdict: root.querySelector('[data-t-verdict]'),
      next: root.querySelector('[data-t="next"]')
    };

    /* ---- a round ------------------------------------------------------- */

    function totalFor(id) {
      var n = byId[id];
      var child = 0;
      n.to.forEach(function (c) { child = Math.max(child, totalFor(c)); });
      return state.self[id] + child;
    }

    function deal() {
      // anything except the edge, which is never the interesting answer
      var pool = GRAPH.filter(function (n) { return n.id !== 'edge'; });
      state.culprit = pool[Math.floor(Math.random() * pool.length)].id;

      state.self = {};
      GRAPH.forEach(function (n) {
        var jitter = 0.75 + Math.random() * 0.5;
        state.self[n.id] = Math.round(BASE[n.id] * jitter);
      });
      state.self[state.culprit] += 380 + Math.round(Math.random() * 520);

      state.total = {};
      GRAPH.forEach(function (n) { state.total[n.id] = totalFor(n.id); });

      state.picked = null;
      state.revealed = false;
      state.round++;
      readout();
      draw();
    }

    function pick(id) {
      if (state.revealed || !id) return;
      state.picked = id;
      state.revealed = true;
      if (id === state.culprit) { state.score++; state.streak++; state.best = Math.max(state.best, state.streak); }
      else state.streak = 0;
      readout();
      draw();
    }

    /** Show the answer without crediting it — giving up is not finding it. */
    function giveUp() {
      if (state.revealed) return;
      state.picked = null;
      state.revealed = true;
      state.streak = 0;
      readout();
      draw();
    }

    function readout() {
      if (el.round) el.round.textContent = String(state.round).padStart(2, '0');
      if (el.score) el.score.textContent = state.score + '/' + state.round;
      if (el.streak) el.streak.textContent = String(state.streak).padStart(2, '0');

      root.classList.toggle('is-revealed', state.revealed);
      root.classList.toggle('is-right', state.revealed && state.picked === state.culprit);
      root.classList.toggle('is-wrong', state.revealed && state.picked !== state.culprit);

      if (el.next) el.next.textContent = state.revealed ? 'Next trace' : 'Skip';

      if (!el.verdict) return;
      if (!state.revealed) {
        el.verdict.textContent = 'One service is spending the time. The rest are waiting on it.';
      } else if (state.picked === null) {
        el.verdict.textContent = byId[state.culprit].label + ' was spending the time; everything above it was waiting.';
      } else if (state.picked === state.culprit) {
        el.verdict.textContent = 'Right — ' + byId[state.culprit].label + ' is holding everything above it.';
      } else {
        el.verdict.textContent = byId[state.picked].label + ' was slow because it was waiting. ' +
                                 byId[state.culprit].label + ' is the one spending the time.';
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

    function layout(W, H) {
      var padX = 12, padY = 16;
      var cols = 5, rows = 3;
      var bw = Math.min(96, (W - padX * 2) / cols - 8);
      var bh = 34;
      var gapX = (W - padX * 2 - bw) / (cols - 1);
      var gapY = (H - padY * 2 - bh) / rows;

      boxes = GRAPH.map(function (n) {
        return {
          id: n.id, node: n,
          x: padX + n.col * gapX,
          y: padY + n.row * gapY,
          w: bw, h: bh
        };
      });
    }

    function boxOf(id) { for (var i = 0; i < boxes.length; i++) if (boxes[i].id === id) return boxes[i]; return null; }

    function onPath(id) {           // is this node an ancestor of the culprit?
      if (!state.culprit) return false;
      var seen = {};
      var walk = function (from) {
        if (from === state.culprit) return true;
        if (seen[from]) return false;
        seen[from] = 1;
        return byId[from].to.some(walk);
      };
      return walk(id);
    }

    function draw() {
      var rect = canvas.getBoundingClientRect();
      var dpr = canvas.width / rect.width || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var W = rect.width, H = rect.height;
      ctx.clearRect(0, 0, W, H);
      layout(W, H);

      /* edges */
      boxes.forEach(function (b) {
        b.node.to.forEach(function (cid) {
          var c = boxOf(cid);
          if (!c) return;
          var hot = state.revealed && onPath(b.id) && onPath(cid);
          ctx.strokeStyle = hot ? C.accent : C.line;
          ctx.globalAlpha = hot ? 0.8 : 1;
          ctx.lineWidth = hot ? 1.6 : 1;
          ctx.beginPath();
          ctx.moveTo(b.x + b.w, b.y + b.h / 2);
          ctx.bezierCurveTo(b.x + b.w + 18, b.y + b.h / 2, c.x - 18, c.y + c.h / 2, c.x, c.y + c.h / 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      });

      /* nodes */
      boxes.forEach(function (b) {
        var total = state.total[b.id] || 0;
        var slow = total > 260;
        var isCulprit = state.revealed && b.id === state.culprit;
        var isPick = state.revealed && state.picked !== null && b.id === state.picked && !isCulprit;
        var isHover = !state.revealed && hover === b.id;

        ctx.fillStyle = isCulprit ? C.accent : C.paper2;
        ctx.strokeStyle = isCulprit ? C.accent : isPick ? C.mute : isHover ? C.ink : (slow ? C.accent : C.line);
        ctx.lineWidth = isHover || isCulprit ? 1.8 : 1;
        ctx.globalAlpha = isPick ? 0.6 : 1;
        ctx.beginPath();
        ctx.rect(b.x + 0.5, b.y + 0.5, b.w, b.h);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = isCulprit ? C.paper : C.ink;
        ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(b.node.label, b.x + 7, b.y + 14);

        // the number a dashboard would show you: total, not self
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = isCulprit ? C.paper : slow ? C.accent : C.mute;
        var line = state.revealed
          ? Math.round(state.self[b.id]) + 'ms self'
          : Math.round(total) + 'ms';
        ctx.fillText(line, b.x + 7, b.y + 27);
      });
    }

    /* ---- input --------------------------------------------------------- */

    function hit(e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
      }
      return null;
    }

    canvas.addEventListener('pointermove', function (e) {
      var id = hit(e);
      if (id !== hover) { hover = id; draw(); }
      canvas.style.cursor = id && !state.revealed ? 'pointer' : 'default';
    });

    canvas.addEventListener('pointerleave', function () { hover = null; draw(); });
    canvas.addEventListener('pointerdown', function (e) { pick(hit(e)); });

    canvas.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      state.revealed ? deal() : pick(hover || 'gateway');
    });

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-t]');
      if (!btn) return;
      if (btn.getAttribute('data-t') === 'next') deal();
      if (btn.getAttribute('data-t') === 'reveal') giveUp();
    });

    /* ---- lifecycle ----------------------------------------------------- */

    function palette(d) {
      C.paper = d.paper; C.ink = d.ink; C.accent = d.accent; C.mute = d.mute; C.line = d.line;
      C.paper2 = window.CGTheme ? window.CGTheme.token('--paper-2', C.paper2) : C.paper2;
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

    resize();
    deal();
  }

  function boot() { document.querySelectorAll('[data-t-root]').forEach(init); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
