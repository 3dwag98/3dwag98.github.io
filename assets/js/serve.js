/* ============================================================================
   serve.js — "You are the server".

   Requests drop in. Click each one before its bar runs out. It gets faster,
   and it keeps getting faster, and at some point you cannot click quickly
   enough — which is the entire point. Nobody needs to know what a token
   bucket is to feel that.

   When the round ends the two things that actually fix it are offered: a cache
   that answers the repeats before they reach you, and a second machine that
   takes half the rest. Play it again with either and the same load is fine.

   Repaints on cg:theme. Reduced motion gets the argument as a still diagram
   rather than a timed game.
   ========================================================================= */

(function () {
  'use strict';

  var LIFE = 2700;          // ms a request waits before it gives up
  var ROUND = 26000;        // ms a full round lasts
  var LOSE = 10;            // dropped requests that end it early

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function init(root) {
    var canvas = root.querySelector('canvas');
    if (!canvas) return;

    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) { root.remove(); return; }

    var el = {
      start: root.querySelector('[data-s="start"]'),
      cache: root.querySelector('[data-s="cache"]'),
      replica: root.querySelector('[data-s="replica"]'),
      served: root.querySelector('[data-s-served]'),
      dropped: root.querySelector('[data-s-dropped]'),
      rate: root.querySelector('[data-s-rate]'),
      verdict: root.querySelector('[data-s-verdict]'),
      helpers: root.querySelector('[data-s-helpers]')
    };

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var C = { paper: '#0A0B0A', paper2: '#131614', ink: '#F4F6F2', accent: '#C6F24E', mute: '#858C80' };

    var W = 0, H = 0, raf = 0;
    var useCache = false, useReplica = false;
    var st = null;

    /* ── state ──────────────────────────────────────────────────────── */

    function fresh() {
      return {
        t: 0, spawn: 0, next: 700,
        pending: [], flashes: [],
        served: 0, dropped: 0, cached: 0, byReplica: 0,
        replicaAt: 0, over: false, playing: true
      };
    }

    /** Arrivals per second at time t — starts gentle, does not stay that way. */
    function rateAt(t) { return 1.4 + (t / 1000) * 0.42; }

    function tile(i) {
      var cols = Math.max(3, Math.floor(W / 108));
      var cw = (W - 16) / cols, ch = 54;
      return { x: 8 + (i % cols) * cw, y: 10 + Math.floor(i / cols) * ch, w: cw - 8, h: ch - 10 };
    }

    /* ── simulation ─────────────────────────────────────────────────── */

    function step(dt) {
      var s = st;
      s.t += dt;
      s.spawn += dt;

      if (s.t >= ROUND) { finish('time'); return; }

      if (s.spawn >= s.next) {
        s.spawn = 0;
        s.next = 1000 / rateAt(s.t);

        // a cache answers the repeats before they ever reach you
        if (useCache && Math.random() < 0.45) {
          s.cached++; s.served++;
          s.flashes.push({ life: 320, max: 320 });
        } else if (s.pending.length < 42) {
          s.pending.push({ left: LIFE });
        }
      }

      // the second machine works steadily through the oldest first
      if (useReplica) {
        s.replicaAt += dt;
        if (s.replicaAt >= 620 && s.pending.length) {
          s.replicaAt = 0;
          s.pending.shift();
          s.served++; s.byReplica++;
        }
      }

      for (var i = s.pending.length - 1; i >= 0; i--) {
        s.pending[i].left -= dt;
        if (s.pending[i].left <= 0) { s.pending.splice(i, 1); s.dropped++; }
      }

      for (var f = s.flashes.length - 1; f >= 0; f--) {
        s.flashes[f].life -= dt;
        if (s.flashes[f].life <= 0) s.flashes.splice(f, 1);
      }

      if (s.dropped >= LOSE) finish('dropped');
    }

    /* ── drawing ────────────────────────────────────────────────────── */

    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function mono() {
      return (getComputedStyle(root).getPropertyValue('--mono') || 'monospace').trim();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.paper2;
      ctx.fillRect(0, 0, W, H);

      if (reduced) { drawStill(); return; }
      if (!st) { drawIdle(); return; }

      var s = st;

      s.pending.forEach(function (req, i) {
        var t = tile(i);
        if (t.y + t.h > H - 4) return;                 // past the board, not drawn
        var life = clamp(req.left / LIFE, 0, 1);
        var urgent = life < 0.34;

        ctx.strokeStyle = urgent ? C.accent : C.mute;
        ctx.globalAlpha = urgent ? 0.95 : 0.55;
        ctx.lineWidth = urgent ? 1.6 : 1;
        ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w, t.h);

        // the bar running out is the whole clock
        ctx.globalAlpha = 1;
        ctx.fillStyle = urgent ? C.accent : C.ink;
        ctx.fillRect(t.x + 1, t.y + t.h - 4, (t.w - 2) * life, 3);

        ctx.globalAlpha = 0.8;
        ctx.fillStyle = C.ink;
        ctx.font = '10px ' + mono();
        ctx.fillText('GET /', t.x + 8, t.y + 20);
      });

      // cache hits, answered without you
      s.flashes.forEach(function (f, i) {
        var a = f.life / f.max;
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = C.accent;
        ctx.fillRect(W - 92, H - 26 - i * 7, 84 * a, 3);
      });

      ctx.globalAlpha = 1;
      ctx.font = '10px ' + mono();
      ctx.fillStyle = C.mute;
      if (useCache) ctx.fillText('CACHE HIT', W - 92, H - 32);

      if (s.over) {
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = C.paper2;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.ink;
        ctx.font = '600 22px ' + (getComputedStyle(root).getPropertyValue('--serif') || 'serif').trim();
        ctx.textAlign = 'center';
        ctx.fillText(s.dropped >= LOSE ? 'Dropped.' : 'You held on.', W / 2, H / 2);
        ctx.textAlign = 'left';
      }
    }

    function drawIdle() {
      ctx.fillStyle = C.mute;
      ctx.font = '11px ' + mono();
      ctx.textAlign = 'center';
      ctx.fillText('PRESS START', W / 2, H / 2);
      ctx.textAlign = 'left';
    }

    /** Reduced motion: the same argument, held still. */
    function drawStill() {
      var pad = 18, colW = (W - pad * 2) / 3;
      var rows = [['ONE MACHINE', 0.34], ['+ CACHE', 0.68], ['+ SECOND MACHINE', 1]];
      ctx.font = '10px ' + mono();
      rows.forEach(function (r, i) {
        var x = pad + i * colW;
        ctx.fillStyle = C.mute;
        ctx.fillText(r[0], x, 24);
        ctx.strokeStyle = C.mute;
        ctx.globalAlpha = 0.4;
        ctx.strokeRect(x + 0.5, 34.5, colW - 18, H - 70);
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.accent;
        var h = (H - 74) * r[1];
        ctx.fillRect(x + 2, 36 + (H - 74) - h, colW - 22, h);
      });
      ctx.fillStyle = C.mute;
      ctx.fillText('SHARE OF THE SAME LOAD SERVED', pad, H - 12);
    }

    /* ── round lifecycle ────────────────────────────────────────────── */

    function hud() {
      if (!st) return;
      if (el.served) el.served.textContent = String(st.served);
      if (el.dropped) el.dropped.textContent = String(st.dropped);
      if (el.rate) el.rate.textContent = rateAt(st.t).toFixed(1) + '/s';
    }

    function say(text, good) {
      if (el.verdict) el.verdict.textContent = text;
      root.classList.toggle('is-right', good === true);
      root.classList.toggle('is-wrong', good === false);
    }

    function finish(why) {
      st.over = true; st.playing = false;
      stop();
      hud();
      draw();

      var helped = useCache || useReplica;

      if (why === 'dropped') {
        say('You dropped ' + st.dropped + ' of them at ' + rateAt(st.t).toFixed(1) +
            ' requests a second. Clicking faster was never going to be the fix — ' +
            'one machine has a ceiling, and the load does not care.', false);
      } else if (helped) {
        say('Held the whole round: ' + st.served + ' served, ' + st.dropped + ' dropped. ' +
            (useCache ? 'The cache answered ' + st.cached + ' before they reached you. ' : '') +
            (useReplica ? 'The second machine took ' + st.byReplica + '. ' : '') +
            'Same load, same you — different architecture.', true);
      } else {
        say('You survived the round on one machine: ' + st.served + ' served, ' +
            st.dropped + ' dropped. Now turn something on and see how much easier it gets.', true);
      }

      if (el.helpers) el.helpers.hidden = false;
    }

    function stop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }

    function play() {
      stop();
      st = fresh();
      hud();
      say('Click each request before its bar runs out.');
      if (el.helpers) el.helpers.hidden = (useCache || useReplica) ? false : true;

      var last = 0;
      raf = window.requestAnimationFrame(function frame(now) {
        if (!last) last = now;
        var dt = Math.min(64, now - last);
        last = now;

        step(dt);
        if (!st.playing) return;
        draw();
        hud();
        raf = window.requestAnimationFrame(frame);
      });
    }

    /* ── input ──────────────────────────────────────────────────────── */

    canvas.addEventListener('pointerdown', function (e) {
      if (!st || !st.playing) return;
      var r = canvas.getBoundingClientRect();
      var px = e.clientX - r.left, py = e.clientY - r.top;

      for (var i = 0; i < st.pending.length; i++) {
        var t = tile(i);
        if (px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h) {
          st.pending.splice(i, 1);
          st.served++;
          hud();
          return;
        }
      }
    });

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-s]');
      if (!btn) return;
      var what = btn.getAttribute('data-s');

      if (what === 'start') { play(); return; }

      if (what === 'cache') useCache = !useCache;
      if (what === 'replica') useReplica = !useReplica;
      btn.setAttribute('aria-pressed', String(what === 'cache' ? useCache : useReplica));
      play();
    });

    function palette(d) {
      if (!d) return;
      if (d.paper) C.paper = d.paper;
      if (d.ink) C.ink = d.ink;
      if (d.accent) C.accent = d.accent;
      if (d.mute) C.mute = d.mute;
      C.paper2 = window.CGTheme ? window.CGTheme.token('--paper-2', C.paper2) : C.paper2;
      draw();
    }

    window.addEventListener('cg:theme', function (e) { palette(e.detail); });
    if (window.CGTheme) {
      palette({
        paper: window.CGTheme.token('--paper'), ink: window.CGTheme.token('--ink'),
        accent: window.CGTheme.token('--accent'), mute: window.CGTheme.token('--mute')
      });
    }

    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 180); });

    if (reduced) {
      say('The timed version needs motion, so here is the shape of it instead: the same ' +
          'arrival rate, served three ways.');
      if (el.start) el.start.disabled = true;
      if (el.helpers) el.helpers.hidden = false;
    }

    resize();
  }

  var root = document.querySelector('[data-s-root]');
  if (root) init(root);
})();
