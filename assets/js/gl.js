/* ============================================================================
   gl.js — the moving surface behind the masthead.

   A single full-screen quad with a domain-warped fbm shader: slow ridges
   drifting across the page ground with a vermilion filament that answers the
   scroll and the pointer. Its three colours come from the live theme. Hand-written WebGL rather than a 3D library, because a
   full-screen fragment shader needs no scene graph — this is ~4 KB where
   three.js would be ~740 KB for the same pixels.

   Degrades to the CSS background if WebGL is unavailable or motion is reduced.
   ========================================================================= */

(function () {
  'use strict';

  var VERT = [
    'attribute vec2 p;',
    'void main(){ gl_Position = vec4(p, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  uRes;',
    'uniform float uTime;',
    'uniform float uScroll;',
    'uniform vec2  uPtr;',
    'uniform float uFade;',
    'uniform vec3  uPaper;',
    'uniform vec3  uInk;',
    'uniform vec3  uAcc;',

    'float hash(vec2 v){ return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453123); }',

    'float noise(vec2 v){',
    '  vec2 i = floor(v), f = fract(v);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',

    'float fbm(vec2 v){',
    '  float s = 0.0, a = 0.5;',
    '  for (int i = 0; i < 5; i++) { s += a * noise(v); v *= 2.02; a *= 0.5; }',
    '  return s;',
    '}',

    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  vec2 p  = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
    '  float t = uTime * 0.028 + uScroll * 0.6;',

    /* two rounds of domain warping — this is what makes it read as flow
       rather than as clouds */
    '  vec2 q = vec2(fbm(p * 1.4 + t), fbm(p * 1.4 + vec2(5.2, 1.3) - t));',
    '  vec2 r = vec2(fbm(p * 1.9 + 3.4 * q + vec2(1.7, 9.2) + 0.13 * t),',
    '                fbm(p * 1.9 + 3.4 * q + vec2(8.3, 2.8) - 0.11 * t));',
    '  float f = fbm(p * 1.7 + 3.6 * r);',

    /* thin contour bands, like a plotter following the field */
    '  float bands = abs(sin(f * 11.0 - t * 1.6 + uScroll * 3.0));',
    '  float ink   = smoothstep(0.55, 0.0, bands) * 0.5;',
    '  float depth = smoothstep(0.25, 0.95, f);',

    /* one vermilion filament, riding the crest */
    '  float fil = smoothstep(0.972, 1.0, 1.0 - bands) * smoothstep(0.35, 0.75, f);',

    /* a soft warm lift under the pointer */
    '  float glow = exp(-length(p - uPtr) * 3.1) * 0.16;',

    '  vec3 col = uPaper;',
    '  col = mix(col, uInk, ink * (0.07 + depth * 0.10));',
    '  col = mix(col, uAcc, fil * 0.42 + glow * 0.4);',

    /* vignette + dither so the gradients never band on a wide gamut screen */
    '  col *= 1.0 - 0.10 * pow(length(uv - 0.5) * 1.35, 2.2);',
    '  col += (hash(gl_FragCoord.xy) - 0.5) * 0.012;',

    '  gl_FragColor = vec4(col, uFade);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('gl:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function hex(v) {
    var n = parseInt(v.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function Surface(canvas, opts) {
    var o = opts || {};
    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' })
          || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('gl link failed'); return null; }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ['uRes', 'uTime', 'uScroll', 'uPtr', 'uFade', 'uPaper', 'uInk', 'uAcc'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    gl.uniform3fv(U.uPaper, hex(o.paper || '#EFEAE1'));
    gl.uniform3fv(U.uInk, hex(o.ink || '#14120F'));
    gl.uniform3fv(U.uAcc, hex(o.accent || '#E4441A'));
    gl.uniform1f(U.uFade, 1);

    var scale = o.scale || 0.62;               // render under-res; it is all soft
    var w = 0, h = 0;
    var state = { time: 0, scroll: 0, ptr: [0, 0], target: [0, 0] };

    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 1.6) * scale;
      w = Math.max(1, Math.round(r.width * dpr));
      h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uRes, w, h);
    }

    function frame(dt) {
      state.time += dt;
      state.ptr[0] += (state.target[0] - state.ptr[0]) * 0.045;
      state.ptr[1] += (state.target[1] - state.ptr[1]) * 0.045;
      gl.uniform1f(U.uTime, state.time);
      gl.uniform1f(U.uScroll, state.scroll);
      gl.uniform2f(U.uPtr, state.ptr[0], state.ptr[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    resize();

    return {
      resize: resize,
      frame: frame,
      setPalette: function (c) {
        gl.useProgram(prog);
        if (c.paper) gl.uniform3fv(U.uPaper, hex(c.paper));
        if (c.ink) gl.uniform3fv(U.uInk, hex(c.ink));
        if (c.accent) gl.uniform3fv(U.uAcc, hex(c.accent));
      },
      setScroll: function (v) { state.scroll = v; },
      setPointer: function (x, y) { state.target[0] = x; state.target[1] = y; },
      lost: function () { return gl.isContextLost(); }
    };
  }

  window.CGSurface = Surface;
})();
