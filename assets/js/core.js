/* ============================================================================
   core.js — motion runtime shared by every page.

   Sets up Lenis (smooth scroll) -> GSAP ticker -> ScrollTrigger, plus the
   chrome that lives on all pages: cursor, boot sequence, top progress bar,
   chapter rail and the generic [data-anim] reveals.

   Exposes window.CG = { lenis, reduced, scrollTo, onReady }.
   Everything degrades to plain native scrolling if a library fails to load.
   ========================================================================= */

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof window.gsap !== 'undefined';
  var hasST = hasGsap && typeof window.ScrollTrigger !== 'undefined';

  if (hasST) window.gsap.registerPlugin(window.ScrollTrigger);

  var readyCallbacks = [];
  var lenis = null;

  /* ---------- 1. Smooth scroll ------------------------------------------ */

  function initLenis() {
    if (reduced || typeof window.Lenis === 'undefined') return null;

    var l = new window.Lenis({
      duration: 1.05,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      touchMultiplier: 1.6,
      wheelMultiplier: 1
    });

    if (hasST) {
      l.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add(function (time) { l.raf(time * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      requestAnimationFrame(function raf(time) { l.raf(time); requestAnimationFrame(raf); });
    }

    return l;
  }

  function scrollTo(target, opts) {
    var options = opts || {};
    if (lenis) { lenis.scrollTo(target, Object.assign({ offset: 0, duration: 1.1 }, options)); return; }

    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (typeof target === 'number') { window.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' }); return; }
    if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- 2. Anchor links ------------------------------------------- */

  function initAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id === '#') return;
      var el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      scrollTo(el, { offset: -10 });
      history.replaceState(null, '', id);
    });
  }

  /* ---------- 3. Custom cursor ------------------------------------------ */

  function initCursor() {
    var cursor = document.querySelector('.cursor');
    if (!cursor) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) { cursor.remove(); return; }

    document.body.classList.add('has-cursor');

    var x = window.innerWidth / 2;
    var y = window.innerHeight / 2;
    var setX, setY;

    if (hasGsap) {
      setX = window.gsap.quickTo(cursor, 'x', { duration: 0.18, ease: 'power3' });
      setY = window.gsap.quickTo(cursor, 'y', { duration: 0.18, ease: 'power3' });
    }

    window.addEventListener('mousemove', function (e) {
      if (!cursor.classList.contains('is-live')) {
        // Park it under the pointer before the first paint of the dot.
        if (setX) { window.gsap.set(cursor, { x: e.clientX - 9, y: e.clientY - 11 }); }
        cursor.classList.add('is-live');
      }
      x = e.clientX; y = e.clientY;
      document.documentElement.style.setProperty('--cursor-x', x + 'px');
      document.documentElement.style.setProperty('--cursor-y', y + 'px');
      if (setX) { setX(x - 9); setY(y - 11); }
      else { cursor.style.transform = 'translate(' + (x - 9) + 'px,' + (y - 11) + 'px)'; }
    }, { passive: true });

    // Delegated so it also covers markup injected later (blog lists, posts).
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest('a, button, input, .interactive')) cursor.classList.add('is-active');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest('a, button, input, .interactive')) cursor.classList.remove('is-active');
    });

    window.CG.cursorPos = function () { return { x: x, y: y }; };
  }

  /* ---------- 4. Boot sequence ------------------------------------------ */

  function initBoot(done) {
    var boot = document.querySelector('.boot');
    if (!boot) { done(); return; }

    var fill = boot.querySelector('.boot__fill');
    var pct = boot.querySelector('.boot__pct');

    if (reduced || !hasGsap) {
      boot.remove();
      document.documentElement.classList.remove('is-booting');
      done();
      return;
    }

    if (lenis) lenis.stop();

    var counter = { v: 0 };
    window.gsap.timeline({
      onComplete: function () {
        boot.remove();
        document.documentElement.classList.remove('is-booting');
        if (lenis) lenis.start();
        done();
      }
    })
      .to(counter, {
        v: 100,
        duration: 0.9,
        ease: 'power2.inOut',
        onUpdate: function () {
          var v = Math.round(counter.v);
          if (pct) pct.textContent = String(v).padStart(3, '0') + '%';
          if (fill) fill.style.transform = 'scaleX(' + (v / 100) + ')';
        }
      })
      .to(boot, { autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, '+=0.12');
  }

  /* ---------- 5. Top progress bar --------------------------------------- */

  function initProgress() {
    var bar = document.querySelector('.progress');
    if (!bar) return;

    if (!hasST) {
      window.addEventListener('scroll', function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
      }, { passive: true });
      return;
    }

    window.gsap.to(bar, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { start: 0, end: 'max', scrub: 0.25 }
    });
  }

  /* ---------- 6. Chapter rail ------------------------------------------- */

  function initRail() {
    var rail = document.querySelector('.rail');
    if (!rail || !hasST) return;

    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-chapter]'));
    if (!sections.length) { rail.remove(); return; }

    rail.innerHTML = sections.map(function (s, i) {
      var label = s.getAttribute('data-chapter') || '';
      return '<a class="rail__item" href="#' + s.id + '" data-i="' + i + '" aria-label="' + label + '">' +
             '<span class="rail__label">' + label + '</span></a>';
    }).join('');

    var items = rail.querySelectorAll('.rail__item');

    function light(i) {
      for (var k = 0; k < items.length; k++) items[k].classList.toggle('is-on', k === i);
    }

    sections.forEach(function (s, i) {
      window.ScrollTrigger.create({
        trigger: s,
        start: 'top 45%',
        end: 'bottom 45%',
        onToggle: function (self) { if (self.isActive) light(i); }
      });
    });

    light(0);
  }

  /* ---------- 7. Generic reveals ---------------------------------------- */

  function revealAll(root) {
    var scope = root || document;
    var els = Array.prototype.slice.call(scope.querySelectorAll('[data-anim]'));
    if (!els.length) return;

    if (reduced || !hasST) {
      els.forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
      return;
    }

    els.forEach(function (el) {
      var kind = el.getAttribute('data-anim');
      var delay = parseFloat(el.getAttribute('data-delay') || 0);
      var from = { opacity: 0 };

      if (kind === 'rise') from.y = 38;
      if (kind === 'rise-sm') from.y = 18;

      window.gsap.fromTo(el, from, {
        opacity: 1,
        y: 0,
        duration: 0.95,
        delay: delay,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  }

  /** Kill reveal triggers inside `root` before its markup is replaced, so a
   *  re-rendered list (search, filters) does not leak ScrollTriggers. */
  function clearReveals(root) {
    if (!hasST || !root) return;
    window.ScrollTrigger.getAll().forEach(function (t) {
      if (t.trigger && root.contains(t.trigger)) t.kill();
    });
  }

  /* ---------- 8. Boot the runtime --------------------------------------- */

  window.CG = {
    reduced: reduced,
    hasGsap: hasGsap,
    hasScrollTrigger: hasST,
    lenis: null,
    scrollTo: scrollTo,
    reveal: revealAll,
    clearReveals: clearReveals,
    onReady: function (fn) { readyCallbacks.push(fn); }
  };

  function start() {
    lenis = initLenis();
    window.CG.lenis = lenis;

    initAnchors();
    initCursor();
    initProgress();
    initRail();
    revealAll(document);

    initBoot(function () {
      readyCallbacks.forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
      if (hasST) window.ScrollTrigger.refresh();
    });

    // Late-loading webfonts change text metrics; re-measure once they land.
    if (document.fonts && document.fonts.ready && hasST) {
      document.fonts.ready.then(function () { window.ScrollTrigger.refresh(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
