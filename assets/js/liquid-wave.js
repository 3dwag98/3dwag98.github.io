/* ============================================================================
   liquid-wave.js — the wave the loader's glyphs morph under.

   Only the liquid. The type stays where it was, as SVG in the DOM, and this
   draws underneath it with a transparent background — so the per-syllable
   morphs are still driven by GSAP, but what triggers them now looks like a
   fluid instead of a gradient sliding past.

   A gradient band could only ever be a rectangle moving left to right, which
   is what made the old wave read as a scan. Here the leading edge is warped by
   the same noise field that makes the body move, so the front arrives as a
   ragged tongue, thins where the flow stretches it and pools where it does not.

   Exposes window.CGWave.mount(canvas) → { set(progress), stop() }.
   ========================================================================= */

(function () {
  'use strict';

  var VERT = [
    'attribute vec2 p;',
    'varying vec2 v;',
    'void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'varying vec2 v;',
    'uniform vec2  uRes;',
    'uniform float uTime;',
    'uniform float uProg;',
    'uniform vec3  uAcc;',

    'float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }',

    'float noise(vec2 q){',
    '  vec2 i = floor(q), f = fract(q);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',

    'float fbm(vec2 q){',
    '  float s = 0.0, a = 0.5;',
    '  for (int i = 0; i < 3; i++){ s += a * noise(q); q *= 2.03; a *= 0.5; }',
    '  return s;',
    '}',

    /* fbm of an fbm — the thing that stops it looking like noise and makes it
       read as something being carried along. */
    'vec2 flow(vec2 q, float t){',
    '  vec2 a = vec2(fbm(q + vec2(0.0, t * 0.16)), fbm(q + vec2(5.2, 1.3 - t * 0.11)));',
    '  return vec2(fbm(q + 3.2 * a + vec2(1.7, 9.2)), fbm(q + 3.2 * a + vec2(8.3, 2.8))) - 0.5;',
    '}',

    'void main(){',
    '  vec2 uv = v;',
    '  float asp = uRes.x / max(uRes.y, 1.0);',
    '  vec2 q = vec2(uv.x * asp, uv.y) * 2.4;',

    '  vec2 fl = flow(q, uTime);',

    // the front, pushed about by the field so its edge is never straight
    '  float warp = fl.x * 0.26 + (fbm(q * 0.9 + uTime * 0.12) - 0.5) * 0.22;',
    '  float front = uProg * 1.45 - 0.24;',
    '  float edge  = (uv.x + warp) - front;',

    // the crest, and the thinner body trailing behind it
    '  float crest = exp(-edge * edge / 0.010);',
    '  float trail = smoothstep(0.36, -0.02, edge) * smoothstep(-0.62, -0.16, edge);',
    '  float mass  = clamp(crest + trail * 0.42, 0.0, 1.0);',

    // texture inside the body so it is not a flat wash
    '  float grain = 0.55 + 0.45 * fbm(q * 2.6 + vec2(uTime * 0.5, -uTime * 0.3));',
    '  float a = mass * grain;',

    // brighter along the crest, where a real one would catch the light
    '  vec3 col = uAcc * (0.55 + 0.85 * crest);',

    '  gl_FragColor = vec4(col * a, a);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  function hex(h) {
    h = (h || '').trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h || 'C6F24E', 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  window.CGWave = {
    /** Returns a handle, or null if WebGL is unavailable — the loader then
     *  simply runs without a wave rather than failing. */
    mount: function (canvas) {
      if (!canvas || !window.requestAnimationFrame) return null;

      var gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, premultipliedAlpha: true })
            || canvas.getContext('experimental-webgl');
      if (!gl) return null;

      var vs = compile(gl, gl.VERTEX_SHADER, VERT);
      var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return null;

      var prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied

      var U = {};
      ['uRes', 'uTime', 'uProg', 'uAcc'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

      /* Under-resolution on purpose: this is a soft field behind type, so
         drawing it below device resolution is invisible and several times
         cheaper — which is what keeps it smooth on a weak GPU. */
      function size() {
        var r = canvas.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.65;
        var w = Math.max(2, Math.round(r.width * dpr));
        var h = Math.max(2, Math.round(r.height * dpr));
        if (canvas.width === w && canvas.height === h) return;
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(U.uRes, w, h);
      }

      var accent = window.CGTheme ? window.CGTheme.token('--accent', '#C6F24E') : '#C6F24E';
      gl.uniform3fv(U.uAcc, hex(accent));
      size();

      var state = { prog: 0 };
      var t0 = 0;
      var raf = 0;
      var alive = true;

      function frame(now) {
        if (!alive) return;
        if (!t0) t0 = now;
        gl.uniform1f(U.uTime, (now - t0) / 1000);
        gl.uniform1f(U.uProg, state.prog);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        raf = window.requestAnimationFrame(frame);
      }
      raf = window.requestAnimationFrame(frame);

      var rt = 0;
      function onResize() { clearTimeout(rt); rt = setTimeout(size, 160); }
      window.addEventListener('resize', onResize);

      return {
        /** 0 → 1: where the front has reached. */
        set: function (p) { state.prog = p; },
        stop: function () {
          alive = false;
          if (raf) window.cancelAnimationFrame(raf);
          window.removeEventListener('resize', onResize);
        }
      };
    }
  };
})();
