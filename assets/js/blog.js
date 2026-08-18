/* ============================================================================
   blog.js — the logs index: render, search, tag filter.
   Reads blog/posts.json through CGPosts and keeps state in the query string
   so a filtered view is linkable.
   ========================================================================= */

(function () {
  'use strict';

  var CG = window.CG || {};
  var list = document.querySelector('[data-log-list]');
  if (!list || !window.CGPosts) return;

  var statusEl = document.querySelector('[data-log-status]');
  var tagsEl = document.querySelector('[data-log-tags]');
  var input = document.querySelector('[data-log-search]');
  var countEl = document.querySelector('[data-log-count]');

  var params = new URLSearchParams(window.location.search);
  var state = {
    all: [],
    q: params.get('q') || '',
    tag: params.get('tag') || ''
  };

  function syncURL() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.tag) p.set('tag', state.tag);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
  }

  function matches(post) {
    if (state.tag && post.tags.indexOf(state.tag) === -1) return false;
    if (!state.q) return true;

    var needle = state.q.toLowerCase();
    return (post.title + ' ' + post.summary + ' ' + post.tags.join(' '))
      .toLowerCase()
      .indexOf(needle) !== -1;
  }

  function renderTags() {
    if (!tagsEl) return;

    var seen = {};
    state.all.forEach(function (p) {
      p.tags.forEach(function (t) { seen[t] = (seen[t] || 0) + 1; });
    });

    var tags = Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a] || a.localeCompare(b); });

    tagsEl.innerHTML =
      '<button class="tag' + (state.tag ? '' : ' is-on') + '" data-tag="">All</button>' +
      tags.map(function (t) {
        return '<button class="tag' + (state.tag === t ? ' is-on' : '') + '" data-tag="' +
               window.CGPosts.esc(t) + '">' + window.CGPosts.esc(t) + ' <span style="opacity:.5;margin-left:.4em">' + seen[t] + '</span></button>';
      }).join('');
  }

  function render() {
    var shown = state.all.filter(matches);

    if (CG.clearReveals) CG.clearReveals(list);

    if (!shown.length) {
      list.innerHTML = '<p class="log-status">// no entries match <b>' +
        window.CGPosts.esc(state.q || state.tag) + '</b> &mdash; try clearing the filter.</p>';
    } else {
      list.innerHTML = shown.map(window.CGPosts.rowHTML).join('');
      if (CG.reveal) CG.reveal(list);
    }

    if (countEl) countEl.textContent = String(shown.length).padStart(2, '0');
    renderTags();
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  /* ---------- events ------------------------------------------------------ */

  if (input) {
    input.value = state.q;
    input.addEventListener('input', function () {
      state.q = input.value.trim();
      syncURL();
      render();
    });
  }

  if (tagsEl) {
    tagsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-tag]');
      if (!btn) return;
      state.tag = btn.getAttribute('data-tag');
      syncURL();
      render();
    });
  }

  /* ---------- load -------------------------------------------------------- */

  window.CGPosts.load('')
    .then(function (posts) {
      state.all = posts;

      if (!posts.length) {
        list.innerHTML = '<p class="log-status">// the archive is empty. First entry pending.</p>';
        if (statusEl) statusEl.textContent = '00 entries';
        return;
      }

      render();
    })
    .catch(function (err) {
      list.innerHTML = '<p class="log-status">// could not read <b>posts.json</b> &mdash; ' +
        window.CGPosts.esc(err.message) +
        '. If you opened this file directly, serve the folder over HTTP instead ' +
        '(<code>python3 -m http.server</code>).</p>';
    });
})();
