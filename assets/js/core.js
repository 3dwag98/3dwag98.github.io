/* ============================================================================
   core.js — the motion runtime.

   Lenis drives the GSAP ticker, ScrollTrigger reads from it, and everything
   below is a small tool the scenes compose:

     loader + curtain   entry wipe, and the same panels cover page navigation
     cursor             lagging ring + dot, picks up labels from [data-cur]
     magnet             elements that lean toward the pointer
     skew               scroll velocity leaning into [data-skew] groups
     splitLines/Words   masked line reveals and word-by-word scrubs
     reveal             [data-r] entrances

   Exposes window.CG. Every piece is optional: no GSAP, no Lenis, or reduced
   motion and the page is still a readable document.
   ========================================================================= */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var hasGsap = !!gsap;
  var hasST = hasGsap && !!ST;
  var motion = hasGsap && !reduced;

  if (hasST) gsap.registerPlugin(ST);
  if (hasGsap && window.SplitText) gsap.registerPlugin(window.SplitText);

  /* Scenes that are pinned, stacked or crossfaded only lay out correctly while
     this runtime is driving them. index.html guesses from the media query
     before first paint; correct that here, so GSAP failing to load falls back
     to the plain document instead of leaving the layout mid-flight. */
  document.documentElement.classList.toggle('motion', motion && hasST);

  var ready = [];
  var lenis = null;

  /* ── smooth scroll ─────────────────────────────────────────────────── */

  function initLenis() {
    if (reduced || !window.Lenis) return null;

    var l = new window.Lenis({
      duration: 1.15,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.7
    });

    if (hasST) {
      l.on('scroll', ST.update);
      gsap.ticker.add(function (t) { l.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      requestAnimationFrame(function raf(t) { l.raf(t); requestAnimationFrame(raf); });
    }

    return l;
  }

  function scrollTo(target, opts) {
    var o = opts || {};
    if (lenis) { lenis.scrollTo(target, Object.assign({ duration: 1.2 }, o)); return; }
    if (typeof target === 'number') { window.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' }); return; }
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /* ── text splitting ────────────────────────────────────────────────── */

  /** Lines, each inside its own clipping mask. SplitText does the masking
   *  itself — mask:'lines' wraps every line in a .ln__i-mask with overflow
   *  clipped — so there is no wrapper to build here. Animate the returned
   *  lines; they slide inside their masks. */
  function splitLines(el) {
    if (!window.SplitText) return [el];
    return new window.SplitText(el, { type: 'lines', linesClass: 'ln__i', mask: 'lines' }).lines;
  }

  function splitWords(el) {
    if (!window.SplitText) return [];
    return new window.SplitText(el, { type: 'words', wordsClass: 'wd' }).words;
  }

  /** Characters, each in its own mask, for headings that should assemble
   *  rather than arrive. Splitting to words as well keeps wrapping intact. */
  function splitChars(el) {
    if (!window.SplitText) return [];
    return new window.SplitText(el, {
      type: 'chars,words', charsClass: 'ch', mask: 'chars'
    }).chars;
  }

  /* ── loader + curtain ──────────────────────────────────────────────── */

  var curtain = null;

  function panels() {
    if (!curtain) curtain = document.querySelector('.curtain');
    return curtain ? curtain.querySelectorAll('.curtain__p') : [];
  }

  function initLoader(done) {
    var loader = document.querySelector('.loader');
    var p = panels();

    if (!loader || !motion) {
      if (loader) loader.remove();
      if (p.length) gsap.set && gsap.set(p, { scaleY: 0 });
      document.documentElement.classList.remove('is-loading');
      done();
      return;
    }

    if (lenis) lenis.stop();

    /* The Devanagari-to-Latin sequence builds its own timeline; this function
       still owns the lifecycle around it — stopping Lenis, clearing
       is-loading, and handing back to the page. */
    var seq = window.CGTypeLoader
      ? window.CGTypeLoader.create(loader)
      : null;

    if (!seq) {                       // module missing or it declined to build
      loader.remove();
      document.documentElement.classList.remove('is-loading');
      if (p.length) gsap.set(p, { scaleY: 0 });
      if (lenis) lenis.start();
      done();
      return;
    }

    seq.eventCallback('onComplete', function () {
      loader.remove();
      document.documentElement.classList.remove('is-loading');
      if (lenis) { lenis.start(); lenis.scrollTo(0, { immediate: true }); }
      done();
    });

    // the curtain panels belong to page transitions; keep them parked
    if (p.length) gsap.set(p, { scaleY: 0, transformOrigin: '50% 0%' });
  }

  /** Cover the screen, then navigate. Keeps page changes from cutting. */
  function initTransitions() {
    if (!motion) return;

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;

      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|https?:)/.test(href)) return;
      if (a.hostname && a.hostname !== window.location.hostname) return;

      e.preventDefault();
      var p = panels();
      if (!p.length) { window.location.href = href; return; }

      gsap.timeline()
        .set(p, { transformOrigin: '50% 100%' })
        .to(p, {
          scaleY: 1,
          duration: 0.6,
          ease: 'expo.inOut',
          stagger: 0.05,
          onComplete: function () { window.location.href = href; }
        });
    });

    // Restore the page when it comes back from bfcache.
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) gsap.set(panels(), { scaleY: 0 });
    });
  }

  /* ── the bar commits once the page moves ───────────────────────────── */

  /** Deliberately plain scroll reading rather than a ScrollTrigger: the nav has
   *  to stay legible even when GSAP never loaded. */
  function initNavBar() {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    var on = null;

    function check() {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      var next = y > 24;
      if (next === on) return;
      on = next;
      nav.classList.toggle('is-stuck', next);
    }

    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check, { passive: true });
    check();
  }

  /* ── cursor ────────────────────────────────────────────────────────── */

  function initCursor() {
    var ring = document.querySelector('.cur');
    var dot = document.querySelector('.cur-dot');
    if (!ring || !dot) return;

    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || !motion) {
      ring.remove(); dot.remove(); return;
    }

    var label = ring.querySelector('.cur__t');
    var rx = gsap.quickTo(ring, 'x', { duration: 0.42, ease: 'power3' });
    var ry = gsap.quickTo(ring, 'y', { duration: 0.42, ease: 'power3' });
    var dx = gsap.quickTo(dot, 'x', { duration: 0.1, ease: 'power2' });
    var dy = gsap.quickTo(dot, 'y', { duration: 0.1, ease: 'power2' });
    var shown = false;
    var scale = 1;

    /* Everything the ring reacts to, and what it says while it is there. */
    var TARGETS = '[data-cur], a, button, .plate, canvas';

    function labelFor(t) {
      var explicit = t.getAttribute('data-cur');
      if (explicit !== null) return explicit;
      if (t.matches('a[href^="mailto:"]')) return 'write';
      if (t.matches('a[target="_blank"]')) return 'open';
      if (t.matches('canvas')) return 'pick';
      if (t.matches('.plate')) return 'look';
      if (t.tagName === 'BUTTON') return 'press';
      if (t.tagName === 'A') return 'go';
      return '';
    }

    function to(s) {
      scale = s;
      gsap.to(ring, { scale: s, duration: 0.35, ease: 'expo.out' });
    }

    window.addEventListener('mousemove', function (e) {
      if (!shown) {
        gsap.set([ring, dot], { x: e.clientX, y: e.clientY });
        gsap.to([ring, dot], { opacity: 1, duration: 0.3 });
        /* Take the native cursor away only once ours is genuinely on screen.
           If this never runs the page keeps its own cursor, rather than the
           user being left with no pointer at all. */
        document.body.classList.add('cursor-on');
        shown = true;
      }
      rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY);
    }, { passive: true });

    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest(TARGETS);
      if (!t) return;

      var text = labelFor(t);
      if (label) label.textContent = text;
      ring.classList.add('is-tagged');
      ring.classList.toggle('is-worded', !!text);
      to(text ? 1.62 : 1.28);
      gsap.to(dot, { opacity: 0, duration: 0.2 });
    });

    document.addEventListener('mouseout', function (e) {
      if (!e.target.closest(TARGETS)) return;
      ring.classList.remove('is-tagged', 'is-worded');
      to(1);
      gsap.to(dot, { opacity: 1, duration: 0.2 });
    });

    /* A flash left where the click landed. Three elements, reused in turn, so a
       fast clicker never grows the DOM. */
    var flashes = [];
    var fi = 0;

    for (var f = 0; f < 3; f++) {
      var el = document.createElement('i');
      el.className = 'cur-flash';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      flashes.push(el);
    }

    function flash(x, y) {
      var el = flashes[fi];
      fi = (fi + 1) % flashes.length;

      gsap.killTweensOf(el);
      gsap.set(el, { x: x, y: y, scale: 0.3, opacity: 0.9 });
      gsap.to(el, { scale: 2.6, opacity: 0, duration: 0.62, ease: 'expo.out' });
    }

    /* A press should register on the cursor itself, not just the element. */
    document.addEventListener('mousedown', function (e) {
      gsap.to(ring, { scale: scale * 0.82, duration: 0.14, ease: 'power2.out' });
      ring.classList.add('is-lit');
      flash(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', function () {
      gsap.to(ring, { scale: scale, duration: 0.3, ease: 'expo.out' });
      ring.classList.remove('is-lit');
    });

    document.addEventListener('mouseleave', function () { gsap.to([ring, dot], { opacity: 0, duration: 0.2 }); });
    document.addEventListener('mouseenter', function () { if (shown) gsap.to([ring, dot], { opacity: 1, duration: 0.2 }); });
  }

  /* ── magnetic elements ─────────────────────────────────────────────── */

  function initMagnets() {
    if (!motion) return;

    document.querySelectorAll('[data-magnet]').forEach(function (el) {
      var pull = parseFloat(el.getAttribute('data-magnet')) || 0.32;
      var setX = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
      var setY = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });

      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        setX((e.clientX - (r.left + r.width / 2)) * pull);
        setY((e.clientY - (r.top + r.height / 2)) * pull);
      });

      el.addEventListener('mouseleave', function () { setX(0); setY(0); });
    });
  }

  /* ── scroll velocity ──────────────────────────────────────────────── */

  function initVelocity() {
    if (!motion) return;

    var skewed = Array.prototype.slice.call(document.querySelectorAll('[data-skew]'));
    if (!skewed.length) return;

    var setSkew = skewed.map(function (el) {
      return gsap.quickTo(el, 'skewY', { duration: 0.55, ease: 'power3' });
    });

    var current = 0;

    function apply(v) {
      current += (v - current) * 0.12;
      var s = gsap.utils.clamp(-5, 5, current * 0.055);
      setSkew.forEach(function (fn) { fn(s); });
    }

    if (lenis) lenis.on('scroll', function (e) { apply(e.velocity || 0); });
    else if (hasST) ST.create({ start: 0, end: 'max', onUpdate: function (self) { apply(self.getVelocity() / 90); } });

    gsap.ticker.add(function () { if (Math.abs(current) > 0.01) apply(current * 0.86); });
  }

  /* ── reveals ───────────────────────────────────────────────────────── */

  /** [data-chars] — the heading assembles letter by letter out of its masks. */
  function revealChars(scope) {
    var root = scope || document;
    var els = Array.prototype.slice.call(root.querySelectorAll('[data-chars]'));
    if (!els.length || !motion || !window.SplitText) return;

    els.forEach(function (el) {
      var chars = splitChars(el);
      if (!chars.length) return;

      gsap.set(chars, { yPercent: 116 });
      gsap.to(chars, {
        yPercent: 0,
        duration: 1.05,
        ease: 'expo.out',
        stagger: { each: 0.016, from: 'start' },
        delay: parseFloat(el.getAttribute('data-delay')) || 0,
        scrollTrigger: { trigger: el, start: 'top 86%', once: true }
      });
    });
  }

  function reveal(scope) {
    var root = scope || document;
    var els = Array.prototype.slice.call(root.querySelectorAll('[data-r]'));

    if (!els.length) return;

    if (!motion || !hasST) {
      els.forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
      return;
    }

    els.forEach(function (el) {
      var kind = el.getAttribute('data-r');
      var delay = parseFloat(el.getAttribute('data-delay')) || 0;

      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: kind === 'up' ? 1.15 : 0.9,
        delay: delay,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true }
      });
    });
  }

  /** Masked line entrance for every [data-lines] inside `scope`. */
  function revealLines(scope) {
    var root = scope || document;
    var els = Array.prototype.slice.call(root.querySelectorAll('[data-lines]'));
    if (!els.length || !motion || !window.SplitText) return;

    els.forEach(function (el) {
      var lines = splitLines(el);
      var immediate = el.hasAttribute('data-lines-now');

      var tween = {
        yPercent: 0,
        duration: 1.25,
        ease: 'expo.out',
        stagger: 0.085,
        delay: parseFloat(el.getAttribute('data-delay')) || 0
      };

      gsap.set(lines, { yPercent: 108 });

      if (immediate) gsap.to(lines, tween);
      else gsap.to(lines, Object.assign(tween, {
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      }));
    });
  }

  /* ── chrome bits ───────────────────────────────────────────────────── */

  function initProgress() {
    var bar = document.querySelector('.prog');
    if (!bar) return;

    if (!hasST) {
      window.addEventListener('scroll', function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
      }, { passive: true });
      return;
    }

    gsap.to(bar, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });
  }

  function initAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id === '#') return;
      var el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      scrollTo(el, { offset: 0 });
      history.replaceState(null, '', id);
    });
  }

  function clearReveals(root) {
    if (!hasST || !root) return;
    ST.getAll().forEach(function (t) { if (t.trigger && root.contains(t.trigger)) t.kill(); });
  }

  /* ── go ────────────────────────────────────────────────────────────── */

  window.CG = {
    reduced: reduced,
    motion: motion,
    hasST: hasST,
    lenis: null,
    scrollTo: scrollTo,
    splitLines: splitLines,
    splitWords: splitWords,
    splitChars: splitChars,
    reveal: reveal,
    revealLines: revealLines,
    revealChars: revealChars,
    clearReveals: clearReveals,
    onReady: function (fn) { ready.push(fn); }
  };

  function start() {
    lenis = initLenis();
    window.CG.lenis = lenis;

    initAnchors();
    initNavBar();
    initCursor();
    initMagnets();
    initProgress();
    initTransitions();
    revealLines(document);
    revealChars(document);
    reveal(document);
    initVelocity();

    initLoader(function () {
      ready.forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
      if (hasST) ST.refresh();
    });

    if (document.fonts && document.fonts.ready && hasST) {
      document.fonts.ready.then(function () { ST.refresh(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
