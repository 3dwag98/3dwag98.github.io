/* ============================================================================
   post.js — the reader.

   ?p=<slug> → manifest lookup → fetch the file → Markdown (marked) or an HTML
   fragment → DOMPurify → .prose, then: heading anchors, a table of contents
   that tracks scroll, code headers with copy, Prism, prev/next.
   ========================================================================= */

(function () {
  'use strict';

  var CG = window.CG || {};
  var esc = window.CGPosts ? window.CGPosts.esc : function (s) { return s; };

  var root = document.querySelector('[data-article]');
  if (!root || !window.CGPosts) return;

  var els = {
    title: document.querySelector('[data-post-title]'),
    meta: document.querySelector('[data-post-meta]'),
    tags: document.querySelector('[data-post-tags]'),
    body: document.querySelector('[data-post-body]'),
    toc: document.querySelector('[data-post-toc]'),
    nav: document.querySelector('[data-post-nav]')
  };

  var q = new URLSearchParams(window.location.search);
  var slug = q.get('p') || q.get('slug') || '';

  /* ── front matter ──────────────────────────────────────────────────── */

  function unquote(v) { return String(v).replace(/^['"]|['"]$/g, '').trim(); }

  /** Leading `---` block. `key: value`, `[a, b]` and `- item` lists — enough
   *  for post metadata, deliberately not full YAML. */
  function frontMatter(text) {
    var m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m) return { data: {}, body: text };

    var data = {};
    var key = null;

    m[1].split(/\r?\n/).forEach(function (line) {
      var item = /^\s*-\s+(.*)$/.exec(line);
      if (item && key) {
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(unquote(item[1]));
        return;
      }

      var pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (!pair) return;

      key = pair[1];
      var v = pair[2].trim();

      if (v === '') data[key] = '';
      else if (/^\[.*\]$/.test(v)) data[key] = v.slice(1, -1).split(',').map(function (x) { return unquote(x); }).filter(Boolean);
      else if (v === 'true' || v === 'false') data[key] = v === 'true';
      else data[key] = unquote(v);
    });

    return { data: data, body: text.slice(m[0].length) };
  }

  /* ── render ────────────────────────────────────────────────────────── */

  function toHTML(raw, format) {
    if (format === 'html') return raw;
    if (!window.marked) return '<pre><code>' + esc(raw) + '</code></pre>';
    window.marked.setOptions({ gfm: true, breaks: false });
    return window.marked.parse(raw);
  }

  function sanitize(html) {
    if (!window.DOMPurify) return html;
    return window.DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'rel', 'loading', 'id', 'class', 'colspan', 'rowspan'],
      FORBID_TAGS: ['style', 'form', 'input']
    });
  }

  function slugify(s) {
    return String(s).toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  }

  /* ── decoration ────────────────────────────────────────────────────── */

  function decorate(container) {
    var used = {};
    var toc = [];

    Array.prototype.forEach.call(container.querySelectorAll('h2, h3'), function (h) {
      var base = h.id || slugify(h.textContent);
      var id = base;
      var n = 2;
      while (used[id]) id = base + '-' + n++;
      used[id] = true;
      h.id = id;

      var a = document.createElement('a');
      a.className = 'anchor';
      a.href = '#' + id;
      a.textContent = '¶';
      a.setAttribute('aria-label', 'Link to this section');
      h.appendChild(a);

      toc.push({ id: id, text: h.textContent.replace(/¶$/, '').trim(), depth: h.tagName === 'H3' ? 3 : 2 });
    });

    if (els.toc) {
      if (toc.length > 1) {
        els.toc.innerHTML = '<p class="lbl">Contents</p>' + toc.map(function (t) {
          return '<a href="#' + t.id + '" data-depth="' + t.depth + '">' + esc(t.text) + '</a>';
        }).join('');
        spy(toc);
      } else {
        els.toc.remove();
      }
    }

    Array.prototype.forEach.call(container.querySelectorAll('a[href^="http"]'), function (a) {
      if (a.hostname && a.hostname !== window.location.hostname) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    });

    Array.prototype.forEach.call(container.querySelectorAll('img'), function (img) {
      img.loading = 'lazy'; img.decoding = 'async';
    });

    Array.prototype.forEach.call(container.querySelectorAll('pre > code'), function (code) {
      var pre = code.parentElement;
      var cls = /language-([\w-]+)/.exec(code.className || '');
      var head = document.createElement('div');

      head.className = 'code-head';
      head.innerHTML = '<span>' + esc(cls ? cls[1] : 'text') + '</span><button class="code-copy" type="button">Copy</button>';
      pre.parentNode.insertBefore(head, pre);

      head.querySelector('.code-copy').addEventListener('click', function (e) {
        var btn = e.currentTarget;
        (navigator.clipboard ? navigator.clipboard.writeText(code.textContent) : Promise.reject())
          .then(function () {
            btn.textContent = 'Copied';
            btn.classList.add('is-done');
            setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('is-done'); }, 1600);
          })
          .catch(function () {
            btn.textContent = 'Select + copy';
            setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
          });
      });
    });

    if (window.Prism) window.Prism.highlightAllUnder(container);
  }

  function spy(toc) {
    if (!window.ScrollTrigger || !CG.motion) return;

    var links = els.toc.querySelectorAll('a');

    toc.forEach(function (t) {
      var target = document.getElementById(t.id);
      if (!target) return;

      window.ScrollTrigger.create({
        trigger: target,
        start: 'top 28%',
        end: 'bottom 28%',
        onToggle: function (self) {
          if (!self.isActive) return;
          Array.prototype.forEach.call(links, function (a) {
            a.classList.toggle('is-on', a.getAttribute('href') === '#' + t.id);
          });
        }
      });
    });
  }

  function neighbours(posts, i) {
    if (!els.nav) return;

    var newer = posts[i - 1];
    var older = posts[i + 1];
    var html = '';

    if (newer) html += '<a href="' + esc(newer.url) + '" data-cur="read"><span class="lbl">Newer</span><b>' + esc(newer.title) + '</b></a>';
    if (older) html += '<a href="' + esc(older.url) + '" data-cur="read"><span class="lbl">Older</span><b>' + esc(older.title) + '</b></a>';

    if (html) els.nav.innerHTML = html; else els.nav.remove();
  }

  function fail(message) {
    if (els.title) els.title.textContent = 'Not found';
    if (els.meta) els.meta.innerHTML = '<span>404</span>';
    if (els.toc) els.toc.remove();
    if (els.nav) els.nav.remove();
    if (els.body) els.body.innerHTML = '<p>' + esc(message) + '</p><p><a href="./">Back to the archive &rarr;</a></p>';
    document.title = 'Not found · Logs';
  }

  /* ── go ────────────────────────────────────────────────────────────── */

  if (!slug) { fail('No entry requested. Add ?p=<slug> to the URL.'); return; }

  window.CGPosts.load('')
    .then(function (posts) {
      var i = -1;
      for (var k = 0; k < posts.length; k++) if (posts[k].slug === slug) { i = k; break; }
      if (i === -1) throw new Error('No entry called "' + slug + '" in posts.json.');

      var post = posts[i];

      return fetch(post.file, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('Could not read ' + post.file + ' (HTTP ' + r.status + ').');
          return r.text();
        })
        .then(function (raw) {
          var parsed = post.format === 'html' ? { data: {}, body: raw } : frontMatter(raw);
          var meta = parsed.data;

          var title = meta.title || post.title;
          var tags = (meta.tags && meta.tags.length ? meta.tags : post.tags) || [];
          var read = post.readingTime || window.CGPosts.readingTime(parsed.body);
          var summary = meta.summary || post.summary;

          document.title = title + ' · Logs';
          var desc = document.querySelector('meta[name="description"]');
          if (desc && summary) desc.setAttribute('content', summary);

          if (els.title) els.title.textContent = title;

          if (els.meta) {
            els.meta.innerHTML =
              '<span>' + esc(window.CGPosts.dateLabel(meta.date || post.date)) + '</span>' +
              '<span>' + esc(read) + '</span>' +
              '<span>' + esc(post.format.toUpperCase()) + '</span>';
          }

          if (els.tags) {
            els.tags.innerHTML = tags.map(function (t) {
              return '<a class="chip" href="./?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
            }).join('');
          }

          els.body.innerHTML = sanitize(toHTML(parsed.body, post.format));
          decorate(els.body);
          neighbours(posts, i);

          if (CG.revealLines) CG.revealLines(root);
          if (CG.reveal) CG.reveal(root);
          if (window.ScrollTrigger) window.ScrollTrigger.refresh();

          if (window.location.hash) {
            var target = document.querySelector(window.location.hash);
            if (target) setTimeout(function () { CG.scrollTo(target, { offset: -100 }); }, 80);
          }
        });
    })
    .catch(function (err) { fail(err.message); });
})();
