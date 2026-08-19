/* ============================================================================
   home.js — the scenes.

     masthead   WebGL surface + masked name, pulled apart on scroll
     plates     every image: clip reveal, then parallax inside its own frame
     statement  a paragraph that lights word by word as it passes
     quote      pinned. The page inverts to night while the two halves of the
                line slide past each other while one node accretes into the
                system it became.
     work       roles stack — each sticks while the next slides over it
     guide      pinned crossfade through the plates on a wide screen; a plain
                vertical list below that, so every image is reachable anywhere
     blogs      latest entries from blog/posts.json
   ========================================================================= */

(function () {
  'use strict';

  var CG = window.CG || {};
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var motion = CG.motion && !!ST;

  /* The quote passage flips the page to the opposite theme. Both palettes are
     declared here so the flip can be interpolated rather than switched. */
  var PALETTES = {
    dark: {
      '--paper': '#14120F', '--paper-2': '#1C1915', '--ink': '#F2EDE3',
      '--ink-2': '#C9C2B4', '--mute': '#8A8377', '--line': 'rgba(242,237,227,0.16)',
      '--accent': '#FF5A2B', '--on-accent': '#17140F'
    },
    light: {
      '--paper': '#EFEAE1', '--paper-2': '#E6E0D3', '--ink': '#14120F',
      '--ink-2': '#3E3A32', '--mute': '#7C7568', '--line': 'rgba(20,18,15,0.15)',
      '--accent': '#E4441A', '--on-accent': '#FBF7F0'
    }
  };

  var KEYS = Object.keys(PALETTES.dark);

  function base() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }

  function paint(mix) {
    var root = document.documentElement;
    var from = PALETTES[base()];
    var to = PALETTES[base() === 'light' ? 'dark' : 'light'];

    if (mix <= 0.001) {
      KEYS.forEach(function (k) { root.style.removeProperty(k); });
      root.classList.remove('is-inverted');
      return;
    }

    KEYS.forEach(function (k) {
      root.style.setProperty(k, gsap.utils.interpolate(from[k], to[k], mix));
    });
    root.classList.toggle('is-inverted', mix > 0.5);
  }

  /* ── the surface behind the masthead ───────────────────────────────── */

  function surface() {
    var canvas = document.querySelector('.mast__gl');
    if (!canvas) return;

    if (!window.CGSurface) { canvas.remove(); return; }

    var read = function () {
      var t = window.CGTheme;
      return {
        paper: t ? t.token('--paper', '#14120F') : '#14120F',
        ink: t ? t.token('--ink', '#F2EDE3') : '#F2EDE3',
        accent: t ? t.token('--accent', '#FF5A2B') : '#FF5A2B'
      };
    };

    var s = window.CGSurface(canvas, read());
    if (!s) { canvas.remove(); return; }

    window.addEventListener('cg:theme', function (e) {
      s.setPalette({ paper: e.detail.paper, ink: e.detail.ink, accent: e.detail.accent });
      if (!motion) still();
    });

    /* Reduced motion asks for no movement, not for no ground. Draw the field
       once and hold it there — repainted only when the theme or the size of
       the canvas actually changes. */
    function still() { s.resize(); s.frame(0); }

    if (!motion) {
      s.frame(2.4);                       // settle somewhere worth looking at
      canvas.classList.add('is-live');
      var rt;
      window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(still, 160); });
      return;
    }

    var live = true;
    var last = 0;

    gsap.ticker.add(function (time) {
      if (!live) return;
      var dt = Math.min(0.05, time - last);
      last = time;
      s.frame(dt);
    });

    requestAnimationFrame(function () { canvas.classList.add('is-live'); });

    var mast = document.querySelector('.mast');
    ST.create({
      trigger: mast,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: function (self) { live = self.isActive; },
      onUpdate: function (self) { s.setScroll(self.progress); }
    });

    window.addEventListener('mousemove', function (e) {
      s.setPointer((e.clientX / window.innerWidth - 0.5) * (window.innerWidth / window.innerHeight),
                   (0.5 - e.clientY / window.innerHeight));
    }, { passive: true });

    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(s.resize, 160); });
  }

  /* ── images ────────────────────────────────────────────────────────── */

  function plates() {
    var frames = Array.prototype.slice.call(document.querySelectorAll('.plate'));
    if (!frames.length) return;

    if (!motion) {
      frames.forEach(function (f) {
        f.classList.remove('plate--reveal');
        var img = f.querySelector('img');
        if (img) img.style.transform = 'scale(1)';
      });
      return;
    }

    frames.forEach(function (frame) {
      var img = frame.querySelector('img');

      gsap.fromTo(frame,
        { clipPath: 'inset(0% 0% 100% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 1.5,
          ease: 'expo.out',
          scrollTrigger: { trigger: frame, start: 'top 88%', once: true }
        });

      // Vertical parallax only where the frame actually travels vertically —
      // inside the pinned gallery it does not.
      if (img && frame.hasAttribute('data-parallax')) {
        gsap.fromTo(img, { yPercent: -6 }, {
          yPercent: 6,
          ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
        });
      }
    });
  }

  /* ── masthead ──────────────────────────────────────────────────────── */

  function masthead() {
    var el = document.querySelector('.mast');
    if (!el || !motion) return;

    var lines = el.querySelectorAll('.mast__name .ln');

    gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 0.6 } })
      .to(lines[0], { xPercent: -12, opacity: 0, ease: 'none' }, 0)
      .to(lines[1], { xPercent: 10, opacity: 0, ease: 'none' }, 0)
      .to('.mast__foot', { yPercent: 45, opacity: 0, ease: 'none' }, 0)
      .to('.mast__top', { opacity: 0, ease: 'none', duration: 0.4 }, 0);
  }

  /* ── statement ─────────────────────────────────────────────────────── */

  function statement() {
    var el = document.querySelector('[data-words]');
    if (!el || !motion || !CG.splitWords) return;

    var words = CG.splitWords(el);
    if (!words.length) return;

    gsap.to(words, {
      opacity: 1,
      ease: 'none',
      stagger: 0.6,
      scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 60%', scrub: 0.5 }
    });
  }

  /* ── quote ─────────────────────────────────────────────────────────── */

  function quote() {
    var el = document.querySelector('.quote');
    if (!el) return;

    var a = el.querySelector('.quote__line--a');
    var b = el.querySelector('.quote__line--b');
    var pivot = el.querySelector('.quote__pivot');
    var resolve = el.querySelector('.quote__resolve');
    var edges = el.querySelector('#sig-edges');
    var nodes = el.querySelector('#sig-nodes');
    var seed = el.querySelector('#sig-seed');
    var dots = [];

    // One node on the right; to its left, the system it turned into. Columns
    // get denser and the links cross more as they go — built right to left,
    // the direction the sentence reads backwards through.
    if (edges && nodes) {
      var COLS = [
        { x: 1355, n: 1 }, { x: 1180, n: 1 }, { x: 1010, n: 2 }, { x: 845, n: 3 },
        { x: 670, n: 4 }, { x: 480, n: 6 }, { x: 265, n: 7 }, { x: 55, n: 9 }
      ];

      var rnd = (function (seedv) {
        return function () { seedv = (seedv * 16807) % 2147483647; return seedv / 2147483647; };
      })(20260819);

      var grid = COLS.map(function (col, ci) {
        var pts = [];
        // fan out toward the left, but stay inside the 120-unit box
        var spread = Math.min(50, 5 + (col.n - 1) * 7.5);
        for (var i = 0; i < col.n; i++) {
          var t = col.n === 1 ? 0.5 : i / (col.n - 1);
          pts.push({
            x: col.x + (ci === 0 ? 0 : (rnd() - 0.5) * 46),
            y: 60 + (t - 0.5) * spread * 2 + (rnd() - 0.5) * 7
          });
        }
        return pts;
      });

      var d = '';
      for (var c = 1; c < grid.length; c++) {
        grid[c].forEach(function (p, i) {
          var prev = grid[c - 1];
          var a = prev[Math.min(prev.length - 1, Math.floor(i * prev.length / grid[c].length))];
          d += 'M' + a.x.toFixed(1) + ',' + a.y.toFixed(1) + ' L' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' ';
          // a second, crossing link so the field reads as a network rather
          // than a ladder
          if (prev.length > 1 && rnd() < 0.7) {
            var b = prev[Math.floor(rnd() * prev.length)];
            d += 'M' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ' L' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' ';
          }
        });
      }
      edges.setAttribute('d', d.trim());

      var ns = 'http://www.w3.org/2000/svg';
      grid.slice(1).forEach(function (col, ci) {
        col.forEach(function (p) {
          var c2 = document.createElementNS(ns, 'circle');
          c2.setAttribute('cx', p.x.toFixed(1));
          c2.setAttribute('cy', p.y.toFixed(1));
          c2.setAttribute('r', (2.4 + ci * 0.28).toFixed(2));
          nodes.appendChild(c2);
          dots.push(c2);
        });
      });
    }

    if (!motion) { el.classList.add('night'); return; }

    if (edges) {
      var len = edges.getTotalLength();
      edges.style.strokeDasharray = len;
      edges.style.strokeDashoffset = len;
    }
    gsap.set(dots, { scale: 0, transformOrigin: '50% 50%' });
    gsap.set(seed, { scale: 0, transformOrigin: '50% 50%' });

    gsap.set([a, b], { opacity: 0 });
    gsap.set(pivot, { opacity: 0, scaleX: 0.2 });
    gsap.set(resolve, { opacity: 0, y: 20 });

    // Default refresh priority on purpose: this has to be measured after the
    // pin below has added its spacing, or the range ends mid-passage.
    ST.create({
      trigger: el,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: function (self) {
        var p = self.progress;
        var mix = p < 0.28 ? gsap.utils.clamp(0, 1, (p - 0.08) / 0.2)
                : p > 0.72 ? gsap.utils.clamp(0, 1, (0.92 - p) / 0.2)
                : 1;
        paint(mix);
      },
      onLeave: function () { paint(0); },
      onLeaveBack: function () { paint(0); }
    });

    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: el,
        start: 'top top',
        end: '+=320%',
        pin: '.quote__pin',
        scrub: 0.65,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        refreshPriority: 20
      }
    })
      .fromTo(a, { xPercent: -18, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.26 }, 0.02)
      .to(seed, { scale: 1, duration: 0.06, ease: 'back.out(3)' }, 0.1)
      .to(pivot, { opacity: 1, scaleX: 1, duration: 0.1, ease: 'back.out(2)' }, 0.3)
      .fromTo(b, { xPercent: 18, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.26 }, 0.36)
      .to(edges, { strokeDashoffset: 0, duration: 0.26 }, 0.4)
      .to(dots, { scale: 1, duration: 0.2, stagger: { each: 0.004, from: 'end' }, ease: 'back.out(2)' }, 0.44)
      // the complexity dominates for a moment...
      .to(b, { opacity: 0.16, duration: 0.1 }, 0.6)
      .to(seed, { opacity: 0.2, duration: 0.1 }, 0.6)
      // ...then the simple system it grew from is what the line is about
      .to(b, { opacity: 1, duration: 0.1 }, 0.72)
      .to(seed, { opacity: 1, scale: 1.5, duration: 0.1 }, 0.72)
      .to(a, { opacity: 0.28, duration: 0.1 }, 0.72)
      .to([edges, nodes], { opacity: 0.34, duration: 0.1 }, 0.72)
      .to(resolve, { opacity: 1, y: 0, duration: 0.12, ease: 'expo.out' }, 0.82)
      .to({}, { duration: 0.1 });
  }

  /* ── work: stacked role cards ──────────────────────────────────────── */

  function work() {
    var roles = Array.prototype.slice.call(document.querySelectorAll('.role'));
    if (roles.length < 2 || !motion) return;

    gsap.matchMedia().add('(min-width: 1024px)', function () {
      var tweens = roles.slice(0, -1).map(function (role, i) {
        return gsap.to(role, {
          scale: 0.94,
          opacity: 0.22,
          ease: 'none',
          scrollTrigger: {
            trigger: roles[i + 1],
            start: 'top bottom',
            end: 'top top',
            scrub: true,
            invalidateOnRefresh: true
          }
        });
      });

      return function () {
        tweens.forEach(function (t) { t.scrollTrigger && t.scrollTrigger.kill(); t.kill(); });
        gsap.set(roles, { clearProps: 'scale,opacity' });
      };
    });
  }

  /* ── guide: crossfade through the plates ───────────────────────────── */

  function guide() {
    var section = document.querySelector('.guide');
    var items = Array.prototype.slice.call(document.querySelectorAll('.guide__item'));
    if (!section || items.length < 2 || !motion) return;

    // Only above the breakpoint where the CSS stacks them absolutely; below it
    // they are an ordinary vertical list and need no help.
    gsap.matchMedia().add('(min-width: 900px)', function () {
      gsap.set(items, { opacity: 0 });
      gsap.set(items[0], { opacity: 1 });

      var tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=' + (items.length * 78) + '%',
          pin: '.guide__pin',
          scrub: 0.55,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          refreshPriority: 10
        }
      });

      items.forEach(function (item, i) {
        if (i === 0) return;
        tl.to(items[i - 1], { opacity: 0, scale: 0.985, duration: 0.34 }, i - 0.34)
          .fromTo(item, { opacity: 0, scale: 1.02 }, { opacity: 1, scale: 1, duration: 0.34 }, i - 0.34);
      });

      tl.to({}, { duration: 0.35 });

      return function () {
        tl.scrollTrigger && tl.scrollTrigger.kill();
        tl.kill();
        gsap.set(items, { clearProps: 'opacity,scale' });
      };
    });
  }

  /* ── nav over dark grounds ─────────────────────────────────────────── */

  function navTheme() {
    var nav = document.querySelector('.nav');
    if (!nav || !motion) return;

    document.querySelectorAll('[data-dark]').forEach(function (band) {
      ST.create({
        trigger: band,
        start: 'top 56px',
        end: 'bottom 56px',
        onToggle: function (self) { nav.classList.toggle('is-inverted', self.isActive); }
      });
    });
  }

  /* ── the request path draws itself as the stack scrolls ────────────── */

  function instPath() {
    var path = document.getElementById('inst-path');
    var section = document.getElementById('stack');
    if (!path || !section || !motion) return;

    var len = path.getTotalLength();
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });

    gsap.to(path, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top 78%',
        end: 'top 24%',
        scrub: 0.6,
        invalidateOnRefresh: true
      }
    });
  }

  /* ── blogs ──────────────────────────────────────────────────────────── */

  function blogs() {
    var list = document.querySelector('[data-blogs]');
    if (!list || !window.CGPosts) return;

    var limit = parseInt(list.getAttribute('data-blogs') || '3', 10);

    window.CGPosts.load('blog/')
      .then(function (posts) {
        if (!posts.length) throw new Error('empty');
        list.innerHTML = posts.slice(0, limit).map(window.CGPosts.rowHTML).join('');
        if (CG.reveal) CG.reveal(list);
        if (ST) ST.refresh();
      })
      .catch(function () {
        list.innerHTML = '<p class="blogs__empty">The index could not be read here. ' +
          '<a class="lbl lbl--acc" href="blog/">Open the archive &rarr;</a></p>';
      });
  }

  /* ── go ────────────────────────────────────────────────────────────── */

  function boot() {
    surface();
    plates();
    masthead();
    statement();
    quote();
    work();
    guide();
    navTheme();
    instPath();
    blogs();
    if (ST) ST.refresh();
  }

  if (CG.onReady) CG.onReady(boot);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
