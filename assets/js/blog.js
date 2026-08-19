/* ============================================================================
   blog.js — the archive: render, filter by tag, search.
   Filter state lives in the query string so a filtered view is linkable.
   ========================================================================= */

(function () {
  'use strict';

  var CG = window.CG || {};
  var list = document.querySelector('[data-log-list]');
  if (!list || !window.CGPosts) return;

  var esc = window.CGPosts.esc;
  var tagsEl = document.querySelector('[data-log-tags]');
  var input = document.querySelector('[data-log-search]');
  var countEl = document.querySelector('[data-log-count]');

  var params = new URLSearchParams(window.location.search);
  var state = { all: [], q: params.get('q') || '', tag: params.get('tag') || '' };

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
    return (post.title + ' ' + post.summary + ' ' + post.tags.join(' '))
      .toLowerCase().indexOf(state.q.toLowerCase()) !== -1;
  }

  function renderTags() {
    if (!tagsEl) return;

    var seen = {};
    state.all.forEach(function (p) { p.tags.forEach(function (t) { seen[t] = (seen[t] || 0) + 1; }); });

    var tags = Object.keys(seen).sort(function (a, b) { return seen[b] - seen[a] || a.localeCompare(b); });

    tagsEl.innerHTML =
      '<button class="chip' + (state.tag ? '' : ' is-on') + '" data-tag="">Everything</button>' +
      tags.map(function (t) {
        return '<button class="chip' + (state.tag === t ? ' is-on' : '') + '" data-tag="' + esc(t) + '">' +
               esc(t) + '<i>' + seen[t] + '</i></button>';
      }).join('');
  }

  function render() {
    if (CG.clearReveals) CG.clearReveals(list);

    var shown = state.all.filter(matches);

    list.innerHTML = shown.length
      ? shown.map(window.CGPosts.rowHTML).join('')
      : '<p class="blogs__empty">Nothing matches <b>' + esc(state.q || state.tag) + '</b>. Clear the filter to see everything.</p>';

    if (shown.length && CG.reveal) CG.reveal(list);
    if (countEl) countEl.textContent = String(shown.length).padStart(2, '0');

    renderTags();
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  if (input) {
    input.value = state.q;
    input.addEventListener('input', function () { state.q = input.value.trim(); syncURL(); render(); });
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

  window.CGPosts.load('')
    .then(function (posts) {
      state.all = posts;
      if (!posts.length) {
        list.innerHTML = '<p class="blogs__empty">The archive is empty. First entry pending.</p>';
        return;
      }
      render();
    })
    .catch(function (err) {
      list.innerHTML = '<p class="blogs__empty">Could not read <b>posts.json</b> — ' + esc(err.message) +
        '. If you opened this file directly, serve the folder over HTTP instead.</p>';
    });
})();
