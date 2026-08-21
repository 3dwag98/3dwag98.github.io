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

  if (hasST) {
    gsap.registerPlugin(ST);
    /* A phone hiding or showing its address bar resizes the viewport, and a
       refresh in the middle of a scroll re-measures every pinned scene and
       jumps the page. The height changes, the layout does not. */
    ST.config({ ignoreMobileResize: true });
  }
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

    /* lerp, not duration + easing. Those two are alternatives inside Lenis,
       and the duration path restarts its ease from zero on every wheel event:
       under continuous input — a trackpad, a free-spinning wheel — that is a
       new curve sixty times a second, and it reads as the small stutter it
       is. lerp is an exponential approach to wherever the target has got to,
       normalised against the frame time, so a continuous gesture stays one
       continuous movement and a slow frame does not shorten the glide.

       0.085 rather than the 0.1 default: a little longer on the tail, which
       suits a page whose scenes are nearly all scrubbed. */
    var l = new window.Lenis({
      lerp: 0.085,
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

  /* The intro is an introduction, and a visitor is introduced once.

     It used to run on every arrival at this page, which on this site means
     every time someone comes back from a blog entry — five seconds in front
     of a page they had already seen, to reach a section they had already
     asked for. Once per tab now, and never when the URL names a place: a link
     to #work is a request for that section, not for the intro. */
  var INTRO = 'cg:intro';

  function seenIntro() {
    try { return window.sessionStorage.getItem(INTRO) === '1'; } catch (e) { return false; }
  }

  /**
   * The curtain, on arrival.
   *
   * A transition that wipes the old page out and then simply shows the next
   * one is half a transition: you watch a considered movement and then the
   * page cuts. This lifts the curtain the document head is holding down, in
   * the same direction the outgoing wipe was travelling — it grew from the
   * bottom of the screen, so this one keeps going and clears off the top, and
   * the two pages read as one movement.
   */
  var CROSS = 'cg:cross';

  function curtainIn() {
    var d = document.documentElement;
    var p = panels();
    var crossed = d.classList.contains('crossing');

    if (window.__cgCrossWatchdog) {
      window.clearTimeout(window.__cgCrossWatchdog);
      window.__cgCrossWatchdog = 0;
    }

    if (!p.length || !motion || !gsap.set) { d.classList.remove('crossing'); return; }

    if (!crossed) { gsap.set(p, { scaleY: 0, transformOrigin: '50% 0%' }); return; }

    // the inline transform first, so dropping the class cannot make it jump
    gsap.set(p, { scaleY: 1, transformOrigin: '50% 0%' });
    d.classList.remove('crossing');
    gsap.to(p, { scaleY: 0, duration: 0.6, ease: 'expo.inOut', stagger: 0.05 });
  }

  function initLoader(done) {
    var loader = document.querySelector('.loader');
    var p = panels();

    if (!loader || !motion || seenIntro() || hashTarget()) {
      if (loader) loader.remove();
      curtainIn();
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
      curtainIn();
      if (lenis) lenis.start();
      done();
      return;
    }

    /* One handover, and only one. Removing the loader, unlocking the page and
       restarting Lenis have to happen together — the failure this guards
       against is the page being unlocked while Lenis is still stopped, which
       looks exactly like a frozen scroll. */
    try { window.sessionStorage.setItem(INTRO, '1'); } catch (e) {}

    var handed = false;
    function hand() {
      if (handed) return;
      handed = true;
      window.clearTimeout(failsafe);
      loader.remove();
      document.documentElement.classList.remove('is-loading');
      if (lenis) lenis.start();
      // the top, unless the URL asked for somewhere — landing() does that,
      // after the scenes below have been built and measured
      if (!hashTarget()) {
        if (lenis) lenis.scrollTo(0, { immediate: true });
        else window.scrollTo(0, 0);
      }
      done();
    }

    /* The entry cannot outstay its welcome. GSAP is time-based, but a machine
       slow enough to drop frames past its lag-smoothing threshold stretches
       the sequence in wall-clock terms, and nobody should be held at a loading
       screen because their GPU is weak. Cutting to the page is the right
       answer there, and this is the only timer that decides it — the one in
       the document head stands down as soon as this runs. */
    var failsafe = window.setTimeout(hand, 8000);
    if (window.__cgLoaderWatchdog) {
      window.clearTimeout(window.__cgLoaderWatchdog);
      window.__cgLoaderWatchdog = 0;
    }

    seq.eventCallback('onComplete', hand);

    /* The curtain panels belong to page transitions; keep them parked. No
       lift here even if one is held down — the loader covers the whole screen
       above it, so there would be nothing to see. */
    document.documentElement.classList.remove('crossing');
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
          onComplete: function () {
            // tells the next page the curtain is already down over it
            try { window.sessionStorage.setItem(CROSS, '1'); } catch (e) {}
            window.location.href = href;
          }
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

  /**
   * A hint that the page goes on, shown only when the page has gone quiet.
   *
   * Built here rather than put in every document: it belongs to the same
   * family as the progress bar, it has nothing to say without a runtime, and
   * four copies of the same markup is four places to forget.
   *
   * When it shows is the whole design. Permanently on, it is furniture the
   * eye stops seeing, and it sits over the page for the entire visit; on for
   * three seconds and gone forever, it is a splash. So it comes back whenever
   * the page has been still for a while and there is somewhere left to go —
   * which is when a visitor is either reading or stuck, and only one of those
   * needs telling. It leaves the moment the page moves.
   *
   * It is also a button. Something that appears when nothing is happening
   * ought to do the thing it is suggesting, and on a laptop with no obvious
   * gesture that is the whole difference between a hint and an instruction.
   */
  /* How long the page has to sit completely untouched — not merely unscrolled.
     2.6 seconds of no *scrolling* is what reading a paragraph looks like, and
     what drawing on the game board looks like, which is why the hint kept
     turning up in the middle of both. */
  var STEADY = 4500;
  var FOOT = 160;                  // no hint this close to the end
  /* Once someone has scrolled this many viewports they have demonstrated they
     can, and a hint telling them how is just something in the way. */
  var LEARNED = 1.2;
  var SHOWS = 2;                   // and never more than twice in one visit
  var SCROLLED = 'cg:scrolled';    // remembered, so it does not start over per page

  function initSteady() {
    if (document.querySelector('.hint')) return;

    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'hint';
    el.setAttribute('aria-label', 'Scroll down');
    // starts invisible, so it starts out of the tab order and off the tree
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    el.innerHTML = '<span class="hint__rail"><i></i></span><span class="lbl hint__lbl">Scroll</span>';
    document.body.appendChild(el);

    var timer = 0, shown = false, count = 0, quiet = false;

    /* A page may carry its own cue — the home hero has one in its foot, as
       part of that composition. Two of them saying the same thing at once is
       one too many, so this one waits until the page's own has scrolled off. */
    var cues = Array.prototype.slice.call(document.querySelectorAll('[data-cue]'));

    function cued() {
      return cues.some(function (c) {
        var r = c.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      });
    }

    /* How far the visitor has scrolled in total, not how far down they are —
       someone who has gone down and come back has still shown they know how.
       Remembered for the session, so arriving at a second page does not start
       the lesson over. */
    var travelled = 0, was = window.scrollY || 0;
    var learned = false;
    try { learned = window.sessionStorage.getItem(SCROLLED) === '1'; } catch (e) {}

    function count_travel() {
      var y = window.scrollY || 0;
      travelled += Math.abs(y - was);
      was = y;
      if (!learned && travelled > LEARNED * window.innerHeight) {
        learned = true;
        try { window.sessionStorage.setItem(SCROLLED, '1'); } catch (e) {}
      }
    }

    function room() {
      if (learned || quiet || count >= SHOWS) return false;
      var doc = document.documentElement;
      var max = (doc.scrollHeight || 0) - window.innerHeight;
      if (max <= FOOT || cued()) return false;
      return (window.scrollY || doc.scrollTop || 0) < max - FOOT;
    }

    /* Regions where being still is the point rather than a sign of being
       stuck. Drawing a pattern on the game board is the case that made this
       necessary: the pointer is busy, the page is not moving, and a hint
       telling you to scroll is the last thing you want over it. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-quiet]'), function (z) {
      z.addEventListener('pointerenter', function () { quiet = true; show(false); });
      z.addEventListener('pointerleave', function () { quiet = false; });
    });

    function show(on) {
      if (on === shown) return;
      shown = on;
      if (on) count++;
      el.classList.toggle('is-on', on);
      // out of the tab order and off the accessibility tree while invisible,
      // so it is never a control a keyboard lands on and cannot see
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
      el.tabIndex = on ? 0 : -1;
    }

    // armed even with nothing to scroll yet, because it re-checks when it
    // fires: the blog pages are their own short shell until the fetch lands
    function arm() {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { timer = 0; show(room()); }, STEADY);
    }

    /* Any input at all, not just scrolling. The whole misjudgement in the
       first version was equating "not scrolling" with "stuck": reading is not
       scrolling, and so is thinking with a hand on the mouse. A visitor doing
       anything is a visitor who does not need telling. */
    function settle() {
      show(false);
      arm();
    }

    function moved() {           // the page itself moved
      count_travel();
      settle();
    }

    /* A page that grows on its own — an archive rendering, a post arriving,
       a pinned scene being measured — has not been touched, so this only
       starts the clock when nothing else is going to. Growth that hid the
       hint or pushed its moment back meant the home page, which re-measures
       for as long as its scenes are settling, never showed one at all. */
    function grew() {
      if (shown || timer) return;
      arm();
    }

    el.addEventListener('click', function () {
      show(false);
      scrollTo((window.scrollY || 0) + window.innerHeight * 0.9);
    });

    window.addEventListener('scroll', moved, { passive: true });
    window.addEventListener('resize', settle);
    ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(function (t) {
      window.addEventListener(t, settle, { passive: true });
    });

    if (window.ResizeObserver) {
      var tall = 0;
      new window.ResizeObserver(function () {
        var h = document.documentElement.scrollHeight;
        if (h === tall) return;
        tall = h;
        grew();
      }).observe(document.body);
    }

    arm();
  }

  /* ── where a link into the page lands ──────────────────────────────── */

  /**
   * The y a link to `el` should scroll to.
   *
   * A scrollytelling section is not a place, it is a range. Its top is the
   * first frame of a scene that has not started yet, and for a pinned one that
   * frame is deliberately empty: #quote is more than three viewports tall and
   * opens on nothing at all, so Principle in the nav landed on a blank screen.
   *
   * `data-anchor` is how far into a section a link should go, as a fraction of
   * the distance that section travels past the top of the screen. Without it
   * the section's own top is the right answer, and this is what Lenis would
   * have worked out from the element itself — scroll-margin and the root's
   * scroll-padding included, which is what keeps the fixed nav off the
   * heading it just scrolled to.
   */
  function anchorY(el) {
    var pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    var margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    var top = el.getBoundingClientRect().top +
              (window.scrollY || window.pageYOffset || 0) - margin - pad;

    var frac = parseFloat(el.getAttribute('data-anchor'));
    if (frac > 0) {
      // how far it scrolls past the top of the screen, which for a pinned
      // section is the length of its pin
      var run = Math.max(0, el.offsetHeight - window.innerHeight);
      top += run * Math.min(1, frac);
    }
    return Math.max(0, Math.round(top));
  }

  /** What the URL hash points at, or null. getElementById rather than a
   *  selector: an id that is not a valid selector would throw. */
  function hashTarget() {
    var id = (window.location.hash || '').slice(1);
    if (!id) return null;
    try { return document.getElementById(decodeURIComponent(id)); } catch (e) { return null; }
  }

  /**
   * Honour the hash the page was opened with, once the page is actually
   * built.
   *
   * The browser's own hash scroll happens far too early to be right: before
   * the pinned scenes have added their spacing, before the fonts have settled
   * the measure, and while the intro still has the page locked. Arriving at
   * #contact from a blog entry landed at the top of the home page because of
   * it. This is the scroll that counts.
   *
   * It runs again on every ScrollTrigger refresh, because the page keeps
   * moving under it for a while after load: the fonts settle the measure, the
   * blog teaser replaces its placeholder rows with real ones, a pinned scene
   * is re-measured. Each of those shifts everything below it, and #contact —
   * which is the very bottom of the page — moved a hundred pixels between the
   * first landing and the last.
   *
   * It stands down on the first thing the visitor does, and in any case once
   * the page has had long enough to settle. Deciding that by comparing the
   * scroll position against where it was sent does not work: with smooth
   * scrolling the position is not readable straight afterwards, and a target
   * near the bottom of a page that is still growing gets clamped, so the
   * request and the result differ for reasons that have nothing to do with
   * the visitor. A gesture is unambiguous.
   */
  var SETTLE = 8000;                    // as long as the loader's own failsafe
  var landUntil = 0;

  function landing() {
    if (Date.now() > landUntil) return;
    var el = hashTarget();
    if (!el) return;

    var y = anchorY(el);
    if (lenis) {
      /* Lenis caches the page's dimensions and re-measures on a debounced
         observer, so on load its idea of the end of the page is whatever it
         was before the pinned scenes added their spacing — it clamped a
         target near the bottom to a limit seven thousand pixels short. This
         is the one call that has to be measuring the page as it is now. */
      lenis.resize();
      lenis.scrollTo(y, { immediate: true });
    } else {
      window.scrollTo(0, y);
    }
  }

  function watchTakeover() {
    landUntil = Date.now() + SETTLE;
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (t) {
      window.addEventListener(t, function () { landUntil = 0; }, { passive: true, once: true });
    });
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
      scrollTo(anchorY(el));
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

    watchTakeover();
    initAnchors();
    initSteady();
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
      landing();
    });

    // every re-measure is a chance for the anchor to have moved
    if (hasST) ST.addEventListener('refresh', landing);

    if (document.fonts && document.fonts.ready && hasST) {
      document.fonts.ready.then(function () { ST.refresh(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
