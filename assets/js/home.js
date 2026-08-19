/* ============================================================================
   home.js — the scenes.

     masthead   WebGL surface + masked name, pulled apart on scroll
     plates     every image: clip reveal, then parallax inside its own frame
     statement  a paragraph that lights word by word as it passes
     creed      pinned. The page inverts to night while the two halves of the
                quote slide past each other and the pulse flatlines.
     work       roles stack — each sticks while the next slides over it
     field      pinned horizontal gallery of the plates
     logs       latest entries from blog/posts.json
   ========================================================================= */

(function () {
  'use strict';

  var CG = window.CG || {};
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var motion = CG.motion && !!ST;

  var THEME = {
    day: {
      '--paper': '#EFEAE1', '--paper-2': '#E6E0D3', '--ink': '#14120F',
      '--ink-2': '#3E3A32', '--mute': '#7C7568', '--line': 'rgba(20,18,15,0.15)'
    },
    night: {
      '--paper': '#0B0A08', '--paper-2': '#15130E', '--ink': '#F3EFE6',
      '--ink-2': '#D2CBBD', '--mute': '#8C8578', '--line': 'rgba(243,239,230,0.18)'
    }
  };

  var KEYS = Object.keys(THEME.day);

  function paint(mix) {
    var root = document.documentElement;
    for (var i = 0; i < KEYS.length; i++) {
      root.style.setProperty(KEYS[i], gsap.utils.interpolate(THEME.day[KEYS[i]], THEME.night[KEYS[i]], mix));
    }
    root.classList.toggle('is-night', mix > 0.5);
  }

  /* ── the surface behind the masthead ───────────────────────────────── */

  function surface() {
    var canvas = document.querySelector('.mast__gl');
    if (!canvas) return;

    if (!motion || !window.CGSurface) { canvas.remove(); return; }

    var s = window.CGSurface(canvas, { paper: '#EFEAE1', ink: '#14120F', accent: '#E4441A' });
    if (!s) { canvas.remove(); return; }

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

  /* ── creed ─────────────────────────────────────────────────────────── */

  function creed() {
    var el = document.querySelector('.creed');
    if (!el) return;

    var a = el.querySelector('.creed__line--a');
    var b = el.querySelector('.creed__line--b');
    var or = el.querySelector('.creed__or');
    var resolve = el.querySelector('.creed__resolve');
    var live = el.querySelector('#beat-live');
    var flat = el.querySelector('#beat-flat');

    if (live && flat) {
      var beat = function (x) {
        return 'L' + x + ',50 L' + (x + 11) + ',13 L' + (x + 23) + ',87 L' + (x + 34) + ',37 L' + (x + 44) + ',50 ';
      };
      live.setAttribute('d', 'M0,50 ' + beat(120) + beat(330) + beat(540) + 'L700,50');
      flat.setAttribute('d', 'M700,50 L1400,50');
    }

    if (!motion) { el.classList.add('night'); return; }

    [live, flat].forEach(function (p) {
      if (!p) return;
      var len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    });

    gsap.set([a, b], { opacity: 0 });
    gsap.set(or, { opacity: 0, scaleX: 0.2 });
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
        pin: '.creed__pin',
        scrub: 0.65,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        refreshPriority: 20
      }
    })
      .fromTo(a, { xPercent: -20, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.26 }, 0.02)
      .to(live, { strokeDashoffset: 0, duration: 0.22 }, 0.12)
      .to(or, { opacity: 1, scaleX: 1, duration: 0.1, ease: 'back.out(2)' }, 0.3)
      .fromTo(b, { xPercent: 20, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.26 }, 0.36)
      .to(flat, { strokeDashoffset: 0, duration: 0.2 }, 0.44)
      .to(a, { opacity: 0.16, duration: 0.1 }, 0.6)
      .to(live, { opacity: 0.14, duration: 0.1 }, 0.6)
      .to(a, { opacity: 1, duration: 0.1 }, 0.72)
      .to(live, { opacity: 1, duration: 0.1 }, 0.72)
      .to(b, { opacity: 0.2, duration: 0.1 }, 0.72)
      .to(flat, { opacity: 0.28, duration: 0.1 }, 0.72)
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

  /* ── field guide: pinned horizontal ────────────────────────────────── */

  function field() {
    var section = document.querySelector('.field');
    var track = document.querySelector('.field__track');
    if (!section || !track || !motion) return;

    gsap.matchMedia().add('(min-width: 860px)', function () {
      var distance = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };

      var t = gsap.to(track, {
        x: function () { return -distance(); },
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: function () { return '+=' + (distance() + window.innerHeight * 0.5); },
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          refreshPriority: 10
        }
      });

      return function () { t.scrollTrigger && t.scrollTrigger.kill(); t.kill(); gsap.set(track, { x: 0 }); };
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

  /* ── logs ──────────────────────────────────────────────────────────── */

  function logs() {
    var list = document.querySelector('[data-logs]');
    if (!list || !window.CGPosts) return;

    var limit = parseInt(list.getAttribute('data-logs') || '3', 10);

    window.CGPosts.load('blog/')
      .then(function (posts) {
        if (!posts.length) throw new Error('empty');
        list.innerHTML = posts.slice(0, limit).map(window.CGPosts.rowHTML).join('');
        if (CG.reveal) CG.reveal(list);
        if (ST) ST.refresh();
      })
      .catch(function () {
        list.innerHTML = '<p class="logs__empty">The index could not be read here. ' +
          '<a class="lbl lbl--acc" href="blog/">Open the archive &rarr;</a></p>';
      });
  }

  /* ── go ────────────────────────────────────────────────────────────── */

  function boot() {
    surface();
    plates();
    masthead();
    statement();
    creed();
    work();
    field();
    navTheme();
    logs();
    if (ST) ST.refresh();
  }

  if (CG.onReady) CG.onReady(boot);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
