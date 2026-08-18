/* ============================================================================
   home.js — the scrollytelling scenes for the portfolio.

   Scene map
     00 hero       intro split + parallax + node field
     02 creed      pinned, scrubbed "get busy living OR get busy dying"
     03 stack      pinned horizontal rail of capability cards
     04 trajectory rule-draw + sticky company column
     05 impact     counters that tick up on entry
     07 logs       latest posts pulled from blog/posts.json

   Every scene is optional: if its markup is absent, or GSAP failed to load,
   the page still reads top to bottom as static content.
   ========================================================================= */

(function () {
  'use strict';

  var CG = window.CG || {};
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var reduced = CG.reduced || !gsap || !ST;

  /* ---------- helpers ---------------------------------------------------- */

  /** Wrap every character of `el` (nested tags kept) in <i class="ch">. */
  function splitChars(el) {
    var chars = [];

    (function walk(node, extra) {
      var kids = Array.prototype.slice.call(node.childNodes);

      kids.forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();

          String(child.nodeValue).split('').forEach(function (c) {
            if (c === ' ') { frag.appendChild(document.createTextNode(' ')); return; }
            var i = document.createElement('i');
            i.className = 'ch' + (extra ? ' ' + extra : '');
            i.style.fontStyle = 'normal';
            i.textContent = c;
            frag.appendChild(i);
            chars.push(i);
          });

          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child, child.classList.contains('key') ? 'ch--key' : extra);
        }
      });
    })(el, '');

    return chars;
  }

  function onScreen(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }

  /* ---------- 00. hero ---------------------------------------------------- */

  function heroIntro() {
    var name = document.querySelector('.hero__name');
    if (!name || reduced) return;

    var lines = name.querySelectorAll('span');
    var chars = [];
    Array.prototype.forEach.call(lines, function (l) { chars = chars.concat(splitChars(l)); });

    gsap.from(chars, {
      yPercent: 118,
      opacity: 0,
      duration: 1.15,
      ease: 'expo.out',
      stagger: { each: 0.022, from: 'start' }
    });
  }

  function heroParallax() {
    var hero = document.querySelector('.hero');
    if (!hero || reduced) return;

    gsap.timeline({
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.5 }
    })
      .to('.hero__name', { yPercent: -18, opacity: 0.25, ease: 'none' }, 0)
      .to('.hero__grid', { yPercent: -55, opacity: 0, ease: 'none' }, 0)
      .to('.hero__canvas', { yPercent: 14, opacity: 0, ease: 'none' }, 0)
      .to('.hero__scroll', { opacity: 0, duration: 0.15, ease: 'none' }, 0);
  }

  /* ---------- career uptime ---------------------------------------------- */

  function uptime() {
    var out = document.getElementById('uptime');
    if (!out) return;

    var since = Date.parse(out.getAttribute('data-since') || '2019-06-01T00:00:00Z');

    function tick() {
      var s = Math.max(0, Math.floor((Date.now() - since) / 1000));
      out.textContent =
        String(Math.floor(s / 86400)).padStart(4, '0') + 'd ' +
        String(Math.floor(s % 86400 / 3600)).padStart(2, '0') + 'h ' +
        String(Math.floor(s % 3600 / 60)).padStart(2, '0') + 'm ' +
        String(s % 60).padStart(2, '0') + 's';
    }

    tick();
    setInterval(tick, 1000);
  }

  /* ---------- scramble hover ---------------------------------------------- */

  function scramble() {
    var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>[]{}#$%&*';
    var pick = function () { return GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; };

    document.querySelectorAll('[data-scramble]').forEach(function (el) {
      var timer = null;

      el.addEventListener('mouseenter', function () {
        if (reduced) return;

        // Resolved at hover time: heroIntro() may have split this element into
        // <i class="ch"> nodes, and those must survive the effect.
        var chars = el.querySelectorAll('.ch');
        var nodes = chars.length
          ? Array.prototype.map.call(chars, function (c) { return { el: c, text: c.textContent }; })
          : [{ el: el, text: el.getAttribute('data-scramble') || el.textContent }];
        var isSplit = chars.length > 0;
        var total = isSplit ? nodes.length : nodes[0].text.length;
        var step = 0;

        clearInterval(timer);

        timer = setInterval(function () {
          if (isSplit) {
            nodes.forEach(function (n, i) { n.el.textContent = i < step ? n.text : pick(); });
          } else {
            nodes[0].el.textContent = nodes[0].text.split('').map(function (ch, i) {
              return i < step ? ch : (ch === ' ' ? ' ' : pick());
            }).join('');
          }

          if (step >= total) {
            clearInterval(timer);
            nodes.forEach(function (n) { n.el.textContent = n.text; });
          }

          step += 1 / 2.2;
        }, 30);
      });
    });
  }

  /* ---------- node field (hero canvas) ------------------------------------ */

  function nodeField() {
    var canvas = document.getElementById('node-field');
    var hero = document.querySelector('.hero');
    if (!canvas || !hero) return;

    if (reduced) { canvas.remove(); return; }

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, nodes = [], raf = null;
    var pointer = { x: -9999, y: -9999 };

    function resize() {
      var rect = hero.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      var count = Math.min(110, Math.round((w * h) / 16000));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.34,
          vy: (Math.random() - 0.5) * 0.34,
          r: Math.random() * 1.6 + 0.7
        });
      }
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);

      var link = Math.min(160, Math.max(90, w / 9));

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];

        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        // gentle repulsion from the pointer
        var px = pointer.x - n.x, py = pointer.y - n.y;
        var pd = Math.sqrt(px * px + py * py);
        if (pd < 130 && pd > 0.01) { n.x -= px / 48; n.y -= py / 48; }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(212,255,0,0.42)';
        ctx.fill();

        for (var j = i + 1; j < nodes.length; j++) {
          var m = nodes[j];
          var dx = n.x - m.x, dy = n.y - m.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < link) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(212,255,0,' + (0.16 * (1 - d / link)).toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(frame);
    }

    function play() { if (!raf) raf = requestAnimationFrame(frame); }
    function pause() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    window.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    }, { passive: true });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) pause(); else if (onScreen(hero)) play();
    });

    resize();
    play();

    // Stop burning frames once the hero has scrolled away.
    if (ST) {
      ST.create({ trigger: hero, start: 'top bottom', end: 'bottom top', onToggle: function (self) { self.isActive ? play() : pause(); } });
    }
  }

  /* ---------- 02. the creed (pinned + scrubbed) --------------------------- */

  function creed() {
    var section = document.querySelector('.creed');
    if (!section) return;

    var living = section.querySelector('.creed__line--living');
    var dying = section.querySelector('.creed__line--dying');
    var or = section.querySelector('.creed__or');
    var wash = section.querySelector('.creed__wash');
    var kicker = section.querySelector('.creed__kicker');
    var resolve = section.querySelector('.creed__resolve');
    var ekgLive = section.querySelector('#ekg-live');
    var ekgFlat = section.querySelector('#ekg-flat');

    // Build the trace geometry here so the SVG stays declarative in the HTML.
    if (ekgLive && ekgFlat) {
      var beat = function (x) {
        return 'L' + x + ',45 L' + (x + 9) + ',16 L' + (x + 19) + ',74 L' + (x + 28) + ',34 L' + (x + 36) + ',45 ';
      };
      ekgLive.setAttribute('d', 'M0,45 ' + beat(70) + beat(210) + beat(350) + 'L470,45');
      ekgFlat.setAttribute('d', 'M470,45 L900,45');
    }

    if (reduced) {
      section.style.setProperty('--creed-tint', 'var(--accent)');
      if (wash) wash.style.opacity = 0.6;
      [ekgLive, ekgFlat].forEach(function (p) { if (p) p.style.strokeDashoffset = 0; });
      return;
    }

    var livingChars = splitChars(living);
    var dyingChars = splitChars(dying);

    [ekgLive, ekgFlat].forEach(function (p) {
      if (!p) return;
      var len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
    });

    var tint = { p: 0 };
    var LIVE = '#d4ff00';
    var DEAD = '#ff4d2e';

    gsap.set([living, dying, or, resolve], { opacity: 0 });
    gsap.set(livingChars, { yPercent: 105, opacity: 0 });
    gsap.set(dyingChars, { yPercent: -60, opacity: 0 });
    gsap.set(or, { scale: 0.35, rotate: -8 });
    gsap.set(resolve, { y: 26 });

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=340%',
        pin: '.creed__pin',
        pinSpacing: true,
        scrub: 0.7,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        // Pins add height to the page. Refresh them before every other trigger
        // so the reveals and the chapter rail measure the final layout.
        refreshPriority: 20
      }
    });

    tl
      // the question is posed
      .fromTo(kicker, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.06 }, 0.01)
      .to(wash, { opacity: 1, duration: 0.2 }, 0.02)

      // LIVING assembles
      .to(living, { opacity: 1, duration: 0.01 }, 0.05)
      .to(livingChars, { yPercent: 0, opacity: 1, duration: 0.18, stagger: { each: 0.006, from: 'start' }, ease: 'expo.out' }, 0.05)
      .to(ekgLive, { strokeDashoffset: 0, duration: 0.16 }, 0.14)

      // the hinge
      .to(or, { opacity: 1, scale: 1, rotate: 0, duration: 0.1, ease: 'back.out(2.2)' }, 0.32)

      // DYING drops in, colour decays
      .to(dying, { opacity: 1, duration: 0.01 }, 0.42)
      .to(dyingChars, { yPercent: 0, opacity: 1, duration: 0.16, stagger: { each: 0.006, from: 'end' }, ease: 'expo.out' }, 0.42)
      .to(tint, {
        p: 1, duration: 0.16,
        onUpdate: function () { section.style.setProperty('--creed-tint', gsap.utils.interpolate(LIVE, DEAD, tint.p)); }
      }, 0.44)
      .to(ekgFlat, { strokeDashoffset: 0, duration: 0.16 }, 0.46)

      // the fork: dying pulls focus
      .to(living, { opacity: 0.24, scale: 0.97, duration: 0.1 }, 0.6)
      .to(dying, { scale: 1.03, duration: 0.1 }, 0.6)

      // ...and the answer: living wins, colour recovers
      .to(living, { opacity: 1, scale: 1.02, duration: 0.12 }, 0.72)
      .to(dying, { opacity: 0.16, scale: 0.96, duration: 0.12 }, 0.72)
      .to(tint, {
        p: 0, duration: 0.12,
        onUpdate: function () { section.style.setProperty('--creed-tint', gsap.utils.interpolate(LIVE, DEAD, tint.p)); }
      }, 0.72)
      .to(ekgFlat, { opacity: 0.25, duration: 0.1 }, 0.72)

      // the gloss lands
      .to(resolve, { opacity: 1, y: 0, duration: 0.12, ease: 'expo.out' }, 0.84)
      .to({}, { duration: 0.08 });
  }

  /* ---------- 03. stack (pinned horizontal) ------------------------------- */

  function stack() {
    var viewport = document.querySelector('.stack__viewport');
    var track = document.querySelector('.stack__track');
    if (!viewport || !track || reduced) return;

    var mm = gsap.matchMedia();

    mm.add('(min-width: 900px)', function () {
      viewport.classList.add('is-pinned');

      var distance = function () { return Math.max(0, track.scrollWidth - viewport.clientWidth); };

      var tween = gsap.to(track, {
        x: function () { return -distance(); },
        ease: 'none',
        scrollTrigger: {
          trigger: '.stack',
          start: 'top top',
          end: function () { return '+=' + (distance() + window.innerHeight * 0.4); },
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          refreshPriority: 10
        }
      });

      return function () {
        viewport.classList.remove('is-pinned');
        tween.scrollTrigger && tween.scrollTrigger.kill();
        tween.kill();
        gsap.set(track, { x: 0 });
      };
    });
  }

  /* ---------- 04. trajectory --------------------------------------------- */

  function trajectory() {
    if (reduced) return;

    document.querySelectorAll('.job__rule').forEach(function (rule) {
      gsap.fromTo(rule, { scaleX: 0 }, {
        scaleX: 1,
        duration: 1.1,
        ease: 'expo.out',
        scrollTrigger: { trigger: rule.parentElement, start: 'top 85%', once: true }
      });
    });
  }

  /* ---------- 05. impact counters ---------------------------------------- */

  function counters() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var prefix = el.getAttribute('data-prefix') || '';
      var suffix = el.getAttribute('data-suffix') || '';
      var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);

      var render = function (v) {
        var n = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US');
        el.textContent = prefix + n + suffix;
      };

      if (reduced) { render(target); return; }

      render(0);

      var proxy = { v: 0 };
      gsap.to(proxy, {
        v: target,
        duration: 1.9,
        ease: 'power2.out',
        onUpdate: function () { render(proxy.v); },
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  }

  /* ---------- 07. latest logs -------------------------------------------- */

  function logs() {
    var list = document.querySelector('[data-logs]');
    if (!list || !window.CGPosts) return;

    var limit = parseInt(list.getAttribute('data-logs') || '3', 10);

    window.CGPosts.load('blog/')
      .then(function (posts) {
        if (!posts.length) throw new Error('no posts');
        list.innerHTML = posts.slice(0, limit).map(window.CGPosts.rowHTML).join('');
        if (CG.reveal) CG.reveal(list);
        if (ST) ST.refresh();
      })
      .catch(function () {
        list.innerHTML = '<p class="logs__empty">// index unavailable — open <a class="mono mono--accent" href="blog/">/blog</a> for the full archive.</p>';
      });
  }

  /* ---------- go ---------------------------------------------------------- */

  function boot() {
    uptime();
    scramble();
    nodeField();
    heroIntro();
    heroParallax();
    creed();
    stack();
    trajectory();
    counters();
    logs();
    if (ST) ST.refresh();
  }

  if (CG.onReady) CG.onReady(boot);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
