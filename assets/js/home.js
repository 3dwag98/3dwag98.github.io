/* ============================================================================
   home.js — the scenes.

     hero       lines are already up; scrolling pulls the two halves apart
     statement  a paragraph that lights word by word as it passes
     creed      pinned. The page itself inverts to night while the two halves
                of the quote slide past each other and the pulse flatlines.
     work       roles stack: each card sticks while the next slides over it
     figures    pinned horizontal run of numbers that count up
     logs       latest entries from blog/posts.json

   Any scene whose markup is missing is skipped; without GSAP the page is a
   plain document.
   ========================================================================= */

(function () {
  'use strict';

  var CG = window.CG || {};
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var motion = CG.motion && !!ST;

  /* Day and night are the same six tokens; the creed interpolates between
     them so every component inverts together. */
  var THEME = {
    day: {
      '--paper': '#EFEAE1', '--paper-2': '#E5DFD2', '--ink': '#14120F',
      '--ink-2': '#3B372F', '--mute': '#7B7467', '--line': 'rgba(20,18,15,0.16)'
    },
    night: {
      '--paper': '#0B0A08', '--paper-2': '#16140F', '--ink': '#F2EDE3',
      '--ink-2': '#CFC8BA', '--mute': '#8A8377', '--line': 'rgba(242,237,227,0.18)'
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

  /* ── hero ──────────────────────────────────────────────────────────── */

  function hero() {
    var el = document.querySelector('.hero');
    if (!el || !motion) return;

    var lines = el.querySelectorAll('.hero__name .ln');

    gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 0.6 } })
      .to(lines[0], { xPercent: -14, opacity: 0, ease: 'none' }, 0)
      .to(lines[1], { xPercent: 12, opacity: 0, ease: 'none' }, 0)
      .to('.hero__foot', { yPercent: 40, opacity: 0, ease: 'none' }, 0)
      .to('.hero__top', { opacity: 0, ease: 'none', duration: 0.4 }, 0);
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
      scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 58%', scrub: 0.5 }
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
        return 'L' + x + ',50 L' + (x + 11) + ',14 L' + (x + 23) + ',86 L' + (x + 34) + ',38 L' + (x + 44) + ',50 ';
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
    gsap.set(resolve, { opacity: 0, y: 22 });

    // The page inverts on the way in and recovers on the way out, so the
    // passage reads as somewhere you scroll through rather than a dark band.
    ST.create({
      trigger: el,
      start: 'top bottom',
      end: 'bottom top',
      // Default priority on purpose: this must be measured *after* the pin
      // below has added its spacing, or the range ends halfway through.
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
      .fromTo(a, { xPercent: -22, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.26 }, 0.02)
      .to(live, { strokeDashoffset: 0, duration: 0.22 }, 0.12)
      .to(or, { opacity: 1, scaleX: 1, duration: 0.1, ease: 'back.out(2)' }, 0.3)
      .fromTo(b, { xPercent: 22, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.26 }, 0.36)
      .to(flat, { strokeDashoffset: 0, duration: 0.2 }, 0.44)
      // the fork: for a moment the flat line is all there is
      .to(a, { opacity: 0.18, duration: 0.1 }, 0.6)
      .to(live, { opacity: 0.15, duration: 0.1 }, 0.6)
      // ...and the answer
      .to(a, { opacity: 1, duration: 0.1 }, 0.72)
      .to(live, { opacity: 1, duration: 0.1 }, 0.72)
      .to(b, { opacity: 0.22, duration: 0.1 }, 0.72)
      .to(flat, { opacity: 0.3, duration: 0.1 }, 0.72)
      .to(resolve, { opacity: 1, y: 0, duration: 0.12, ease: 'expo.out' }, 0.82)
      .to({}, { duration: 0.1 });
  }

  /* ── work: stacked role cards ──────────────────────────────────────── */

  function work() {
    var roles = Array.prototype.slice.call(document.querySelectorAll('.role'));
    if (roles.length < 2 || !motion) return;

    var mm = gsap.matchMedia();

    mm.add('(min-width: 1024px)', function () {
      var tweens = roles.slice(0, -1).map(function (role, i) {
        return gsap.to(role, {
          scale: 0.93,
          opacity: 0.25,
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

  /* ── figures: pinned horizontal ────────────────────────────────────── */

  function figures() {
    var section = document.querySelector('.figures');
    var track = document.querySelector('.figures__track');
    if (!section || !track || !motion) return;

    var mm = gsap.matchMedia();

    mm.add('(min-width: 860px)', function () {
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

  function counters() {
    var section = document.querySelector('.figures');
    var nums = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
    if (!nums.length) return;

    var render = function (el, v) {
      var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var text = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US');
      if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.nodeValue = text;
      else el.insertBefore(document.createTextNode(text), el.firstChild);
    };

    if (!motion || !section) {
      nums.forEach(function (el) { render(el, parseFloat(el.getAttribute('data-count')) || 0); });
      return;
    }

    nums.forEach(function (el) { render(el, 0); });

    // The figures live inside a horizontally translated track, so entering the
    // section — not each number's own box — is what starts the run.
    ST.create({
      trigger: section,
      start: 'top 65%',
      once: true,
      onEnter: function () {
        nums.forEach(function (el, i) {
          var proxy = { v: 0 };
          gsap.to(proxy, {
            v: parseFloat(el.getAttribute('data-count')) || 0,
            duration: 2.1,
            delay: i * 0.12,
            ease: 'power2.out',
            onUpdate: function () { render(el, proxy.v); }
          });
        });
      }
    });
  }

  /* ── nav over the dark band ────────────────────────────────────────── */

  function navTheme() {
    var nav = document.querySelector('.nav');
    var dark = document.querySelector('.figures');
    if (!nav || !dark || !motion) return;

    ST.create({
      trigger: dark,
      start: 'top 56px',
      end: 'bottom 56px',
      onToggle: function (self) { nav.classList.toggle('is-inverted', self.isActive); }
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
          '<a class="label label--accent" href="blog/">Open the archive &rarr;</a></p>';
      });
  }

  /* ── go ────────────────────────────────────────────────────────────── */

  function boot() {
    hero();
    statement();
    creed();
    work();
    figures();
    counters();
    navTheme();
    logs();
    if (ST) ST.refresh();
  }

  if (CG.onReady) CG.onReady(boot);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
