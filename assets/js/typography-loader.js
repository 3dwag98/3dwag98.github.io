/* ============================================================================
   typography-loader.js — चिंतामणी गावडे → CHINTAMANI GAWADE, in WebGL.

   Both scripts are drawn to offscreen 2D canvases at viewport size and handed
   to the GPU as textures. A fragment shader then runs a real fluid field over
   them: domain-warped fbm gives a flow, an advancing front eats across the
   screen along an irregular noise-warped boundary, and every pixel decides for
   itself which script it is showing based on whether the front has reached it.

   Why WebGL and not the SVG filter this replaces: feDisplacementMap could only
   push pixels around inside a box, so the "wave" was a rectangular band moving
   left to right — a scan. A shader can make the boundary itself organic, tear
   the letterforms along it, refract through the ridge, and leave the liquid
   behind as a body that then floods the screen. That is the difference between
   something sweeping over type and something dissolving it.

   One GSAP tween drives one uniform. Everything else is derived in the shader.
   ========================================================================= */

(function () {
  'use strict';

  var MARATHI = 'चिंतामणी गावडे';
  var LATIN = 'CHINTAMANI GAWADE';

  var VERT = [
    'attribute vec2 p;',
    'varying vec2 v;',
    'void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'varying vec2 v;',
    'uniform sampler2D uDev;',      // the Marathi plate
    'uniform sampler2D uLat;',      // the Latin plate
    'uniform vec2  uRes;',
    'uniform float uTime;',
    'uniform float uProg;',         // 0 → 1, the whole sequence
    'uniform float uFlood;',        // 0 → 1, the liquid taking the screen
    'uniform vec3  uInk;',
    'uniform vec3  uAcc;',
    'uniform vec3  uPaper;',

    'float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }',

    'float noise(vec2 q){',
    '  vec2 i = floor(q), f = fract(q);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',

    'float fbm(vec2 q){',
    '  float s = 0.0, a = 0.5;',
    '  for (int i = 0; i < 3; i++){ s += a * noise(q); q *= 2.02; a *= 0.5; }',
    '  return s;',
    '}',

    /* Domain warping: fbm of an fbm. This is what stops the field looking like
       noise and makes it read as something flowing. */
    'vec2 flow(vec2 q, float t){',
    '  vec2 a = vec2(fbm(q + vec2(0.0, t * 0.15)), fbm(q + vec2(5.2, 1.3 - t * 0.12)));',
    '  vec2 b = vec2(fbm(q + 3.4 * a + vec2(1.7, 9.2)), fbm(q + 3.4 * a + vec2(8.3, 2.8)));',
    '  return b - 0.5;',
    '}',

    'void main(){',
    '  vec2 uv = v;',
    '  float asp = uRes.x / max(uRes.y, 1.0);',
    '  vec2 q = vec2(uv.x * asp, uv.y) * 2.6;',

    '  vec2 fl = flow(q, uTime);',

    /* The front travels left to right, but the boundary itself is warped by the
       flow, so it arrives as a ragged tongue rather than a straight edge. */
    '  float warp = fl.x * 0.30 + fbm(q * 0.8 + uTime * 0.1) * 0.16;',
    '  float front = uProg * 1.5 - 0.26;',
    '  float edge  = (uv.x + warp) - front;',

    /* Three things keyed off distance from the front: how far the pixel is
       dragged, how much it has already changed script, and the ridge of light
       sitting on the boundary. */
    '  float band = exp(-edge * edge / 0.0125);',
    '  float mixAmt = smoothstep(0.05, -0.05, edge);',

    '  vec2 push = fl * band * 0.085 + vec2(0.0, sin(uv.x * 9.0 + uTime * 1.6) * band * 0.012);',

    /* Sampled with a small per-channel offset through the ridge, so the liquid
       refracts rather than just smearing. */
    '  float ca = band * 0.012;',
    '  vec2 du = uv + push;',
    '  vec4 d0 = texture2D(uDev, du + vec2(ca, 0.0));',
    '  vec4 d1 = texture2D(uDev, du);',
    '  vec4 d2 = texture2D(uDev, du - vec2(ca, 0.0));',
    '  vec4 l0 = texture2D(uLat, du + vec2(ca, 0.0));',
    '  vec4 l1 = texture2D(uLat, du);',
    '  vec4 l2 = texture2D(uLat, du - vec2(ca, 0.0));',

    '  vec3 dev = vec3(d0.r, d1.g, d2.b) * d1.a;',
    '  vec3 lat = vec3(l0.r, l1.g, l2.b) * l1.a;',
    '  float devA = d1.a, latA = l1.a;',

    '  vec3 ink = mix(dev, lat, mixAmt);',
    '  float alpha = mix(devA, latA, mixAmt);',

    /* The body of liquid itself: bright along the ridge, tinted behind it. */
    '  float ridge = pow(band, 1.6);',
    '  vec3 col = mix(uPaper, ink, clamp(alpha, 0.0, 1.0));',
    '  col += uAcc * ridge * 0.55 * (0.35 + 0.65 * fbm(q * 2.0 + uTime));',
    '  col = mix(col, uAcc, ridge * 0.22 * alpha);',

    /* Flood: the liquid stops being an edge and becomes the whole surface. */
    '  float f = smoothstep(0.0, 1.0, uFlood);',
    '  float body = smoothstep(0.75, 0.0, length(uv - vec2(0.5)) - f * 1.25);',
    '  col = mix(col, uAcc, clamp(f * body * 1.6, 0.0, 1.0));',

    '  gl_FragColor = vec4(col, 1.0);',
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
    var n = parseInt(h || '000000', 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function token(name, fallback) {
    return (window.CGTheme && window.CGTheme.token(name, fallback)) || fallback;
  }

  /** Draws one line of text filling the given canvas, and returns it.
   *  `weight` is kept separate from `family` on purpose: the canvas font
   *  shorthand is [style] [weight] [size] [family], so folding a weight into
   *  the family string produces "500px 700 'Baloo'" — invalid, silently
   *  ignored, and the measurement then comes back from the 10px default. */
  function plate(w, h, text, family, weight, colour) {
    var font = function (px) { return weight + ' ' + px + 'px ' + family; };
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    if (!x) return null;

    x.clearRect(0, 0, w, h);
    x.fillStyle = colour;
    x.textAlign = 'center';
    x.textBaseline = 'middle';

    /* Grow the type until it spans the viewport, then back off by the margin.
       Measured rather than guessed, so both scripts fill the same box however
       different their natural widths are. */
    var size = Math.round(h * 0.5);
    x.font = font(size);
    var wide = x.measureText(text).width;
    var target = w * 0.94;
    size = Math.max(12, Math.floor(size * (target / Math.max(wide, 1))));

    // never so tall it clips its own ascenders and descenders
    size = Math.min(size, Math.floor(h * 0.6));
    x.font = font(size);

    x.fillText(text, w / 2, h / 2);

    return c;
  }

  /** Waits for the two display faces before anything is drawn to a canvas.
      Canvas 2D does not honour font-display: it will happily draw the fallback
      the instant it is asked, so the plates have to be gated explicitly. */
  function fontsReady(cb) {
    if (!document.fonts || !document.fonts.load) { cb(); return; }
    var done = false;
    function go() { if (!done) { done = true; cb(); } }

    Promise.all([
      document.fonts.load("700 120px 'Baloo'", MARATHI),
      document.fonts.load("400 120px 'Dela'", LATIN)
    ]).then(go).catch(go);

    // never hang the entry on a font that will not arrive
    setTimeout(go, 1400);
  }

  window.CGTypeLoader = {
    create: function (root) {
      var gsap = window.gsap;
      if (!gsap || !root) return null;

      var canvas = root.querySelector('[data-tl-canvas]');
      var pct = root.querySelector('[data-tl-pct]');
      if (!canvas) return null;

      var gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false })
            || canvas.getContext('experimental-webgl');
      if (!gl) return null;                      // caller falls back to no loader

      var prog = gl.createProgram();
      var vs = compile(gl, gl.VERTEX_SHADER, VERT);
      var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return null;
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      var U = {};
      ['uDev', 'uLat', 'uRes', 'uTime', 'uProg', 'uFlood', 'uInk', 'uAcc', 'uPaper']
        .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

      var texDev = gl.createTexture();
      var texLat = gl.createTexture();

      function upload(tex, src, unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      }

      var W = 0, H = 0;

      function build() {
        /* Under-resolution on purpose. Every pixel here runs several octaves
           of noise twice over, and the result is soft enough that rendering
           below device resolution is free to look at but several times
           cheaper to draw — which matters on a weak GPU, where a loader
           stuttering is worse than a loader being slightly soft. */
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.7;
        W = Math.max(2, Math.round(window.innerWidth * dpr));
        H = Math.max(2, Math.round(window.innerHeight * dpr));
        canvas.width = W; canvas.height = H;
        gl.viewport(0, 0, W, H);

        var ink = token('--ink', '#F4F6F2');
        var acc = token('--accent', '#C6F24E');

        var pd = plate(W, H, MARATHI, "'Baloo', sans-serif", '700', ink);
        var pl = plate(W, H, LATIN, "'Dela', sans-serif", '400', acc);
        if (pd) upload(texDev, pd, 0);
        if (pl) upload(texLat, pl, 1);

        gl.uniform1i(U.uDev, 0);
        gl.uniform1i(U.uLat, 1);
        gl.uniform2f(U.uRes, W, H);
        gl.uniform3fv(U.uInk, hex(ink));
        gl.uniform3fv(U.uAcc, hex(acc));
        gl.uniform3fv(U.uPaper, hex(token('--paper', '#0A0B0A')));
      }

      var state = { prog: 0, flood: 0 };
      var t0 = 0;
      var raf = 0;

      function frame(now) {
        if (!t0) t0 = now;
        gl.uniform1f(U.uTime, (now - t0) / 1000);
        gl.uniform1f(U.uProg, state.prog);
        gl.uniform1f(U.uFlood, state.flood);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        raf = window.requestAnimationFrame(frame);
      }
      raf = window.requestAnimationFrame(frame);

      var rt = 0;
      function onResize() { clearTimeout(rt); rt = setTimeout(build, 160); }
      window.addEventListener('resize', onResize);

      var counter = { v: 0 };
      var tl = gsap.timeline({
        paused: true,
        onComplete: function () {
          window.cancelAnimationFrame(raf);
          window.removeEventListener('resize', onResize);
        }
      });

      // hold on the Marathi, then the liquid crosses and takes the type with it
      tl.to(state, { prog: 1, duration: 2.15, ease: 'power1.inOut' }, 0.42)
        .to(counter, {
          v: 100, duration: 2.3, ease: 'power1.inOut',
          onUpdate: function () {
            if (pct) pct.textContent = String(Math.round(counter.v)).padStart(3, '0');
          }
        }, 0.2)
        // a beat on the finished Latin before the liquid claims the screen
        .to(state, { flood: 1, duration: 0.62, ease: 'power2.in' }, 3.0)
        .to(root, { yPercent: -100, duration: 0.72, ease: 'expo.inOut' }, 3.5);

      fontsReady(function () { build(); tl.play(); });

      return tl;
    }
  };
})();
