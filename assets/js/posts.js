/* ============================================================================
   posts.js — one place that knows how blog/posts.json is shaped.

   Used by the home page teaser, the logs index and the article reader, so the
   manifest contract only ever has to change here.

   Manifest: { "posts": [ { slug, title, date, summary, tags, format, file,
                            readingTime, draft, cover } ] }
   Only slug + title + date are required; everything else has a sane default.
   ========================================================================= */

(function () {
  'use strict';

  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dateLabel(iso) {
    var d = new Date(String(iso) + (String(iso).length === 10 ? 'T00:00:00Z' : ''));
    if (isNaN(d.getTime())) return String(iso || '');
    return String(d.getUTCDate()).padStart(2, '0') + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function readingTime(text) {
    var words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220)) + ' min read';
  }

  function normalize(raw, base) {
    var slug = raw.slug || '';
    var format = (raw.format || (raw.file && /\.html?$/i.test(raw.file) ? 'html' : 'md')).toLowerCase();
    var file = raw.file || ('posts/' + slug + '.' + (format === 'html' ? 'html' : 'md'));

    return {
      slug: slug,
      title: raw.title || slug,
      date: raw.date || '',
      dateLabel: dateLabel(raw.date),
      summary: raw.summary || raw.description || '',
      tags: Array.isArray(raw.tags) ? raw.tags : (raw.tags ? String(raw.tags).split(/\s*,\s*/) : []),
      format: format,
      file: base + file,
      readingTime: raw.readingTime || '',
      cover: raw.cover || '',
      draft: !!raw.draft,
      url: base + 'post.html?p=' + encodeURIComponent(slug)
    };
  }

  /**
   * Fetch + normalize the manifest.
   * @param {string} base  path prefix to blog/ from the current page ('' or 'blog/')
   */
  function load(base) {
    var prefix = base == null ? '' : base;
    var showDrafts = /[?&]drafts=1/.test(window.location.search);

    return fetch(prefix + 'posts.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('posts.json -> HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data.posts || []);
        return list
          .map(function (p) { return normalize(p, prefix); })
          .filter(function (p) { return p.slug && (showDrafts || !p.draft); })
          .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      });
  }

  function rowHTML(post) {
    var tags = post.tags.slice(0, 3).map(function (t) {
      return '<span class="tag">' + esc(t) + '</span>';
    }).join('');

    return '' +
      '<a class="post-row" href="' + esc(post.url) + '" data-anim="rise-sm">' +
        '<div class="post-row__date">' + esc(post.dateLabel) + '</div>' +
        '<div>' +
          '<h3 class="post-row__title">' + esc(post.title) + '</h3>' +
          (post.summary ? '<p class="post-row__sum">' + esc(post.summary) + '</p>' : '') +
          (tags ? '<div class="post-row__tags">' + tags + '</div>' : '') +
        '</div>' +
        '<div class="post-row__read">' + esc(post.readingTime || 'read') + '</div>' +
      '</a>';
  }

  window.CGPosts = {
    load: load,
    rowHTML: rowHTML,
    dateLabel: dateLabel,
    readingTime: readingTime,
    esc: esc
  };
})();
