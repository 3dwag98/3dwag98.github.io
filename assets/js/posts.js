/* ============================================================================
   posts.js — the one place that knows the shape of blog/posts.json.

   Manifest: { "posts": [ { slug, title, date, summary, tags, format, file,
                            readingTime, draft } ] }
   Only slug + title + date are required.
   ========================================================================= */

(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dateLabel(iso) {
    var d = new Date(String(iso) + (String(iso).length === 10 ? 'T00:00:00Z' : ''));
    if (isNaN(d.getTime())) return String(iso || '');
    return MONTHS[d.getUTCMonth()] + ' ' + String(d.getUTCDate()).padStart(2, '0') + ', ' + d.getUTCFullYear();
  }

  function readingTime(text) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220)) + ' min read';
  }

  function normalize(raw, base) {
    var slug = raw.slug || '';
    var format = (raw.format || (raw.file && /\.html?$/i.test(raw.file) ? 'html' : 'md')).toLowerCase();

    return {
      slug: slug,
      title: raw.title || slug,
      date: raw.date || '',
      dateLabel: dateLabel(raw.date),
      summary: raw.summary || raw.description || '',
      tags: Array.isArray(raw.tags) ? raw.tags : (raw.tags ? String(raw.tags).split(/\s*,\s*/) : []),
      format: format,
      file: base + (raw.file || ('posts/' + slug + '.' + (format === 'html' ? 'html' : 'md'))),
      readingTime: raw.readingTime || '',
      draft: !!raw.draft,
      url: base + 'post.html?p=' + encodeURIComponent(slug)
    };
  }

  /** @param {string} base path prefix to blog/ ('' on the blog, 'blog/' at home) */
  function load(base) {
    var prefix = base == null ? '' : base;
    var drafts = /[?&]drafts=1/.test(window.location.search);

    return fetch(prefix + 'posts.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('posts.json → HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        return (Array.isArray(data) ? data : (data.posts || []))
          .map(function (p) { return normalize(p, prefix); })
          .filter(function (p) { return p.slug && (drafts || !p.draft); })
          .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      });
  }

  function rowHTML(post, i) {
    return '' +
      '<a class="entry" href="' + esc(post.url) + '" data-cur="read" data-r>' +
        '<span class="entry__no">' + String((i || 0) + 1).padStart(2, '0') + '</span>' +
        '<span class="entry__main">' +
          '<span class="entry__title">' + esc(post.title) + '</span>' +
          (post.summary ? '<span class="entry__sum">' + esc(post.summary) + '</span>' : '') +
        '</span>' +
        '<span class="entry__meta">' +
          '<span>' + esc(post.dateLabel) + '</span>' +
          '<span>' + esc(post.readingTime || 'read') + '</span>' +
        '</span>' +
      '</a>';
  }

  /* ── loading state ─────────────────────────────────────────────────── */

  /** N entry-shaped placeholders. Built here rather than written into each
   *  document because all three places that show entries fetch them the same
   *  way, and a placeholder that drifts out of step with the row it stands in
   *  for is worse than none. */
  function skeletonHTML(n) {
    var row =
      '<div class="skel__row">' +
        '<span class="skel__bar skel__no"></span>' +
        '<span>' +
          '<span class="skel__bar skel__title"></span>' +
          '<span class="skel__bar skel__sum"></span>' +
        '</span>' +
        '<span class="skel__bar skel__meta"></span>' +
      '</div>';
    return '<div class="skel" aria-hidden="true">' + new Array(Math.max(1, n | 0) + 1).join(row) + '</div>';
  }

  /** Puts the placeholder up and hands back the function that takes it down.
   *  aria-busy rather than a live region: a screen reader should be told the
   *  container is filling, not read a description of grey bars. */
  function pending(el, n) {
    if (!el) return function () {};
    el.setAttribute('aria-busy', 'true');
    el.innerHTML = skeletonHTML(n);
    return function () { el.removeAttribute('aria-busy'); };
  }

  window.CGPosts = { load: load, rowHTML: rowHTML, dateLabel: dateLabel, readingTime: readingTime,
                     esc: esc, skeletonHTML: skeletonHTML, pending: pending };
})();
