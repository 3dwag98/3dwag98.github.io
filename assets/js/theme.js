/* ============================================================================
   theme.js — dark is the default; light is a choice the visitor can make.

   The stored preference is applied by a tiny inline script in <head> before
   first paint (see any page's <head>), so there is never a flash. This file
   only handles the toggle and tells everything that paints its own pixels —
   the WebGL surface, the game canvas, the plates — that the palette moved.

   Listen with:  window.addEventListener('cg:theme', e => e.detail.theme)
   ========================================================================= */

(function () {
  'use strict';

  var KEY = 'cg-theme';
  var root = document.documentElement;

  function current() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  /** Read a resolved token, so callers never hardcode a hex. */
  function token(name, fallback) {
    var v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback || '';
  }

  function announce() {
    window.dispatchEvent(new CustomEvent('cg:theme', {
      detail: {
        theme: current(),
        paper: token('--paper', '#0A0B0A'),
        ink: token('--ink', '#F4F6F2'),
        accent: token('--accent', '#C6F24E'),
        mute: token('--mute', '#858C80'),
        line: token('--line', 'rgba(244,246,242,0.15)')
      }
    }));
  }

  function apply(theme, persist) {
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');

    // The quote passage writes these inline while it interpolates; clearing
    // them lets the stylesheet win again after a toggle.
    ['--paper', '--paper-2', '--ink', '--ink-2', '--mute', '--line', '--accent', '--on-accent']
      .forEach(function (n) { root.style.removeProperty(n); });
    root.classList.remove('is-inverted');

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F4F4EF' : '#0A0B0A');

    if (persist) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
    announce();
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    e.preventDefault();
    var next = current() === 'light' ? 'dark' : 'light';
    apply(next, true);
    btn.setAttribute('aria-label', next === 'light' ? 'Switch to dark' : 'Switch to light');
  });

  window.CGTheme = { current: current, token: token, set: function (t) { apply(t, true); } };

  // Give anything that already booted the initial palette.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce);
  else announce();
})();
