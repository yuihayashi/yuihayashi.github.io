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

  // ---------- WebGL2 Fluid Shader Background (alpha overlay on image) ----------
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- WebGL2 context with alpha for transparency over background image ---
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: false });
  if (!gl) {
    canvas.style.display = "none";
    return;
  }

  // --- Shader sources (ref.html fluid domain-warping style) ---
  const vsSource = `#version 300 es
  in vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }`;

  const fsSource = `#version 300 es
  precision highp float;

  uniform vec2  u_resolution;
  uniform float u_time;
  uniform vec2  u_mouse;

  out vec4 outColor;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(random(i + vec2(0.0, 0.0)), random(i + vec2(1.0, 0.0)), u.x),
      mix(random(i + vec2(0.0, 1.0)), random(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(st);
      st *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    st.x *= u_resolution.x / u_resolution.y;
    st *= 3.0;

    // Domain warping (Inigo Quilez style)
    vec2 q = vec2(0.0);
    q.x = fbm(st + 0.03 * u_time);
    q.y = fbm(st + vec2(1.0));

    vec2 r = vec2(0.0);
    r.x = fbm(st + 1.0 * q + vec2(1.7, 9.2) + 0.15 * u_time);
    r.y = fbm(st + 1.0 * q + vec2(8.3, 2.8) + 0.12 * u_time);

    // Mouse interaction
    vec2 mouse = u_mouse / u_resolution.xy;
    mouse.x *= u_resolution.x / u_resolution.y;
    mouse.y = 1.0 - (u_mouse.y / u_resolution.y);
    float dist = distance(st, mouse * 3.0);
    r += exp(-dist * 3.0) * 0.8;

    float f = fbm(st + r);

    vec3 baseColor = vec3(0.02, 0.02, 0.03);
    vec3 fluidColor = vec3(0.5, 0.55, 0.6);

    vec3 color = mix(baseColor, fluidColor, smoothstep(0.1, 0.8, f));
    color += vec3(0.15) * smoothstep(0.3, 0.7, length(q));
    color += vec3(0.2) * smoothstep(0.4, 0.9, length(r));

    // Output with low alpha to overlay on background image
    float alpha = 0.55;
    outColor = vec4(color, alpha);
  }`;

  // --- Compile & link ---
  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader Error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = createShader(gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSource);
  if (!vertexShader || !fragmentShader) { canvas.style.display = "none"; return; }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program Link Error:", gl.getProgramInfoLog(program));
    canvas.style.display = "none";
    return;
  }
  gl.useProgram(program);

  // --- Fullscreen quad geometry ---
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // --- Uniform locations ---
  const uRes   = gl.getUniformLocation(program, "u_resolution");
  const uTime  = gl.getUniformLocation(program, "u_time");
  const uMouse = gl.getUniformLocation(program, "u_mouse");

  // --- Input state ---
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let running = true;
  const t0 = performance.now();

  function updateMouse(e) {
    if (e.touches && e.touches.length > 0) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
    } else {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }
  }
  window.addEventListener("mousemove", updateMouse);
  window.addEventListener("touchmove", updateMouse, { passive: true });

  // --- Resize ---
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  // --- Blending for alpha transparency ---
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // --- Page Visibility API ---
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(render);
  });

  // --- Render loop ---
  function render(now) {
    if (!running) return;
    const elapsed = reducedMotion ? 0.0 : (now - t0) * 0.001;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, elapsed);
    gl.uniform2f(uMouse, mouseX, mouseY);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (!reducedMotion) requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
});
