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
      '--paper': '#0A0B0A', '--paper-2': '#131614', '--ink': '#F4F6F2',
      '--ink-2': '#C2C8BE', '--mute': '#858C80', '--line': 'rgba(244,246,242,0.15)',
      '--accent': '#C6F24E', '--on-accent': '#0A0B0A'
    },
    light: {
      '--paper': '#F4F4EF', '--paper-2': '#E6E7DF', '--ink': '#0A0B0A',
      '--ink-2': '#3A3E38', '--mute': '#5E6359', '--line': 'rgba(10,11,10,0.15)',
      '--accent': '#4A6606', '--on-accent': '#F7F8F3'
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
        paper: t ? t.token('--paper', '#0A0B0A') : '#0A0B0A',
        ink: t ? t.token('--ink', '#F4F6F2') : '#F4F6F2',
        accent: t ? t.token('--accent', '#C6F24E') : '#C6F24E'
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

    // The masks, not the inner lines: revealLines owns yPercent on those, and
    // these two names have to be free to travel sideways independently.
    var masks = el.querySelectorAll('.mast__name .ln__i-mask');
    var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 0.6 } });

    if (masks[0]) tl.to(masks[0], { xPercent: -12, opacity: 0, ease: 'none' }, 0);
    if (masks[1]) tl.to(masks[1], { xPercent: 10, opacity: 0, ease: 'none' }, 0);

    tl.to('.mast__foot', { yPercent: 45, opacity: 0, ease: 'none' }, 0)
      .to('.mast__say', { yPercent: -20, opacity: 0, ease: 'none', duration: 0.5 }, 0);
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

    /* One node on the right; to its left, the system it turned into.
       Laid out in the element's own pixels and re-laid on resize, rather than
       drawn into a fixed viewBox and stretched to fit — a stretched box is
       what turned the nodes into ellipses and pulled the whole figure thin. */
    var svg = el.querySelector('.quote__signal');

    function layout() {
      if (!edges || !nodes || !svg) return;

      var r = svg.getBoundingClientRect();
      var W = Math.max(320, Math.round(r.width));
      var H = Math.max(120, Math.round(r.height));
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

      // eight columns right to left, getting denser as they go
      var SHAPE = [1, 1, 2, 3, 4, 6, 7, 9];
      var m = Math.min(46, W * 0.035);              // margin at either end
      var mid = H / 2;

      var rnd = (function (seedv) {
        return function () { seedv = (seedv * 16807) % 2147483647; return seedv / 2147483647; };
      })(20260819);

      var grid = SHAPE.map(function (n, ci) {
        var pts = [];
        var x = W - m - (ci / (SHAPE.length - 1)) * (W - m * 2);
        // spread scales with the box, so the figure keeps its proportions
        var spread = Math.min(H * 0.42, H * 0.05 + (n - 1) * H * 0.062);
        for (var i = 0; i < n; i++) {
          var t = n === 1 ? 0.5 : i / (n - 1);
          pts.push({
            x: x + (ci === 0 ? 0 : (rnd() - 0.5) * W * 0.032),
            y: mid + (t - 0.5) * spread * 2 + (rnd() - 0.5) * H * 0.05
          });
        }
        return pts;
      });

      var d = '';
      for (var c = 1; c < grid.length; c++) {
        grid[c].forEach(function (pt, i) {
          var prev = grid[c - 1];
          var q = prev[Math.min(prev.length - 1, Math.floor(i * prev.length / grid[c].length))];
          d += 'M' + q.x.toFixed(1) + ',' + q.y.toFixed(1) + ' L' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
          if (prev.length > 1 && rnd() < 0.7) {
            var q2 = prev[Math.floor(rnd() * prev.length)];
            d += 'M' + q2.x.toFixed(1) + ',' + q2.y.toFixed(1) + ' L' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
          }
        });
      }
      edges.setAttribute('d', d.trim());

      // nodes are real circles now, because nothing is being scaled
      var ns = 'http://www.w3.org/2000/svg';
      nodes.textContent = '';
      dots.length = 0;
      var rBase = Math.max(3, Math.min(6.5, H * 0.026));
      grid.slice(1).forEach(function (col, ci) {
        col.forEach(function (pt) {
          var c2 = document.createElementNS(ns, 'circle');
          c2.setAttribute('cx', pt.x.toFixed(1));
          c2.setAttribute('cy', pt.y.toFixed(1));
          c2.setAttribute('r', (rBase + ci * rBase * 0.13).toFixed(2));
          nodes.appendChild(c2);
          dots.push(c2);
        });
      });

      if (seed) {
        seed.setAttribute('cx', String(W - m));
        seed.setAttribute('cy', String(mid));
        seed.setAttribute('r', (rBase * 1.9).toFixed(2));
      }
    }

    layout();

    var lt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(lt);
      lt = setTimeout(function () {
        layout();
        if (edges) {
          var l = edges.getTotalLength();
          edges.style.strokeDasharray = l;
        }
        if (ST) ST.refresh();
      }, 180);
    });

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
      .to([edges, nodes], { opacity: 0.7, duration: 0.1 }, 0.72)
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
          // pushed back in z with a touch of tilt, so the card behind actually
          // recedes instead of just getting smaller
          scale: 0.94,
          z: -180,
          rotateX: 5,
          opacity: 0.22,
          ease: 'none',
          scrollTrigger: {
            trigger: roles[i + 1],
            start: 'top bottom',
            end: 'top top',
            /* A catch-up, like every other scene here. scrub: true pins the
               tween to the raw scroll position, which under smoothed scroll
               is the one thing on the page moving without any easing at all —
               next to its neighbours it read as the harder of the two. */
            scrub: 0.6,
            invalidateOnRefresh: true
          }
        });
      });

      return function () {
        tweens.forEach(function (t) { t.scrollTrigger && t.scrollTrigger.kill(); t.kill(); });
        gsap.set(roles, { clearProps: 'scale,opacity,rotateX,z' });
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
        list.removeAttribute('aria-busy');    // the placeholder rows go with it
        list.innerHTML = posts.slice(0, limit).map(window.CGPosts.rowHTML).join('');
        if (CG.reveal) CG.reveal(list);
        if (ST) ST.refresh();
      })
      .catch(function () {
        list.removeAttribute('aria-busy');
        list.innerHTML = '<p class="blogs__empty">The index could not be read here. ' +
          '<a class="lbl lbl--acc" href="blog/">Open the archive &rarr;</a></p>';
      });
  }

  /* ── the name and the header wordmark ──────────────────────────────── */

  /* The hero sets the name at fifteen rem and the header sets it again at one,
     so at the top of the page it is the same two words twice on one screen.
     Three ways of resolving that, all scrubbed over the same stretch of scroll
     and all leaving the header holding its own real wordmark at the end:

       travel  the hero's copy leaves the page and flies into the header,
               closing from two lines onto one and retuning through the
               variable font's optical sizes on the way
       wipe    nothing moves. The hero's copy scrolls away as ordinary page
               content and the header's own copy is uncovered left to right,
               as though it had been set there all along
       rise    an exchange through one slot: the hero's copy climbs out behind
               the header while the header's copy comes up into place under it

     wipe is what ships. It is the only one of the three that says what is
     actually happening — the header has always had this name, and the hero is
     simply no longer covering it — and the only one that costs the scroll
     nothing: no stand-in element, no per-frame measuring, no handover to get
     wrong. travel and rise are kept because the switch is one word and they
     cost nothing while unused.

     Set here; the preview build flips it from sessionStorage so the three can
     be compared on the same page without a rebuild. */
  var MARK_MODE = 'wipe';

  function markMode() {
    try { return window.sessionStorage.getItem('cg:markMode') || MARK_MODE; }
    catch (e) { return MARK_MODE; }
  }

  function heroMark() {
    var hero = document.querySelector('.mast__name');
    var mark = document.querySelector('.nav__mark');

    /* The stylesheet holds the wordmark covered before first paint, which only
       one of these can then take over. Anything that stops that happening has
       to give it back, or the header is left permanently blank. */
    function release() { if (mark) mark.classList.remove('nav__mark--hold'); }

    if (!hero || !mark || !motion || !ST) { release(); return; }

    var to = [mark.querySelector('[data-mark="a"]'), mark.querySelector('[data-mark="b"]')];
    if (!to[0] || !to[1]) { release(); return; }

    /* A scene is taking it over, so the document head's fallback stands down —
       left to fire it would strip the class and with it the box the clip needs. */
    if (window.__cgMarkHold) {
      window.clearTimeout(window.__cgMarkHold);
      window.__cgMarkHold = 0;
    }

    /* How far the exchange takes. Three quarters of a screen: long enough to
       read as a movement rather than a jump, short enough that the name is
       home before the first section arrives. */
    var span = function () { return Math.round(window.innerHeight * 0.75); };
    var mode = markMode();

    if (mode === 'wipe') return markWipe(hero, mark, span);
    if (mode === 'rise') return markRise(hero, mark, span);
    return markTravel(hero, mark, to, span);
  }


  /** The tight box around an element's text, in viewport pixels. getBoundingClientRect
   *  on the element gives the block, which for a display line is the full column
   *  width; a Range gives the text itself, which is what has to line up. */
  /** A CSS length in pixels. `normal` letter-spacing is zero. */
  function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  function textBox(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    var b = r.getBoundingClientRect();
    if (r.detach) r.detach();
    return b;
  }

  /**
   * The hero sets the name at fifteen rem and the header sets it again at one,
   * so at the top of the page it is the same two words twice on one screen.
   * Rather than hide either, the hero's copy travels: it leaves the page,
   * closes from two lines onto one, shrinks through the variable font's
   * optical sizes, and arrives exactly where the header's copy sits — which
   * is what takes over, crisp, at the end.
   *
   * Font size rather than a scale transform. Fraunces is a variable face with
   * a real optical-size axis, and 144 is drawn differently from 24 — thinner
   * hairlines, tighter spacing, narrower counters. Scaling the display cut
   * down to header size would carry the display drawing with it and land on
   * something that is not the wordmark. Animating size, weight, tracking and
   * `opsz` together means the letterforms genuinely retune on the way up, and
   * the arrival matches because it is the same instruction the header uses.
   */
  function markTravel(hero, mark, to, span) {
    /* This one hides the wordmark with opacity rather than a clip, so the
       stylesheet's hold has to be released or it never comes back. */
    mark.classList.remove('nav__mark--hold');
    mark.style.clipPath = 'none';

    var fly = document.createElement('div');
    fly.className = 'mark-fly';
    fly.setAttribute('aria-hidden', 'true');
    var word = to.map(function (t) {
      var s = document.createElement('span');
      s.textContent = t.textContent;
      fly.appendChild(s);
      return s;
    });
    document.body.appendChild(fly);

    gsap.set(fly, { autoAlpha: 0 });

    /* Measured, never assumed: both ends are clamp()ed against the viewport
       and the header's is a different weight and optical size again. Read
       from the two elements that are actually on the page, on every refresh,
       so a resize re-aims the flight rather than sending it to where the
       header used to be. */
    var plan = null;

    function measure() {
      var lines = hero.querySelectorAll('.ln__i');
      if (lines.length !== 2) return null;

      var hs = getComputedStyle(hero);
      var y = window.scrollY || window.pageYOffset || 0;

      return word.map(function (s, i) {
        /* The line masks hold the entrance and move their contents vertically
           while it plays, so the horizontal extent comes from the text and the
           vertical from the mask, which never moves. */
        var maskBox = lines[i].parentNode.getBoundingClientRect();
        var textB = textBox(lines[i]);
        var toB = textBox(to[i]);
        var ts = getComputedStyle(to[i]);
        return {
          span: s,
          from: { x: textB.left, y: maskBox.top + y, size: parseFloat(hs.fontSize) },
          to: { x: toB.left, y: toB.top, size: parseFloat(ts.fontSize) },
          // numbers, not strings: these are interpolated by hand below
          fromVar: { weight: parseFloat(hs.fontWeight) || 400, track: px(hs.letterSpacing), opsz: 144 },
          toVar: { weight: parseFloat(ts.fontWeight) || 400, track: px(ts.letterSpacing), opsz: 24 }
        };
      });
    }

    var tl = null;

    function build() {
      plan = measure();
      if (!plan) return;

      if (tl) { tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); }

      /* Land it by measurement, not by arithmetic.

         The stand-in and the header's own wordmark sit in different places in
         the document and inherit different line heights, so giving both the
         same top puts their text two pixels apart — which is exactly the kind
         of thing that reads as a flicker at the instant of the swap. Put the
         stand-in into its final state, measure where its text actually falls,
         and move the target by the difference. */
      plan.forEach(function (p, i) {
        p.span.style.fontSize = p.to.size + 'px';
        p.span.style.letterSpacing = p.toVar.track + 'px';
        p.span.style.fontWeight = p.toVar.weight;
        p.span.style.fontVariationSettings = "'opsz' " + p.toVar.opsz;
        gsap.set(p.span, { x: p.to.x, y: p.to.y });
        var got = textBox(p.span), want = textBox(to[i]);
        p.to.x += want.left - got.left;
        p.to.y += want.top - got.top;
      });

      /* The space between the two words at rest, which is what the second one
         keeps as it closes up behind the first. From the real wordmark's own
         text, so it is the space the header actually sets. */
      var gap = textBox(to[1]).left - textBox(to[0]).right;

      tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: '.mast', start: 'top top', end: '+=' + span(),
          scrub: 0.5, invalidateOnRefresh: true,
          /* The heading hands over on the first pixel and takes itself back at
             the top, so a visitor who never scrolls sees the real <h1>. And
             the header takes its own wordmark back at the end — from the edge
             callbacks as well as from progress, because the last onUpdate
             before leaving the range is not guaranteed to carry a progress of
             exactly 1. On a phone it arrived at 0.9948, which is a header that
             never got its name back. */
          onEnter: swap, onLeaveBack: unswap, onUpdate: track,
          onLeave: function () { land(true); },
          onEnterBack: function () { land(false); }
        }
      });

      /* One proxy drives everything, and the type properties are written by
         hand rather than tweened.

         GSAP rounds pixel values on CSS properties it does not treat as
         transforms: `fontSize: 19.2` landed as `19px` and
         `letterSpacing: '-0.3456px'` as `0px`, which is why the arrival was
         two pixels adrift and the tracking never left `normal`. Interpolating
         the numbers here and writing the strings is exact, and it is one pass
         over two elements per frame either way. */
      var lead = plan[0], trail = plan[1];
      var beat = { k: 0 };

      function tween(p, k) {
        var st = p.span.style;
        st.fontSize = (p.from.size + (p.to.size - p.from.size) * k).toFixed(2) + 'px';
        st.letterSpacing = (p.fromVar.track + (p.toVar.track - p.fromVar.track) * k).toFixed(3) + 'px';
        st.fontWeight = Math.round(p.fromVar.weight + (p.toVar.weight - p.fromVar.weight) * k);
        st.fontVariationSettings = "'opsz' " +
          (p.fromVar.opsz + (p.toVar.opsz - p.fromVar.opsz) * k).toFixed(1);
      }

      function render() {
        var k = beat.k;
        var y = window.scrollY || window.pageYOffset || 0;

        /* The lead goes straight to the header's own wordmark. Its start is
           read live off the page, so however far the scrub is lagging at the
           moment of the swap the stand-in is exactly where the heading is. */
        tween(lead, k);
        var top0 = lead.from.y - y;
        gsap.set(lead.span, {
          x: lead.from.x + (lead.to.x - lead.from.x) * k,
          y: top0 + (lead.to.y - top0) * k
        });

        /* The trail is not given a path of its own. Sent along a straight line
           it cut the corner and crossed through the lead — two lines closing
           onto one is not two independent journeys. It homes on wherever the
           lead's trailing edge has got to, sideways early and downward late,
           holding a real line between them for as long as there are two. */
        tween(trail, k);
        var a = textBox(lead.span);
        var tx = k < 0.4 ? k / 0.4 : 1;
        var ty = k * k;
        var size = parseFloat(trail.span.style.fontSize) || trail.from.size;
        var g = gap * (size / trail.to.size);

        // the span's own box is not its text box, so correct by the difference
        var self = textBox(trail.span);
        var slipX = self.left - (parseFloat(gsap.getProperty(trail.span, 'x')) || 0);
        var slipY = self.top - (parseFloat(gsap.getProperty(trail.span, 'y')) || 0);

        gsap.set(trail.span, {
          x: (a.right + g) * tx + trail.from.x * (1 - tx) - slipX,
          y: a.top + (trail.from.y - lead.from.y) * (size / trail.from.size) * (1 - ty) - slipY
        });
      }

      tl.to(beat, { k: 1, duration: 1, ease: 'none', onUpdate: render });
      render();
    }

    var flying = false;

    function swap() {
      if (flying) return;
      flying = true;
      gsap.set(hero, { autoAlpha: 0 });
      gsap.set(mark, { autoAlpha: 0 });
      gsap.set(fly, { autoAlpha: 1 });
    }

    function unswap() {
      if (!flying) return;
      flying = false;
      gsap.set(hero, { autoAlpha: 1 });
      gsap.set(fly, { autoAlpha: 0 });
      gsap.set(mark, { autoAlpha: 0 });
    }

    /* At the end of the flight the header's own wordmark takes over. It is the
       real one — inside the link, in the header's own layout — so it stays
       right through every later resize without anything holding it in place. */
    function land(done) {
      gsap.set(mark, { autoAlpha: done ? 1 : 0 });
      gsap.set(fly, { autoAlpha: done ? 0 : 1 });
    }

    function track(self) { land(self.progress > 0.995); }

    // the entrance moves the lines it is measuring, so wait for it to finish
    gsap.delayedCall(1.6, function () {
      build();
      ST.addEventListener('refreshInit', function () { gsap.set(fly, { autoAlpha: 0 }); });
      ST.addEventListener('refresh', build);
    });

    // until then the header shows nothing, which is the point of the exercise
    gsap.set(mark, { autoAlpha: 0 });
  }



  /**
   * wipe — nothing moves.
   *
   * The hero's copy is left entirely alone: it scrolls off the way any other
   * page content does. The header's own copy is uncovered left to right as it
   * goes, so the name is never on screen twice and never appears to arrive
   * from anywhere. The quietest of the three, and the only one that adds no
   * element to the page and no work to the scroll.
   *
   * A clip rather than an opacity fade, because a wordmark fading up reads as
   * a thing being switched on, where a wipe reads as type being set.
   *
   * Triggered off the heading leaving, not off a fraction of the masthead.
   * Run over the same stretch as the other two it uncovered a half-finished
   * word next to the full-size one — the duplication this exists to remove,
   * with a rendering fault on top. The heading is nearly five hundred pixels
   * tall, so the only honest moment to start is when its last line has gone
   * past the top of the screen, and only the heading itself knows when that
   * is.
   */
  function markWipe(hero, mark, span) {
    // the box and the covered start both come from the stylesheet, so there is
    // no frame between first paint and this running in which it was visible
    mark.style.willChange = 'clip-path';

    gsap.fromTo(mark,
      { clipPath: 'inset(-20% 100% -20% 0%)' },
      {
        clipPath: 'inset(-20% 0% -20% 0%)',
        ease: 'none',
        scrollTrigger: {
          trigger: hero, start: 'bottom top+=72',
          end: '+=' + Math.round(span() * 0.45),
          scrub: 0.5, invalidateOnRefresh: true
        }
      });
  }

  /**
   * rise — an exchange through one slot.
   *
   * The hero's copy climbs out of the page faster than the page carries it, so
   * it leaves behind the header rather than with the scroll; the header's copy
   * comes up into the space underneath at the same moment, clipped to its own
   * box so it appears from under the bar rather than fading in over it.
   *
   * The two are deliberately not simultaneous. Overlapped completely they read
   * as one thing passing another; offset, the second arrives *because* the
   * first left, which is the point being made.
   */
  function markRise(hero, mark, span) {
    mark.style.willChange = 'clip-path, transform';

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '.mast', start: 'top top', end: '+=' + span(),
        scrub: 0.5, invalidateOnRefresh: true
      }
    });

    /* Out through the top, at half again the speed of the page, fading as it
       goes so it is gone before it would cross the header's own copy. */
    tl.fromTo(hero, { yPercent: 0, opacity: 1 },
      { yPercent: -55, opacity: 0, duration: 0.62, ease: 'power1.in' }, 0);

    tl.fromTo(mark,
      { clipPath: 'inset(0% -20% 100% -20%)', yPercent: 45 },
      { clipPath: 'inset(0% -20% 0% -20%)', yPercent: 0, duration: 0.38,
        ease: 'power2.out' }, 0.62);
  }

  /* ── go ────────────────────────────────────────────────────────────── */

  function boot() {
    surface();
    plates();
    masthead();
    heroMark();
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
