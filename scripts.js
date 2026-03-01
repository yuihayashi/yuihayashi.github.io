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

  // ---------- WebGL2 Fluid Shader Background (ref.html exact implementation) ----------
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;

  const gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("WebGL2 is not supported by your browser.");
    document.body.style.background = "linear-gradient(45deg, #050505, #1a1a1a)";
    return;
  }

  const vsSource = `#version 300 es
  in vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }`;

  const fsSource = `#version 300 es
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;

  out vec4 outColor;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix( mix( random( i + vec2(0.0,0.0) ), random( i + vec2(1.0,0.0) ), u.x),
                mix( random( i + vec2(0.0,1.0) ), random( i + vec2(1.0,1.0) ), u.x), u.y);
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

    vec2 q = vec2(0.0);
    q.x = fbm(st + 0.10 * u_time);
    q.y = fbm(st + vec2(1.0) + 0.07 * u_time);

    vec2 r = vec2(0.0);
    r.x = fbm(st + 2.0 * q + vec2(1.7, 9.2) + 0.40 * u_time);
    r.y = fbm(st + 2.0 * q + vec2(8.3, 2.8) + 0.32 * u_time);

    vec2 mouse = u_mouse / u_resolution.xy;
    mouse.x *= u_resolution.x / u_resolution.y;
    mouse.y = 1.0 - (u_mouse.y / u_resolution.y);

    float dist = distance(st, mouse);
    r += exp(-dist * 2.0) * 1.5;

    float f = fbm(st + r);

    // Fresh cyan + aqua palette with glossy highlights
    vec3 darkBase  = vec3(0.01, 0.03, 0.06);
    vec3 midTone   = vec3(0.08, 0.30, 0.42);
    vec3 freshCyan = vec3(0.10, 0.70, 0.85);
    vec3 aquaLight = vec3(0.35, 0.88, 0.95);
    vec3 white     = vec3(1.0, 1.0, 1.0);

    vec3 color = mix(darkBase, midTone, smoothstep(0.1, 0.5, f));
    float cyanMask = smoothstep(0.40, 0.70, f);
    color = mix(color, freshCyan, cyanMask * 0.65);
    color += vec3(0.03, 0.10, 0.14) * smoothstep(0.3, 0.7, length(q));
    color += vec3(0.02, 0.15, 0.22) * smoothstep(0.4, 0.9, length(r));

    // Water surface slimy / caustic reflection
    vec2 caustSt = st * 2.5 + r * 0.8;
    float caust1 = fbm(caustSt + vec2(0.3 * u_time, -0.2 * u_time));
    float caust2 = fbm(caustSt * 1.3 + vec2(-0.2 * u_time, 0.35 * u_time));
    float caustic = pow(smoothstep(0.35, 0.75, caust1 * caust2 * 2.5), 2.0);
    color += aquaLight * caustic * 0.45;

    // Specular / glossy highlights – sharp water reflection
    float specular = pow(smoothstep(0.60, 0.88, f), 4.0);
    color = mix(color, white, specular * 0.35);
    // Wet sheen based on domain warp intensity
    float sheen = pow(max(0.0, dot(normalize(r), vec2(0.707, 0.707))), 5.0);
    color += vec3(0.25, 0.40, 0.45) * sheen * 0.5;
    // Edge highlight – slimy rim light
    float rim = pow(1.0 - smoothstep(0.0, 0.6, f), 3.0);
    color += vec3(0.05, 0.18, 0.25) * rim * 0.6;

    outColor = vec4(color, 1.0);
  }`;

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

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program Link Error:", gl.getProgramInfoLog(program));
    return;
  }

  gl.useProgram(program);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1.0, -1.0,  1.0, -1.0, -1.0,  1.0,
    -1.0,  1.0,  1.0, -1.0,  1.0,  1.0,
  ]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const timeLocation = gl.getUniformLocation(program, "u_time");
  const mouseLocation = gl.getUniformLocation(program, "u_mouse");

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;

  function updateMousePosition(e) {
    if (e.touches && e.touches.length > 0) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY;
    } else {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }
  }

  window.addEventListener("mousemove", updateMousePosition);
  window.addEventListener("touchmove", updateMousePosition);

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    if (resolutionLocation) {
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    }
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const startTime = performance.now();
  let running = true;

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(render);
  });

  function render(currentTime) {
    if (!running) return;
    const elapsedTime = (currentTime - startTime) * 0.001;

    gl.useProgram(program);
    gl.uniform1f(timeLocation, elapsedTime);
    gl.uniform2f(mouseLocation, mouseX, mouseY);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
});
