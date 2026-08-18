/* ============================================================================
   post.js — the article reader.

   Loads blog/posts.json, resolves ?p=<slug> to a file, renders Markdown
   (marked -> DOMPurify) or a raw HTML fragment, then decorates the result:
   heading anchors, table of contents with scroll-spy, code headers with a
   copy button, Prism highlighting and prev/next navigation.
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

  var slug = new URLSearchParams(window.location.search).get('p') ||
             new URLSearchParams(window.location.search).get('slug') || '';

  /* ---------- front matter ------------------------------------------------ */

  /** Parse a leading `---` block. Supports `key: value`, `[a, b]` lists and
   *  `- item` lists — enough for post metadata, deliberately not full YAML. */
  function frontMatter(text) {
    var m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m) return { data: {}, body: text };

    var data = {};
    var key = null;

    m[1].split(/\r?\n/).forEach(function (line) {
      var listItem = /^\s*-\s+(.*)$/.exec(line);
      if (listItem && key) {
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(unquote(listItem[1]));
        return;
      }

      var pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (!pair) return;

      key = pair[1];
      var value = pair[2].trim();

      if (value === '') { data[key] = ''; return; }

      if (/^\[.*\]$/.test(value)) {
        data[key] = value.slice(1, -1).split(',').map(function (v) { return unquote(v.trim()); }).filter(Boolean);
        return;
      }

      if (value === 'true' || value === 'false') { data[key] = value === 'true'; return; }

      data[key] = unquote(value);
    });

    return { data: data, body: text.slice(m[0].length) };
  }

  function unquote(v) {
    return String(v).replace(/^['"]|['"]$/g, '').trim();
  }

  /* ---------- render ------------------------------------------------------ */

  function toHTML(raw, format) {
    if (format === 'html') return raw;

    if (typeof window.marked === 'undefined') {
      return '<pre><code>' + esc(raw) + '</code></pre>';
    }

    window.marked.setOptions({ gfm: true, breaks: false });
    return window.marked.parse(raw);
  }

  function sanitize(html) {
    if (typeof window.DOMPurify === 'undefined') return html;
    return window.DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'rel', 'loading', 'id', 'class', 'colspan', 'rowspan'],
      FORBID_TAGS: ['style', 'form', 'input']
    });
  }

  function slugify(s) {
    return String(s).toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /* ---------- decoration -------------------------------------------------- */

  function decorate(container) {
    // Heading anchors + TOC
    var heads = container.querySelectorAll('h2, h3');
    var used = {};
    var toc = [];

    Array.prototype.forEach.call(heads, function (h) {
      var base = h.id || slugify(h.textContent);
      var id = base;
      var n = 2;
      while (used[id]) { id = base + '-' + n++; }
      used[id] = true;
      h.id = id;

      var a = document.createElement('a');
      a.className = 'anchor';
      a.href = '#' + id;
      a.textContent = '#';
      a.setAttribute('aria-label', 'Link to this section');
      h.appendChild(a);

      toc.push({ id: id, text: h.textContent.replace(/#$/, '').trim(), depth: h.tagName === 'H3' ? 3 : 2 });
    });

    if (els.toc) {
      if (toc.length > 1) {
        els.toc.innerHTML = '<h2>On this page</h2>' + toc.map(function (t) {
          return '<a href="#' + t.id + '" data-depth="' + t.depth + '">' + esc(t.text) + '</a>';
        }).join('');
        spy(toc);
      } else {
        els.toc.remove();
      }
    }

    // External links open away from the site
    Array.prototype.forEach.call(container.querySelectorAll('a[href^="http"]'), function (a) {
      if (a.hostname && a.hostname !== window.location.hostname) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
    });

    // Lazy images
    Array.prototype.forEach.call(container.querySelectorAll('img'), function (img) {
      img.loading = 'lazy';
      img.decoding = 'async';
    });

    // Code blocks: language label + copy button
    Array.prototype.forEach.call(container.querySelectorAll('pre > code'), function (code) {
      var pre = code.parentElement;
      var cls = /language-([\w-]+)/.exec(code.className || '');
      var lang = cls ? cls[1] : 'text';

      var head = document.createElement('div');
      head.className = 'code-head';
      head.innerHTML = '<span>' + esc(lang) + '</span>' +
                       '<button class="code-copy" type="button">copy</button>';
      pre.parentNode.insertBefore(head, pre);

      head.querySelector('.code-copy').addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var write = navigator.clipboard
          ? navigator.clipboard.writeText(code.textContent)
          : Promise.reject();

        write.then(function () {
          btn.textContent = 'copied';
          btn.classList.add('is-done');
          setTimeout(function () { btn.textContent = 'copy'; btn.classList.remove('is-done'); }, 1600);
        }).catch(function () {
          btn.textContent = 'select + copy';
          setTimeout(function () { btn.textContent = 'copy'; }, 1600);
        });
      });
    });

    if (window.Prism) window.Prism.highlightAllUnder(container);
  }

  function spy(toc) {
    if (!window.ScrollTrigger || CG.reduced) return;

    var links = els.toc.querySelectorAll('a');

    function light(id) {
      Array.prototype.forEach.call(links, function (a) {
        a.classList.toggle('is-on', a.getAttribute('href') === '#' + id);
      });
    }

    toc.forEach(function (t) {
      var target = document.getElementById(t.id);
      if (!target) return;
      window.ScrollTrigger.create({
        trigger: target,
        start: 'top 30%',
        end: 'bottom 30%',
        onToggle: function (self) { if (self.isActive) light(t.id); }
      });
    });
  }

  function neighbours(posts, index) {
    if (!els.nav) return;

    var newer = posts[index - 1];
    var older = posts[index + 1];
    var html = '';

    if (newer) html += '<a href="' + esc(newer.url) + '"><span>&larr; Newer</span><b>' + esc(newer.title) + '</b></a>';
    if (older) html += '<a href="' + esc(older.url) + '"><span>Older &rarr;</span><b>' + esc(older.title) + '</b></a>';

    if (html) els.nav.innerHTML = html; else els.nav.remove();
  }

  /* ---------- failure ----------------------------------------------------- */

  function fail(message) {
    if (els.title) els.title.textContent = 'Entry not found';
    if (els.meta) els.meta.innerHTML = '<span>404</span>';
    if (els.toc) els.toc.remove();
    if (els.nav) els.nav.remove();
    if (els.body) {
      els.body.innerHTML = '<p>' + esc(message) + '</p><p><a href="./">&larr; Back to all logs</a></p>';
    }
    document.title = 'Entry not found | cg_root logs';
  }

  /* ---------- go ---------------------------------------------------------- */

  if (!slug) { fail('No entry requested. Add ?p=<slug> to the URL.'); return; }

  window.CGPosts.load('')
    .then(function (posts) {
      var index = -1;
      for (var i = 0; i < posts.length; i++) { if (posts[i].slug === slug) { index = i; break; } }
      if (index === -1) throw new Error('No entry called "' + slug + '" in posts.json.');

      var post = posts[index];

      return fetch(post.file, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('Could not read ' + post.file + ' (HTTP ' + r.status + ').');
          return r.text();
        })
        .then(function (raw) {
          var parsed = post.format === 'html' ? { data: {}, body: raw } : frontMatter(raw);
          var meta = parsed.data;

          var title = meta.title || post.title;
          var date = meta.date || post.date;
          var tags = (meta.tags && meta.tags.length ? meta.tags : post.tags) || [];
          var read = post.readingTime || window.CGPosts.readingTime(parsed.body);
          var summary = meta.summary || post.summary;

          document.title = title + ' | cg_root logs';
          var desc = document.querySelector('meta[name="description"]');
          if (desc && summary) desc.setAttribute('content', summary);

          if (els.title) els.title.textContent = title;
          if (els.meta) {
            els.meta.innerHTML =
              '<span>' + esc(window.CGPosts.dateLabel(date)) + '</span>' +
              '<span class="dot">/</span><span>' + esc(read) + '</span>' +
              '<span class="dot">/</span><span>' + esc(post.format.toUpperCase()) + '</span>';
          }
          if (els.tags) {
            els.tags.innerHTML = tags.map(function (t) {
              return '<a class="tag" href="./?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
            }).join('');
          }

          els.body.innerHTML = sanitize(toHTML(parsed.body, post.format));
          decorate(els.body);
          neighbours(posts, index);

          if (CG.reveal) CG.reveal(root);
          if (window.ScrollTrigger) window.ScrollTrigger.refresh();

          // Deep link into a heading once the content exists.
          if (window.location.hash) {
            var target = document.querySelector(window.location.hash);
            if (target) setTimeout(function () { CG.scrollTo(target, { offset: -90 }); }, 60);
          }
        });
    })
    .catch(function (err) { fail(err.message); });
})();
