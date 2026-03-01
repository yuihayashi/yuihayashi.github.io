/* ============================================
   Yui Hayashi — Website Scripts
   ============================================ */

document.addEventListener("DOMContentLoaded", () => {
  // ---------- Navigation scroll effect ----------
  const nav = document.querySelector(".nav");
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 80) {
        nav.classList.add("scrolled");
      } else {
        nav.classList.remove("scrolled");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---------- Fade-in on scroll (IntersectionObserver) ----------
  const fadeEls = document.querySelectorAll(".fade-in");
  if (fadeEls.length > 0 && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    fadeEls.forEach((el) => observer.observe(el));
  }

  // ---------- Smooth scroll for anchor links ----------
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const target = document.querySelector(anchor.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // ---------- WebGL2 Shader Background ----------
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DPR_CAP = 1.5;

  // --- WebGL2 context (fallback to WebGL1) ---
  let gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  let isWebGL2 = true;
  if (!gl) {
    gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    isWebGL2 = false;
  }
  if (!gl) {
    canvas.style.background = "#0a0a0a";
    return;
  }

  // --- Shader sources (WebGL2) ---
  const VS_SRC = `#version 300 es
  in vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  const FS_SRC = `#version 300 es
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_pointer;
  uniform float u_scroll;
  out vec4 outColor;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 6; i++) { v += a * noise(p); p = rot * p * 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float t = u_time * 0.08;

    // Domain warping — organic flow
    float w1 = fbm(p * 2.5 + vec2(t * 0.7, t * 0.5));
    float w2 = fbm(p * 2.5 + vec2(w1 * 0.8 + t * 0.3, w1 * 0.6 - t * 0.2));
    float w3 = fbm(p * 3.0 + vec2(w2 * 0.6, w2 * 0.4 + t * 0.15));

    float n1 = fbm(p * 1.8 + vec2(0.0, t * 0.4) + w2 * 0.5);
    float n2 = fbm(p * 2.2 + vec2(t * 0.25, 0.0) + w3 * 0.4);
    float m  = smoothstep(0.2, 0.8, 0.55 * n1 + 0.45 * n2);

    // Pointer influence
    vec2 ptr = u_pointer * vec2(aspect, 1.0) - vec2(aspect * 0.5, 0.5);
    float pInf = smoothstep(0.5, 0.0, length(p - ptr)) * 0.06;

    // Color palette — deep dark tones
    vec3 cA = vec3(0.035, 0.04, 0.065);
    vec3 cB = vec3(0.065, 0.08, 0.12);
    vec3 cC = vec3(0.025, 0.03, 0.045);
    vec3 cD = vec3(0.05, 0.055, 0.085);

    vec3 col = mix(cA, cB, m);
    col = mix(col, cD, w3 * 0.5);
    col = mix(col, cC, 0.2 + 0.15 * sin(t * 2.5 + w2 * 3.0));
    col += pInf;

    // Subtle bright streaks
    float streak = smoothstep(0.62, 0.68, w2) * smoothstep(0.72, 0.68, w2);
    col += streak * vec3(0.03, 0.035, 0.055);

    // Vignette
    float r = length(uv - 0.5);
    col *= mix(0.4, 1.0, smoothstep(0.85, 0.2, r));

    // Film grain
    col += (hash(uv * u_resolution.xy + fract(u_time * 13.7)) - 0.5) * 0.04;

    // Scroll dimming
    col *= 1.0 - u_scroll * 0.05;

    outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

  // --- Shader sources (WebGL1 fallback — simplified) ---
  const VS_SRC_V1 = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  const FS_SRC_V1 = `
  precision highp float;
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform vec2  u_pointer;
  uniform float u_scroll;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0,0.0));
    float c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float t = u_time * 0.08;
    float m = smoothstep(0.2, 0.8,
      0.55 * fbm(p * 2.0 + vec2(0.0, t * 0.4)) +
      0.45 * fbm(p * 2.5 + vec2(t * 0.25, 0.0)));
    vec3 col = mix(vec3(0.035,0.04,0.065), vec3(0.065,0.08,0.12), m);
    col *= mix(0.4, 1.0, smoothstep(0.85, 0.2, length(uv - 0.5)));
    col += (hash(uv * u_resolution.xy + fract(u_time * 13.7)) - 0.5) * 0.04;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

  // --- Compile & link helpers ---
  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("Shader compile error:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function createProgram(vsSrc, fsSrc) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("Program link error:", gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  // WebGL2 → WebGL1 fallback chain
  let program = isWebGL2 ? createProgram(VS_SRC, FS_SRC) : null;
  if (!program) {
    program = createProgram(VS_SRC_V1, FS_SRC_V1);
    if (!program) { canvas.style.background = "#0a0a0a"; return; }
  }
  gl.useProgram(program);

  // --- Fullscreen triangle geometry ---
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // --- Uniform locations ---
  const uTime    = gl.getUniformLocation(program, "u_time");
  const uRes     = gl.getUniformLocation(program, "u_resolution");
  const uPointer = gl.getUniformLocation(program, "u_pointer");
  const uScroll  = gl.getUniformLocation(program, "u_scroll");

  // --- Input state ---
  let pointerX = 0.5, pointerY = 0.5;
  let scrollNorm = 0;
  let running = true;
  const t0 = performance.now();

  document.addEventListener("mousemove", (e) => {
    pointerX = e.clientX / window.innerWidth;
    pointerY = 1.0 - e.clientY / window.innerHeight;
  });

  window.addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollNorm = max > 0 ? window.scrollY / max : 0;
  }, { passive: true });

  // --- Resize (DPR capped at 1.5) ---
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  resize();
  window.addEventListener("resize", resize);

  // --- Page Visibility API ---
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(frame);
  });

  // --- Render loop ---
  function frame(now) {
    if (!running) return;
    const elapsed = (now - t0) / 1000.0;
    gl.uniform1f(uTime, reducedMotion ? 0.0 : elapsed);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform2f(uPointer, pointerX, pointerY);
    gl.uniform1f(uScroll, scrollNorm);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reducedMotion) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
});
