/* ============================================================================
   bucket.js — "Hold the line".

   A token bucket in front of a backend that has a hard ceiling. Traffic
   arrives; a request takes a token or it is shed. Two dials — how fast the
   bucket refills, and how much burst it can hold — and four traffic shapes
   that each punish a different wrong answer.

   The lesson the game is built around: shedding load is a feature. A bucket
   sized to absorb a short spike cannot absorb one that never ends, and past
   that point the only way to keep the backend alive is to say no.

   Repaints on cg:theme. Under reduced motion the round is computed in one
   step and drawn as a finished chart instead of played out frame by frame.
   ========================================================================= */

(function () {
  'use strict';

  var CEILING = 240;          // requests/s the backend survives
  var STEP = 1 / 40;          // simulation timestep, seconds

  /* Four shapes. `target` is the served fraction needed to pass — lower where
     the honest answer is to shed a lot. */
  var SCENES = [
    {
      name: 'Steady',
      dur: 9, target: 0.95,
      arrivals: function () { return 150; },
      lesson: 'Flat traffic under the ceiling. Refill at or above arrival and nothing needs shedding.'
    },
    {
      name: 'Short bursts',
      dur: 12, target: 0.90,
      arrivals: function (t) { return 140 + (t % 2 < 0.25 ? 400 : 0); },
      lesson: 'The spike fits under the ceiling if the bucket has room to hold it. With no capacity you shed traffic you could have served — this is what the bucket is for.'
    },
    {
      name: 'Sustained spike',
      dur: 12, target: 0.55,
      arrivals: function (t) { return (t > 3.5 && t < 8.5) ? 520 : 130; },
      lesson: 'No bucket is big enough for a spike that never ends. Keep refill under the ceiling and shed the rest — that is the whole point.'
    },
    {
      name: 'Ramp',
      dur: 12, target: 0.68,
      arrivals: function (t) { return 90 + t * 32; },
      lesson: 'Traffic that keeps climbing crosses any ceiling eventually. The bucket decides whether that is a shed or an outage.'
    }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function init(root) {
    var canvas = root.querySelector('canvas');
    if (!canvas) return;

    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) { root.remove(); return; }

    var el = {
      rate: root.querySelector('[data-b="rate"]'),
      cap: root.querySelector('[data-b="cap"]'),
      rateOut: root.querySelector('[data-b-rate]'),
      capOut: root.querySelector('[data-b-cap]'),
      run: root.querySelector('[data-b="run"]'),
      next: root.querySelector('[data-b="next"]'),
      scene: root.querySelector('[data-b-scene]'),
      served: root.querySelector('[data-b-served]'),
      over: root.querySelector('[data-b-over]'),
      verdict: root.querySelector('[data-b-verdict]')
    };
    if (!el.rate || !el.cap) return;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var C = { paper: '#0F1214', paper2: '#171B1E', ink: '#E9EDEF', accent: '#F2B33D', mute: '#7C878C' };

    var si = 0;                 // scenario index
    var W = 0, H = 0;           // css pixels
    var sim = null;
    var raf = 0;

    /* ── the simulation ─────────────────────────────────────────────── */

    var WIN = Math.round(1 / STEP);   // a one-second window

    function fresh() {
      return {
        t: 0,
        tokens: +el.cap.value,      // start full, the way a real bucket idles
        arrived: 0,
        served: 0,
        overloads: 0,
        wasOver: false,
        ring: [],                   // served counts over the last second
        ringSum: 0,
        sustained: 0,
        trace: [],                  // {t, arrival, served, sustained} per step
        done: false
      };
    }

    /** One timestep. Refill, admit what there are tokens for, shed the rest. */
    function advance(s) {
      var scene = SCENES[si];
      var R = +el.rate.value;
      var B = +el.cap.value;

      var arrivalRate = Math.max(0, scene.arrivals(s.t));
      var want = arrivalRate * STEP;

      /* Carry-over is what the bucket is allowed to hold; this step's refill is
         spendable as it lands. Capping before spending would mean a capacity of
         zero served nothing at all, when what it really means is "no burst
         allowance, pass at exactly the refill rate". */
      var avail = Math.min(B, s.tokens) + R * STEP;
      var got = Math.min(want, avail);

      s.tokens = Math.min(B, avail - got);
      s.arrived += want;
      s.served += got;

      var servedRate = got / STEP;

      /* A bucket exists to let bursts through, so the instantaneous rate is
         above refill by design — judging on it would mean every burst is an
         outage. What actually breaks a backend is sustained pressure, so the
         ceiling is checked against the last second of served traffic. */
      s.ring.push(got);
      s.ringSum += got;
      if (s.ring.length > WIN) s.ringSum -= s.ring.shift();
      s.sustained = s.ringSum / (s.ring.length * STEP);

      var over = s.ring.length >= WIN && s.sustained > CEILING;
      if (over && !s.wasOver) s.overloads++;
      s.wasOver = over;

      s.trace.push({ t: s.t, a: arrivalRate, s: servedRate, u: s.sustained });
      s.t += STEP;
      if (s.t >= scene.dur) s.done = true;
    }

    function runAll(s) { while (!s.done) advance(s); }

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

    function draw() {
      if (!sim) return;
      var scene = SCENES[si];
      var pad = 16;
      var chartH = Math.max(90, H * 0.58);
      var yMax = 700;                       // requests/s at the top of the chart

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.paper2;
      ctx.fillRect(0, 0, W, H);

      var x0 = pad, x1 = W - pad;
      var y0 = pad, y1 = pad + chartH;
      var sx = function (t) { return x0 + (t / scene.dur) * (x1 - x0); };
      var sy = function (v) { return y1 - clamp(v / yMax, 0, 1) * (y1 - y0); };

      // the ceiling the backend cannot be pushed past
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = C.accent;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, sy(CEILING)); ctx.lineTo(x1, sy(CEILING)); ctx.stroke();
      ctx.restore();

      ctx.font = '10px ' + (getComputedStyle(root).getPropertyValue('--mono') || 'monospace');
      ctx.fillStyle = C.accent;
      ctx.fillText('BACKEND CEILING ' + CEILING + '/s', x0 + 4, sy(CEILING) - 5);

      // arrivals: what the world is sending
      if (sim.trace.length > 1) {
        ctx.strokeStyle = C.mute;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        sim.trace.forEach(function (p, i) {
          if (i) ctx.lineTo(sx(p.t), sy(p.a)); else ctx.moveTo(sx(p.t), sy(p.a));
        });
        ctx.stroke();

        // served: what actually reached the backend, filled so the shed gap reads
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(sx(sim.trace[0].t), y1);
        sim.trace.forEach(function (p) { ctx.lineTo(sx(p.t), sy(p.s)); });
        ctx.lineTo(sx(sim.trace[sim.trace.length - 1].t), y1);
        ctx.closePath();
        ctx.fillStyle = C.accent;
        ctx.globalAlpha = 0.16;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        sim.trace.forEach(function (p, i) {
          if (i) ctx.lineTo(sx(p.t), sy(p.s)); else ctx.moveTo(sx(p.t), sy(p.s));
        });
        ctx.stroke();
      }

      // the sustained second, which is what the ceiling is measured against
      if (sim.trace.length > 1) {
        ctx.strokeStyle = C.ink;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.4;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        sim.trace.forEach(function (p, i) {
          if (i) ctx.lineTo(sx(p.t), sy(p.u || 0)); else ctx.moveTo(sx(p.t), sy(p.u || 0));
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // baseline + legend
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = C.mute;
      ctx.fillText('ARRIVING', x0 + 4, y0 + 12);
      ctx.fillStyle = C.accent;
      ctx.fillText('SERVED', x0 + 74, y0 + 12);
      ctx.fillStyle = C.ink;
      ctx.fillText('SUSTAINED 1s', x0 + 136, y0 + 12);

      /* ── the bucket, and the backend it protects ── */
      var by = y1 + 22;
      var bh = Math.max(26, H - by - 16);
      var bw = Math.min(30, W * 0.07);

      var B = +el.cap.value;
      var lvl = B > 0 ? clamp(sim.tokens / B, 0, 1) : 0;

      ctx.strokeStyle = C.mute; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, by + 0.5, bw, bh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.accent;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x0 + 1, by + 1 + (bh - 2) * (1 - lvl), bw - 2, (bh - 2) * lvl);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.mute;
      ctx.fillText('TOKENS', x0 + bw + 10, by + 12);
      ctx.fillStyle = C.ink;
      ctx.fillText(Math.round(sim.tokens) + ' / ' + B, x0 + bw + 10, by + 26);

      // shed share as a plain bar on the right
      var shed = sim.arrived > 0 ? 1 - sim.served / sim.arrived : 0;
      var rw = Math.min(150, W * 0.3);
      var rx = x1 - rw;
      ctx.fillStyle = C.mute;
      ctx.fillText('SHED ' + Math.round(shed * 100) + '%', rx, by + 12);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = C.mute;
      ctx.strokeRect(rx + 0.5, by + 20.5, rw, 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.mute;
      ctx.fillRect(rx + 1, by + 21, (rw - 2) * clamp(shed, 0, 1), 6);
    }

    /* ── round lifecycle ────────────────────────────────────────────── */

    function hud() {
      var scene = SCENES[si];
      if (el.scene) el.scene.textContent = (si + 1) + '/' + SCENES.length + ' ' + scene.name;
      if (el.served) {
        el.served.textContent = sim && sim.arrived > 0
          ? Math.round((sim.served / sim.arrived) * 100) + '%' : '--';
      }
      if (el.over) el.over.textContent = sim ? String(sim.overloads) : '0';
      if (el.rateOut) el.rateOut.textContent = el.rate.value;
      if (el.capOut) el.capOut.textContent = el.cap.value;
    }

    function say(text, right) {
      if (el.verdict) el.verdict.textContent = text;
      root.classList.toggle('is-right', right === true);
      root.classList.toggle('is-wrong', right === false);
    }

    function settle() {
      var scene = SCENES[si];
      var pct = sim.arrived > 0 ? sim.served / sim.arrived : 0;
      var held = sim.overloads === 0;
      var enough = pct >= scene.target;

      if (held && enough) {
        say('Held. ' + Math.round(pct * 100) + '% served, the backend never went over. ' + scene.lesson, true);
      } else if (!held) {
        say('The backend went over ' + sim.overloads + ' time' + (sim.overloads === 1 ? '' : 's') +
            '. Refill is letting more through than ' + CEILING + '/s. ' + scene.lesson, false);
      } else {
        say('Never overloaded, but only ' + Math.round(pct * 100) + '% served — this shape allows ' +
            Math.round(scene.target * 100) + '%. There is headroom you are not using. ' + scene.lesson, false);
      }
      hud();
    }

    function stop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }

    function play() {
      stop();
      sim = fresh();
      hud();
      say('Running ' + SCENES[si].name.toLowerCase() + '…');

      if (reduced) {                 // one step, finished chart, no animation
        runAll(sim);
        draw();
        settle();
        return;
      }

      var last = 0;
      var acc = 0;

      function frame(now) {
        if (!last) last = now;
        acc += Math.min(0.1, (now - last) / 1000);
        last = now;

        while (acc >= STEP && !sim.done) { advance(sim); acc -= STEP; }

        draw();
        hud();

        if (sim.done) { raf = 0; settle(); return; }
        raf = window.requestAnimationFrame(frame);
      }

      raf = window.requestAnimationFrame(frame);
    }

    function load(i) {
      stop();
      si = ((i % SCENES.length) + SCENES.length) % SCENES.length;
      sim = fresh();
      runAll(sim);                   // show the shape before it is played
      sim = fresh();
      hud();
      say(SCENES[si].name + '. Set the dials, then run it.');
      draw();
    }

    /* ── wiring ─────────────────────────────────────────────────────── */

    root.addEventListener('input', function (e) {
      if (!e.target.matches('[data-b="rate"], [data-b="cap"]')) return;
      hud();
      if (!raf) { sim = fresh(); draw(); }     // preview the new bucket at rest
    });

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-b]');
      if (!btn) return;
      if (btn.getAttribute('data-b') === 'run') play();
      if (btn.getAttribute('data-b') === 'next') load(si + 1);
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

    load(0);
    resize();
  }

  var root = document.querySelector('[data-b-root]');
  if (root) init(root);
})();
