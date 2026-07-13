/* ============================================================
   Yui Hayashi — Deep-Sea Fish School Background
   WebGL2, zero dependencies.
   - Procedural fish geometry, instanced rendering
   - Boids flocking simulation (separation / alignment / cohesion,
     predator avoidance, pointer flee, wandering attractor)
   - Deep-sea gradient + god rays + marine snow
   - Scroll = diving deeper, pointer = parallax + flee
   ============================================================ */
(() => {
  "use strict";

  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    depth: true,
    powerPreference: "high-performance",
  });
  if (!gl) {
    document.body.classList.add("no-webgl");
    return;
  }

  /* ---------------- Shader helpers ---------------- */

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("Shader error:", gl.getShaderInfoLog(sh), src);
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(vsSrc, fsSrc) {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Link error:", gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  /* ---------------- Background (deep-sea gradient + god rays) ---------------- */

  const BG_VS = `#version 300 es
  void main() {
    vec2 v[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
    gl_Position = vec4(v[gl_VertexID], 0.0, 1.0);
  }`;

  const BG_FS = `#version 300 es
  precision highp float;
  uniform vec2  u_resolution;
  uniform float u_time;
  uniform float u_scroll;
  uniform vec3  u_camPos;
  uniform vec3  u_camRight;
  uniform vec3  u_camUp;
  uniform vec3  u_camFwd;
  uniform float u_tanFov;
  uniform vec3  u_waterShallow;   // sunlit turquoise near the surface
  uniform vec3  u_waterDeep;      // emerald depth below
  uniform vec3  u_skyHorizon;
  uniform vec3  u_skyZenith;
  uniform vec3  u_sunCol;
  uniform vec3  u_sunDir;         // world direction toward the sun
  uniform vec2  u_sunScreen;      // sun position in NDC
  uniform float u_sunVis;
  uniform vec3  u_cloudCol;
  uniform float u_cloudAmt;
  uniform float u_starAmt;
  uniform float u_lightAmp;
  out vec4 outColor;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  // Rippled ocean surface height: three drifting wave sets.
  float wave(vec2 q, float t) {
    float w = 0.0;
    w += noise(q * 1.0 + vec2(t * 0.060, t * 0.021)) * 0.60;
    w += noise(q * 2.3 - vec2(t * 0.052, t * 0.080)) * 0.28;
    w += noise(q * 4.7 + vec2(-t * 0.110, t * 0.048)) * 0.12;
    return w;
  }

  // The sky, seen through Snell's window.
  vec3 sky(vec3 d, float t) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 s = mix(u_skyHorizon, u_skyZenith, pow(h, 0.65));

    // Sun disc and its halo.
    float sd = max(dot(d, u_sunDir), 0.0);
    s += u_sunCol * (pow(sd, 700.0) * 4.0 + pow(sd, 28.0) * 0.4);

    // Stars first, then clouds cover them.
    vec2 cp = d.xz / (d.y + 0.18);
    if (u_starAmt > 0.01 && d.y > 0.02) {
      vec2 spos = cp * 34.0;
      vec2 cell = floor(spos);
      float star = step(0.994, hash(cell));
      star *= smoothstep(0.16, 0.02, length(fract(spos) - 0.5));
      star *= 0.6 + 0.4 * sin(t * 2.0 + hash(cell + 7.0) * 6.2832);
      s += vec3(0.85, 0.92, 1.0) * star * u_starAmt * clamp(d.y * 2.0, 0.0, 1.0);
    }
    if (d.y > 0.03) {
      float cl = fbm(cp * 2.0 + vec2(t * 0.010, t * 0.004));
      float cm = smoothstep(0.50, 0.95, cl) * u_cloudAmt * clamp(d.y * 2.6, 0.0, 1.0);
      s = mix(s, u_cloudCol * (0.75 + 0.25 * cl), cm);
    }
    return s;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 ndc = uv * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    vec3 rd = normalize(u_camFwd
      + u_camRight * (ndc.x * u_tanFov * aspect)
      + u_camUp * (ndc.y * u_tanFov));
    float t = u_time;
    float deep = clamp(u_scroll, 0.0, 1.0);

    // The water body: sunlit turquoise upward, emerald below.
    float vg = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 water = mix(u_waterDeep, u_waterShallow, pow(vg, 1.55));
    float murk = fbm(rd.xy * 2.0 + vec2(t * 0.020, -t * 0.013));
    water += u_waterShallow * 0.09 * murk;
    vec3 col = water;

    // Looking up: raycast the rippling surface plane overhead.
    float surfY = 14.0;
    if (rd.y > 0.02 && u_camPos.y < surfY - 0.5) {
      float dist = (surfY - u_camPos.y) / rd.y;
      vec3 P = u_camPos + rd * dist;

      // Wave normal from finite differences of the height field.
      // Distant waves flatten out (both physically and to avoid aliasing).
      vec2 q = P.xz * 0.13;
      float e = 0.14;
      float h0 = wave(q, t);
      float amp = 3.2 * exp(-dist * 0.018);
      vec3 n = normalize(vec3(
        (h0 - wave(q + vec2(e, 0.0), t)) * amp,
        1.0,
        (h0 - wave(q + vec2(0.0, e), t)) * amp));

      // Refract out into the air — or reflect back at the rim of the window.
      // Fresnel uses the transmitted angle so reflectance reaches 1 smoothly
      // at the critical angle instead of jumping into total reflection.
      vec3 refr = refract(rd, -n, 1.33);
      float c = clamp(dot(rd, n), 0.0, 1.0);
      float cosT = clamp(dot(normalize(refr + vec3(1e-6)), n), 0.0, 1.0);
      float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

      // What the underside of the surface mirrors: the water body itself,
      // plus the sun's broken glitter path.
      vec3 mirror = mix(water * 1.18, u_waterShallow * 1.25, 0.35);
      vec3 hv = normalize(u_sunDir - rd);
      float glint = pow(max(dot(n, hv), 0.0), 90.0);
      mirror += u_sunCol * glint * 1.8 * u_lightAmp;

      vec3 surf;
      if (dot(refr, refr) < 0.5) {
        surf = mirror;                      // total internal reflection
      } else {
        surf = mix(sky(normalize(refr), t), mirror, F);
        surf += vec3(0.10, 0.22, 0.30) * pow(1.0 - c, 3.0);  // window rim fringe
      }

      // Even clear tropical water absorbs light over distance, and rays
      // that graze the surface dissolve into scattered turquoise.
      float f = 1.0 - exp(-dist * 0.032);
      f = max(f, 1.0 - smoothstep(0.15, 0.50, rd.y));
      col = mix(surf, water, f);
    }

    // Sun shafts: screen-space rays radiating from the sun, bent by the water.
    vec2 p = ndc * 0.5 * vec2(aspect, 1.0);
    vec2 sp = u_sunScreen * 0.5 * vec2(aspect, 1.0);
    vec2 ld = p - sp;
    float bend = (fbm(p * 1.4 + vec2(t * 0.05, -t * 0.03)) - 0.5) * 0.5;
    float ang = atan(ld.x, -ld.y) + bend;
    float rays = pow(smoothstep(0.40, 0.95, fbm(vec2(ang * 6.0 + t * 0.050, t * 0.06))), 2.0);
    float rays2 = pow(smoothstep(0.50, 0.95, fbm(vec2(ang * 10.0 - t * 0.035, 4.2 + t * 0.05))), 2.4);
    float atten = smoothstep(2.0, 0.25, length(ld));
    col += u_sunCol * (rays + rays2 * 0.55) * atten * 0.36 * u_lightAmp * u_sunVis * (1.0 - deep * 0.55);

    // Slow breathing of the light.
    col *= 1.0 + 0.035 * sin(t * 0.23);

    // Vignette + grain.
    float vig = smoothstep(1.35, 0.4, length(p));
    col *= mix(0.78, 1.0, vig);
    col += (hash(uv * u_resolution + fract(t) * 13.7) - 0.5) * 0.010;

    outColor = vec4(col, 1.0);
  }`;

  /* ---------------- Fish (instanced, undulating in the vertex shader) ---------------- */

  const FISH_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in vec3 a_pos;
  layout(location = 1) in vec3 a_normal;
  layout(location = 2) in vec3 i_pos;
  layout(location = 3) in vec3 i_fwd;
  layout(location = 4) in vec3 i_up;
  layout(location = 5) in vec4 i_misc;    // scale, phase, tailFreq, glow
  layout(location = 6) in vec3 i_color;
  layout(location = 7) in vec4 i_shape;   // bodyHeight, bodyLength, finSize, stripes

  uniform mat4  u_proj;
  uniform mat4  u_view;
  uniform float u_time;

  out vec3  v_normal;
  out vec3  v_color;
  out vec3  v_viewPos;
  out vec3  v_worldPos;
  out float v_glow;
  out vec4  v_body;    // body coord s, local normal y, stripes, bar phase

  void main() {
    float scale = i_misc.x;
    float phase = i_misc.y;
    float freq  = i_misc.z;

    vec3 p = a_pos;
    vec3 n = a_normal;

    // Per-species proportions morph one base mesh into many silhouettes:
    // deep-bodied reef fish, slender needlefish, broad-finned cruisers...
    float isFin = max(step(a_pos.x, -0.49), step(0.17, abs(a_pos.y)));
    p.y *= i_shape.x * mix(1.0, i_shape.z, isFin);
    p.z *= 0.7 + 0.3 * i_shape.x;
    p.x *= i_shape.y;

    // Undulation: a lateral wave travelling nose -> tail; the fin swings widest.
    float s = clamp(0.5 - a_pos.x, 0.0, 1.6);
    float arg = phase + u_time * freq - s * 2.8;
    float amp = 0.012 + 0.115 * s * s;
    p.z += sin(arg) * amp;
    p.z += sin(phase + u_time * freq) * 0.01;

    // Approximate the normal shear caused by the bend.
    float slope = cos(arg) * 2.8 * amp;
    n = normalize(vec3(n.x + slope * n.z * 0.6, n.y, n.z));

    vec3 right = normalize(cross(i_fwd, i_up));
    mat3 rot = mat3(i_fwd, i_up, right);   // local x -> forward, y -> up, z -> right

    vec3 world = i_pos + rot * (p * scale);

    // Refraction shimmer: the further away, the more the moving water
    // between us and the fish bends its apparent position.
    float wf = clamp(-world.z * 0.0125, 0.0, 1.0);
    float shim = 0.16 * wf;
    world.x += sin(u_time * 1.7 + world.z * 0.55 + world.y * 0.35) * shim;
    world.y += sin(u_time * 1.25 + world.x * 0.5 + world.z * 0.25 + 2.1) * shim * 0.7;

    vec4 viewPos = u_view * vec4(world, 1.0);

    v_viewPos = viewPos.xyz;
    v_worldPos = world;
    v_normal = rot * n;
    v_color = i_color;
    v_glow = i_misc.w;
    v_body = vec4(s, a_normal.y, i_shape.w, fract(phase * 0.6366) * 6.2832);
    gl_Position = u_proj * viewPos;
  }`;

  const FISH_FS = `#version 300 es
  precision highp float;
  in vec3  v_normal;
  in vec3  v_color;
  in vec3  v_viewPos;
  in vec3  v_worldPos;
  in float v_glow;
  in vec4  v_body;

  uniform vec2  u_resolution;
  uniform float u_time;
  uniform float u_fogDensity;
  uniform float u_caust;
  uniform vec3  u_fogTop;
  uniform vec3  u_fogBottom;
  uniform vec3  u_lightCol;
  uniform vec3  u_lightDir;
  uniform float u_ambient;
  uniform float u_glowBoost;
  uniform vec3  u_causticCol;

  out vec4 outColor;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec3 N = normalize(v_normal);
    if (!gl_FrontFacing) N = -N;   // fins are two-sided
    vec3 V = normalize(-v_viewPos);

    // Pigmentation: darker back, silvery belly, optional vertical bars.
    vec3 base = v_color;
    float belly = smoothstep(0.35, -0.55, v_body.y);
    base = mix(base * 0.78, mix(base, vec3(0.72, 0.78, 0.82), 0.55), belly);
    float bars = smoothstep(0.15, 0.65, sin(v_body.x * 19.0 + v_body.w));
    base = mix(base, base * 0.30, bars * v_body.z);

    vec3 L = normalize(u_lightDir);
    float lambert = dot(N, L) * 0.5 + 0.5;
    float topLight = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);   // counter-shading

    float shade = (0.30 + 0.90 * lambert * lambert) * (0.55 + 0.45 * topLight);
    vec3 col = base * shade * mix(vec3(0.92), u_lightCol, 0.50) * (0.42 + 0.72 * u_ambient);
    // Ambient wrap: clear water scatters soft turquoise light onto every side.
    col += base * mix(u_fogBottom, u_fogTop, 0.65) * 1.5 * u_ambient;

    // Silvery scale glint, tinted by the hour.
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 42.0);
    col += mix(vec3(0.60, 0.75, 0.85), u_lightCol, 0.55) * spec * 0.65 * (0.5 + 0.5 * u_ambient);

    // Underwater fresnel sheen with a faint iridescent shift.
    float fres = pow(1.0 - abs(dot(N, V)), 3.0);
    col += mix(vec3(0.18, 0.42, 0.52), u_lightCol * 0.6, 0.45) * fres * 0.55 * (0.45 + 0.55 * u_ambient);
    col += (0.5 + 0.5 * sin(6.2832 * (fres * 0.9 + vec3(0.00, 0.33, 0.66)))) * fres * 0.07;

    // Backlight bleeding through thin fins and tail when the fish
    // passes between us and the sun.
    float thin = 0.30 + 0.70 * smoothstep(0.5, 1.4, v_body.x);
    col += u_lightCol * pow(max(dot(V, -L), 0.0), 6.0) * 0.45 * thin * u_ambient;

    // Caustic light net dancing across the backs of the fish.
    vec2 cq = v_worldPos.xz * 0.55 + vec2(u_time * 0.34, u_time * 0.21);
    float ca = noise(cq) * noise(cq * 1.7 + 3.1);
    float caust = pow(smoothstep(0.16, 0.58, ca), 2.0);
    float caustFade = clamp((v_worldPos.y + 40.0) / 55.0, 0.12, 1.0);
    col += u_causticCol * 1.15 * caust * clamp(N.y, 0.0, 1.0) * caustFade * u_caust;

    // Bioluminescent individuals pulse softly — brightest after dark.
    col += vec3(0.35, 0.95, 1.0) * v_glow * (0.6 + 0.4 * sin(u_time * 2.1 + v_viewPos.x * 0.8)) * u_glowBoost;

    // Depth fog: fish dissolve into the same water the background paints.
    float fog = 1.0 - exp(-length(v_viewPos) * u_fogDensity);
    float sy = clamp(gl_FragCoord.y / u_resolution.y, 0.0, 1.0);
    vec3 fogCol = mix(u_fogBottom, u_fogTop, sy);
    col = mix(col, fogCol, fog);

    outColor = vec4(col, 1.0);
  }`;

  /* ---------------- Marine snow (procedural points) ---------------- */

  const SNOW_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in float a_seed;
  uniform mat4  u_proj;
  uniform mat4  u_view;
  uniform float u_time;
  uniform float u_pointScale;
  out float v_alpha;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    float h1 = hash(a_seed), h2 = hash(a_seed + 1.3);
    float h3 = hash(a_seed + 2.7), h4 = hash(a_seed + 4.1);
    float span = 60.0;
    float fall = u_time * (0.30 + h4 * 0.75);
    vec3 pos;
    pos.x = (h1 * 2.0 - 1.0) * 42.0 + sin(u_time * 0.28 + a_seed) * 1.6;
    pos.y = mod(h2 * span - fall, span) - span * 0.5 - 8.0;
    pos.z = -6.0 - h3 * 58.0;

    vec4 vp = u_view * vec4(pos, 1.0);
    gl_Position = u_proj * vp;
    float size = 0.05 + h4 * 0.11;
    gl_PointSize = clamp(u_pointScale * size / max(1.0, -vp.z), 0.75, 7.0);
    v_alpha = (0.045 + 0.085 * h1) * smoothstep(-66.0, -8.0, vp.z);
  }`;

  const SNOW_FS = `#version 300 es
  precision highp float;
  in float v_alpha;
  uniform vec3 u_tint;
  out vec4 outColor;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float a = smoothstep(1.0, 0.0, dot(c, c)) * v_alpha;
    outColor = vec4(u_tint * a, 1.0);
  }`;

  const bgProg = link(BG_VS, BG_FS);
  const fishProg = link(FISH_VS, FISH_FS);
  const snowProg = link(SNOW_VS, SNOW_FS);
  if (!bgProg || !fishProg || !snowProg) {
    document.body.classList.add("no-webgl");
    return;
  }

  /* ---------------- Procedural fish geometry ----------------
     Local space: +x forward (nose at x=+0.5, tail base at x=-0.5),
     +y up, +z lateral. Elliptic body rings + caudal / dorsal fins. */

  function buildFishGeometry() {
    const SEG = 12, RAD = 10;
    const positions = [], normals = [], indices = [];

    const prof = (s) => {
      const t = Math.min(Math.max(s, 0), 1);
      return [
        0.155 * Math.sin(Math.PI * Math.pow(t, 0.62)) + 0.004,           // half height
        0.075 * Math.sin(Math.PI * Math.pow(t, 0.85)) * (1 - 0.22 * t) + 0.004, // half width
      ];
    };

    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      const x = 0.5 - s;
      const [h, w] = prof(s);
      const [h2, w2] = prof(s + 0.01);
      const drds = ((h2 + w2) - (h + w)) / 2 / 0.01;   // taper slope -> normal x
      for (let j = 0; j < RAD; j++) {
        const a = (j / RAD) * Math.PI * 2;
        const cy = Math.cos(a), sz = Math.sin(a);
        positions.push(x, h * cy, w * sz);
        let ny = cy / Math.max(h, 1e-4), nz = sz / Math.max(w, 1e-4);
        const inv = 1 / Math.hypot(ny, nz);
        ny *= inv; nz *= inv;
        let nx = drds;
        const inv2 = 1 / Math.hypot(nx, ny, nz);
        normals.push(nx * inv2, ny * inv2, nz * inv2);
      }
    }
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < RAD; j++) {
        const j2 = (j + 1) % RAD;
        const a = i * RAD + j, b = i * RAD + j2;
        const c = (i + 1) * RAD + j, d = (i + 1) * RAD + j2;
        indices.push(a, c, b, b, c, d);
      }
    }

    // Nose and tail caps.
    const noseIdx = positions.length / 3;
    positions.push(0.53, 0, 0); normals.push(1, 0, 0);
    for (let j = 0; j < RAD; j++) {
      indices.push(noseIdx, j, (j + 1) % RAD);
    }
    const tailIdx = positions.length / 3;
    positions.push(-0.52, 0, 0); normals.push(-1, 0, 0);
    const lastRing = SEG * RAD;
    for (let j = 0; j < RAD; j++) {
      indices.push(tailIdx, lastRing + (j + 1) % RAD, lastRing + j);
    }

    // Flat fins in the z=0 plane (two-sided in the fragment shader).
    function addFan(rootX, rootY, pts) {
      const base = positions.length / 3;
      positions.push(rootX, rootY, 0); normals.push(0, 0, 1);
      for (const [x, y] of pts) { positions.push(x, y, 0); normals.push(0, 0, 1); }
      for (let k = 0; k < pts.length - 1; k++) {
        indices.push(base, base + 1 + k, base + 2 + k);
      }
    }
    // Caudal fin: forked V shape.
    addFan(-0.50, 0, [[-0.48, 0.045], [-0.92, 0.30], [-0.76, 0.0], [-0.92, -0.30], [-0.48, -0.045]]);
    // Dorsal fin.
    addFan(-0.10, 0.10, [[-0.02, 0.115], [-0.17, 0.235], [-0.30, 0.09]]);
    // Small anal fin.
    addFan(-0.24, -0.09, [[-0.18, -0.10], [-0.30, -0.16], [-0.34, -0.075]]);

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices),
    };
  }

  /* ---------------- Boids simulation ---------------- */

  const COUNT = isMobile ? 140 : 250;

  // shape: [bodyHeight, bodyLength, finSize, stripes]
  const SPECIES = [
    { // 0: sardine school — the silver cloud
      frac: 0.52, scale: [0.55, 0.85],
      sepR: 1.5, aliR: 3.6, cohR: 6.0,
      sepW: 2.0, aliW: 1.0, cohW: 0.6,
      cruise: 5.2, max: 10.5, min: 2.4, force: 30,
      glow: 0, shape: [1.0, 1.0, 1.0, 0.0],
      color(r) { const v = 0.85 + r() * 0.3; return [0.50 * v, 0.62 * v, 0.70 * v]; },
    },
    { // 1: big deep-bodied cruisers drifting through the school
      frac: 0.10, scale: [1.5, 2.15],
      sepR: 3.4, aliR: 5.5, cohR: 9.0,
      sepW: 1.7, aliW: 0.7, cohW: 0.4,
      cruise: 2.9, max: 5.2, min: 1.4, force: 12,
      glow: 0, shape: [1.12, 1.18, 1.05, 0.0],
      color(r) { const v = 0.8 + r() * 0.3; return [0.20 * v, 0.30 * v, 0.40 * v]; },
    },
    { // 2: bioluminescent stragglers
      frac: 0.06, scale: [0.42, 0.58],
      sepR: 1.4, aliR: 3.2, cohR: 5.5,
      sepW: 2.0, aliW: 0.9, cohW: 0.5,
      cruise: 4.4, max: 9.0, min: 2.0, force: 26,
      glow: 1, shape: [1.0, 0.95, 1.0, 0.0],
      color(r) { const v = 0.8 + r() * 0.3; return [0.14 * v, 0.34 * v, 0.38 * v]; },
    },
    { // 3: tall amber reef fish, slow and banded
      frac: 0.10, scale: [0.8, 1.1],
      sepR: 1.9, aliR: 3.4, cohR: 5.0,
      sepW: 2.0, aliW: 0.8, cohW: 0.5,
      cruise: 2.3, max: 4.6, min: 1.2, force: 14,
      glow: 0, shape: [1.75, 0.82, 1.3, 0.5],
      color(r) { const v = 0.85 + r() * 0.3; return [0.64 * v, 0.50 * v, 0.26 * v]; },
    },
    { // 4: striped jacks, brisk mid-size schoolers
      frac: 0.14, scale: [0.9, 1.25],
      sepR: 1.8, aliR: 4.0, cohR: 6.5,
      sepW: 2.0, aliW: 1.0, cohW: 0.55,
      cruise: 4.4, max: 8.5, min: 2.0, force: 24,
      glow: 0, shape: [1.15, 1.0, 1.0, 0.6],
      color(r) { const v = 0.85 + r() * 0.25; return [0.56 * v, 0.60 * v, 0.58 * v]; },
    },
    { // 5: slender needlefish darting near the light
      frac: 0.08, scale: [0.85, 1.15],
      sepR: 1.6, aliR: 3.8, cohR: 6.0,
      sepW: 2.0, aliW: 1.1, cohW: 0.5,
      cruise: 6.4, max: 12.0, min: 3.0, force: 34,
      glow: 0, shape: [0.5, 1.65, 0.7, 0.0],
      color(r) { const v = 0.9 + r() * 0.25; return [0.55 * v, 0.66 * v, 0.66 * v]; },
    },
  ];

  const px = new Float32Array(COUNT), py = new Float32Array(COUNT), pz = new Float32Array(COUNT);
  const vx = new Float32Array(COUNT), vy = new Float32Array(COUNT), vz = new Float32Array(COUNT);
  const ax = new Float32Array(COUNT), ay = new Float32Array(COUNT), az = new Float32Array(COUNT);
  const roll = new Float32Array(COUNT);
  const spec = new Uint8Array(COUNT);
  const fscale = new Float32Array(COUNT), fphase = new Float32Array(COUNT);
  const colR = new Float32Array(COUNT), colG = new Float32Array(COUNT), colB = new Float32Array(COUNT);
  const fglow = new Float32Array(COUNT);
  const fshape = new Float32Array(COUNT * 4);

  // Deterministic PRNG so the reduced-motion still frame is stable too.
  let seed = 20260705;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  {
    let idx = 0;
    for (let s = 0; s < SPECIES.length; s++) {
      const sp = SPECIES[s];
      const n = s === SPECIES.length - 1 ? COUNT - idx : Math.round(COUNT * sp.frac);
      for (let k = 0; k < n && idx < COUNT; k++, idx++) {
        spec[idx] = s;
        fscale[idx] = sp.scale[0] + rand() * (sp.scale[1] - sp.scale[0]);
        fphase[idx] = rand() * Math.PI * 2;
        fglow[idx] = sp.glow ? 0.45 + rand() * 0.4 : 0;
        fshape[idx * 4] = sp.shape[0] * (0.9 + rand() * 0.2);
        fshape[idx * 4 + 1] = sp.shape[1] * (0.92 + rand() * 0.16);
        fshape[idx * 4 + 2] = sp.shape[2] * (0.9 + rand() * 0.2);
        fshape[idx * 4 + 3] = sp.shape[3];
        const [r, g, b] = sp.color(rand.bind(null));
        colR[idx] = r; colG[idx] = g; colB[idx] = b;
        // Start clustered around the wandering attractor, near the surface.
        px[idx] = (rand() * 2 - 1) * 22;
        py[idx] = (rand() * 2 - 1) * 7 + 5;
        pz[idx] = -26 + (rand() * 2 - 1) * 14;
        const th = rand() * Math.PI * 2;
        vx[idx] = Math.cos(th) * sp.cruise;
        vy[idx] = (rand() * 2 - 1) * 0.6;
        vz[idx] = Math.sin(th) * sp.cruise;
      }
    }
  }

  // The surface plane sits at y = 14; the school lives just beneath it.
  const BOUND = { x: 36, yTop: 12.5, yBot: -46, zNear: -8, zFar: -70 };
  const attract = [0, 0, -36];
  const mouseWorld = [0, 0, -30];
  let mouseStrength = 0;
  let mouseTargetStrength = 0;
  let diveOffset = 0;   // set from scroll; pulls the school down as we dive

  function attractorAt(t) {
    attract[0] = Math.sin(t * 0.083) * 17;
    attract[1] = Math.sin(t * 0.059) * 4 + 7 - diveOffset;
    attract[2] = -24 + Math.sin(t * 0.047) * 12;
  }

  const CUTOFF2 = 9.5 * 9.5;

  function step(dt, t) {
    attractorAt(t);
    ax.fill(0); ay.fill(0); az.fill(0);

    // Pairwise flocking forces (O(n^2) with an early distance cutoff).
    for (let i = 0; i < COUNT; i++) {
      const si = spec[i], pi = SPECIES[si];
      let sepX = 0, sepY = 0, sepZ = 0;
      let aliX = 0, aliY = 0, aliZ = 0, aliN = 0;
      let cohX = 0, cohY = 0, cohZ = 0, cohN = 0;
      let fleeX = 0, fleeY = 0, fleeZ = 0, fleeN = 0;

      for (let j = 0; j < COUNT; j++) {
        if (j === i) continue;
        const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > CUTOFF2 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const sj = spec[j];

        // Everyone keeps personal space.
        const sepR = Math.max(pi.sepR, (fscale[i] + fscale[j]) * 0.9);
        if (d < sepR) {
          const w = (1 - d / sepR) / d;
          sepX -= dx * w; sepY -= dy * w; sepZ -= dz * w;
        }
        if (sj === si) {
          if (d < pi.aliR) { aliX += vx[j]; aliY += vy[j]; aliZ += vz[j]; aliN++; }
          if (d < pi.cohR) { cohX += px[j]; cohY += py[j]; cohZ += pz[j]; cohN++; }
        } else if (sj === 1 && si !== 1 && d < 6.5) {
          // Small fish part around the big ones.
          const w = (1 - d / 6.5) / d;
          fleeX -= dx * w; fleeY -= dy * w; fleeZ -= dz * w; fleeN++;
        }
      }

      let fx = sepX * pi.sepW, fy = sepY * pi.sepW, fz = sepZ * pi.sepW;

      if (aliN > 0) {
        const inv = 1 / aliN;
        fx += (aliX * inv - vx[i]) * pi.aliW * 0.35;
        fy += (aliY * inv - vy[i]) * pi.aliW * 0.35;
        fz += (aliZ * inv - vz[i]) * pi.aliW * 0.35;
      }
      if (cohN > 0) {
        const inv = 1 / cohN;
        fx += (cohX * inv - px[i]) * pi.cohW * 0.28;
        fy += (cohY * inv - py[i]) * pi.cohW * 0.28;
        fz += (cohZ * inv - pz[i]) * pi.cohW * 0.28;
      }
      if (fleeN > 0) {
        fx += fleeX * 2.4; fy += fleeY * 2.4; fz += fleeZ * 2.4;
      }

      // Wandering attractor keeps the school touring the frame.
      {
        const dx = attract[0] - px[i], dy = attract[1] - py[i], dz = attract[2] - pz[i];
        const d = Math.hypot(dx, dy, dz) + 1e-4;
        const w = Math.min(d / 26, 1) * (si === 1 ? 0.30 : 0.55);
        fx += (dx / d) * pi.cruise * w * 0.5;
        fy += (dy / d) * pi.cruise * w * 0.5;
        fz += (dz / d) * pi.cruise * w * 0.5;
      }

      // Soft walls.
      if (px[i] > BOUND.x) fx -= (px[i] - BOUND.x) * 3;
      if (px[i] < -BOUND.x) fx -= (px[i] + BOUND.x) * 3;
      if (py[i] > BOUND.yTop) fy -= (py[i] - BOUND.yTop) * 3;
      if (py[i] < BOUND.yBot) fy -= (py[i] - BOUND.yBot) * 3;
      if (pz[i] > BOUND.zNear) fz -= (pz[i] - BOUND.zNear) * 3;
      if (pz[i] < BOUND.zFar) fz -= (pz[i] - BOUND.zFar) * 3;

      // Flee the pointer.
      if (mouseStrength > 0.01) {
        const dx = px[i] - mouseWorld[0], dy = py[i] - mouseWorld[1], dz = pz[i] - mouseWorld[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        const R = 10;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) + 1e-4;
          const w = (1 - d / R) * 30 * mouseStrength;
          fx += (dx / d) * w; fy += (dy / d) * w; fz += (dz / d) * w;
        }
      }

      // Clamp steering force.
      const fmag = Math.hypot(fx, fy, fz);
      if (fmag > pi.force) {
        const k = pi.force / fmag;
        fx *= k; fy *= k; fz *= k;
      }
      ax[i] = fx; ay[i] = fy; az[i] = fz;
    }

    // Integrate.
    for (let i = 0; i < COUNT; i++) {
      const pi = SPECIES[spec[i]];
      vx[i] += ax[i] * dt; vy[i] += ay[i] * dt; vz[i] += az[i] * dt;

      // Fish do not like steep climbs or dives.
      const speedH = Math.hypot(vx[i], vz[i]) + 1e-4;
      const maxVy = speedH * 0.55;
      if (vy[i] > maxVy) vy[i] = maxVy;
      if (vy[i] < -maxVy) vy[i] = -maxVy;

      let sp2 = Math.hypot(vx[i], vy[i], vz[i]) + 1e-6;
      // Relax toward cruise speed, hard clamp at min/max.
      let target = sp2 + (pi.cruise - sp2) * Math.min(1, dt * 0.7);
      target = Math.min(pi.max, Math.max(pi.min, target));
      const k = target / sp2;
      vx[i] *= k; vy[i] *= k; vz[i] *= k;

      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;

      // Bank into turns: lateral acceleration -> roll.
      const fwdX = vx[i] / target, fwdY = vy[i] / target, fwdZ = vz[i] / target;
      let rX = fwdZ, rZ = -fwdX;             // cross(fwd, worldUp), y = 0
      const rInv = 1 / (Math.hypot(rX, rZ) + 1e-4);
      rX *= rInv; rZ *= rInv;
      const latAcc = ax[i] * rX + az[i] * rZ;
      const targetRoll = Math.max(-0.6, Math.min(0.6, -latAcc * 0.045));
      roll[i] += (targetRoll - roll[i]) * Math.min(1, dt * 3.5);
    }
  }

  /* ---------------- GPU buffers ---------------- */

  const geo = buildFishGeometry();

  const fishVao = gl.createVertexArray();
  gl.bindVertexArray(fishVao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const nrmBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
  gl.bufferData(gl.ARRAY_BUFFER, geo.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);

  const FLOATS_PER_INST = 20;
  const instData = new Float32Array(COUNT * FLOATS_PER_INST);
  const instBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);
  const STRIDE = FLOATS_PER_INST * 4;
  const instLayout = [
    [2, 3, 0],    // i_pos
    [3, 3, 12],   // i_fwd
    [4, 3, 24],   // i_up
    [5, 4, 36],   // i_misc
    [6, 3, 52],   // i_color
    [7, 4, 64],   // i_shape
  ];
  for (const [loc, size, off] of instLayout) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE, off);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  const bgVao = gl.createVertexArray();

  const SNOW_COUNT = isMobile ? 110 : 190;
  const snowVao = gl.createVertexArray();
  gl.bindVertexArray(snowVao);
  const seeds = new Float32Array(SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) seeds[i] = i * 7.13 + 0.71;
  const seedBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  /* ---------------- Uniform locations ---------------- */

  const U = {
    bg: {
      resolution: gl.getUniformLocation(bgProg, "u_resolution"),
      time: gl.getUniformLocation(bgProg, "u_time"),
      scroll: gl.getUniformLocation(bgProg, "u_scroll"),
      camPos: gl.getUniformLocation(bgProg, "u_camPos"),
      camRight: gl.getUniformLocation(bgProg, "u_camRight"),
      camUp: gl.getUniformLocation(bgProg, "u_camUp"),
      camFwd: gl.getUniformLocation(bgProg, "u_camFwd"),
      tanFov: gl.getUniformLocation(bgProg, "u_tanFov"),
      waterShallow: gl.getUniformLocation(bgProg, "u_waterShallow"),
      waterDeep: gl.getUniformLocation(bgProg, "u_waterDeep"),
      skyHorizon: gl.getUniformLocation(bgProg, "u_skyHorizon"),
      skyZenith: gl.getUniformLocation(bgProg, "u_skyZenith"),
      sunCol: gl.getUniformLocation(bgProg, "u_sunCol"),
      sunDir: gl.getUniformLocation(bgProg, "u_sunDir"),
      sunScreen: gl.getUniformLocation(bgProg, "u_sunScreen"),
      sunVis: gl.getUniformLocation(bgProg, "u_sunVis"),
      cloudCol: gl.getUniformLocation(bgProg, "u_cloudCol"),
      cloudAmt: gl.getUniformLocation(bgProg, "u_cloudAmt"),
      starAmt: gl.getUniformLocation(bgProg, "u_starAmt"),
      lightAmp: gl.getUniformLocation(bgProg, "u_lightAmp"),
    },
    fish: {
      proj: gl.getUniformLocation(fishProg, "u_proj"),
      view: gl.getUniformLocation(fishProg, "u_view"),
      time: gl.getUniformLocation(fishProg, "u_time"),
      resolution: gl.getUniformLocation(fishProg, "u_resolution"),
      fogDensity: gl.getUniformLocation(fishProg, "u_fogDensity"),
      caust: gl.getUniformLocation(fishProg, "u_caust"),
      fogTop: gl.getUniformLocation(fishProg, "u_fogTop"),
      fogBottom: gl.getUniformLocation(fishProg, "u_fogBottom"),
      lightCol: gl.getUniformLocation(fishProg, "u_lightCol"),
      lightDir: gl.getUniformLocation(fishProg, "u_lightDir"),
      ambient: gl.getUniformLocation(fishProg, "u_ambient"),
      glowBoost: gl.getUniformLocation(fishProg, "u_glowBoost"),
      causticCol: gl.getUniformLocation(fishProg, "u_causticCol"),
    },
    snow: {
      proj: gl.getUniformLocation(snowProg, "u_proj"),
      view: gl.getUniformLocation(snowProg, "u_view"),
      time: gl.getUniformLocation(snowProg, "u_time"),
      pointScale: gl.getUniformLocation(snowProg, "u_pointScale"),
      tint: gl.getUniformLocation(snowProg, "u_tint"),
    },
  };

  /* ---------------- Camera math ---------------- */

  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const FOV = (62 * Math.PI) / 180;

  function perspective(out, fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
  }

  function lookAt(out, ex, ey, ez, tx, ty, tz) {
    let zx = ex - tx, zy = ey - ty, zz = ez - tz;
    let l = 1 / Math.hypot(zx, zy, zz); zx *= l; zy *= l; zz *= l;
    let xx = zz, xy = 0, xz = -zx;                       // cross(up=(0,1,0), z)
    l = 1 / (Math.hypot(xx, xz) + 1e-6); xx *= l; xz *= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
  }

  /* ---------------- Events ---------------- */

  let dpr = 1;
  let quality = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2) * quality;
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    perspective(proj, FOV, w / h, 0.1, 220);
  }
  window.addEventListener("resize", resize);

  let ndcX = 0, ndcY = 0;          // pointer in NDC
  let parX = 0, parY = 0;          // smoothed parallax

  function pointerMove(e) {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    ndcX = (cx / window.innerWidth) * 2 - 1;
    ndcY = -((cy / window.innerHeight) * 2 - 1);
    mouseTargetStrength = 1;
  }
  window.addEventListener("mousemove", pointerMove, { passive: true });
  window.addEventListener("touchmove", pointerMove, { passive: true });
  window.addEventListener("mouseout", (e) => { if (!e.relatedTarget) mouseTargetStrength = 0; });
  window.addEventListener("blur", () => { mouseTargetStrength = 0; });
  window.addEventListener("touchend", () => { mouseTargetStrength = 0; });

  let scrollFrac = 0;
  function onScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollFrac = Math.min(1, window.scrollY / Math.min(max, window.innerHeight * 3.2));
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------- Day → dusk → night palette cycle ---------------- */

  const CYCLE_SECONDS = 90;
  const urlParams = new URLSearchParams(window.location.search);
  const forcedCycle = urlParams.has("cycle") ? parseFloat(urlParams.get("cycle")) : null;

  const PALETTES = {
    day: {
      waterShallow: [0.13, 0.53, 0.63], waterDeep: [0.008, 0.19, 0.32],
      light: [1.0, 0.97, 0.88], caustic: [0.40, 0.80, 0.85], snow: [0.75, 0.92, 1.0],
      lightDir: [0.40, 0.78, -0.42],
      skyHorizon: [0.78, 0.92, 1.0], skyZenith: [0.18, 0.48, 0.93], cloudCol: [1.0, 1.0, 1.0],
      lightAmp: 1.0, ambient: 1.0, glowBoost: 0.4,
      cloudAmt: 0.70, starAmt: 0.0, clarity: 0.012,
    },
    dusk: {
      waterShallow: [0.22, 0.34, 0.42], waterDeep: [0.012, 0.10, 0.19],
      light: [1.0, 0.55, 0.22], caustic: [0.58, 0.36, 0.20], snow: [0.95, 0.68, 0.50],
      lightDir: [0.72, 0.30, -0.38],
      skyHorizon: [1.0, 0.48, 0.20], skyZenith: [0.36, 0.26, 0.52], cloudCol: [1.0, 0.62, 0.45],
      lightAmp: 1.05, ambient: 0.72, glowBoost: 1.0,
      cloudAmt: 0.60, starAmt: 0.12, clarity: 0.015,
    },
    night: {
      waterShallow: [0.035, 0.13, 0.23], waterDeep: [0.003, 0.025, 0.06],
      light: [0.80, 0.88, 1.0], caustic: [0.12, 0.24, 0.32], snow: [0.50, 0.70, 0.95],
      lightDir: [-0.18, 0.72, -0.45],
      skyHorizon: [0.06, 0.11, 0.24], skyZenith: [0.012, 0.035, 0.10], cloudCol: [0.22, 0.28, 0.42],
      lightAmp: 0.5, ambient: 0.42, glowBoost: 2.2,
      cloudAmt: 0.30, starAmt: 1.0, clarity: 0.018,
    },
    dawn: {
      waterShallow: [0.16, 0.38, 0.48], waterDeep: [0.010, 0.13, 0.24],
      light: [1.0, 0.75, 0.58], caustic: [0.45, 0.42, 0.36], snow: [0.90, 0.75, 0.65],
      lightDir: [-0.62, 0.35, -0.40],
      skyHorizon: [0.98, 0.66, 0.55], skyZenith: [0.45, 0.47, 0.75], cloudCol: [1.0, 0.82, 0.75],
      lightAmp: 0.92, ambient: 0.75, glowBoost: 0.85,
      cloudAmt: 0.55, starAmt: 0.20, clarity: 0.013,
    },
  };

  const TIMELINE = [
    [0.00, "day"], [0.34, "day"], [0.46, "dusk"], [0.56, "night"],
    [0.82, "night"], [0.92, "dawn"], [1.00, "day"],
  ];

  const VEC_KEYS = ["waterShallow", "waterDeep", "light", "caustic", "snow", "lightDir",
                    "skyHorizon", "skyZenith", "cloudCol"];
  const NUM_KEYS = ["lightAmp", "ambient", "glowBoost", "cloudAmt", "starAmt", "clarity"];

  const pal = {};
  for (const k of VEC_KEYS) pal[k] = [0, 0, 0];

  function evalPalette(cycle) {
    let a = PALETTES.day, b = PALETTES.day, u = 0;
    for (let k = 0; k < TIMELINE.length - 1; k++) {
      if (cycle >= TIMELINE[k][0] && cycle <= TIMELINE[k + 1][0]) {
        a = PALETTES[TIMELINE[k][1]];
        b = PALETTES[TIMELINE[k + 1][1]];
        const span = TIMELINE[k + 1][0] - TIMELINE[k][0];
        u = span > 0 ? (cycle - TIMELINE[k][0]) / span : 0;
        break;
      }
    }
    u = u * u * (3 - 2 * u);
    for (const k of VEC_KEYS) {
      const A = a[k], B = b[k], P = pal[k];
      P[0] = A[0] + (B[0] - A[0]) * u;
      P[1] = A[1] + (B[1] - A[1]) * u;
      P[2] = A[2] + (B[2] - A[2]) * u;
    }
    for (const k of NUM_KEYS) pal[k] = a[k] + (b[k] - a[k]) * u;
  }

  /* ---------------- Frame loop ---------------- */

  const bgTopNow = [0, 0, 0], bgMidNow = [0, 0, 0], fogTopNow = [0, 0, 0];

  let simTime = 0;
  let lastNow = null;
  let rafId = null;
  let slowFrames = 0;

  function writeInstances() {
    for (let i = 0; i < COUNT; i++) {
      const o = i * FLOATS_PER_INST;
      const sp2 = Math.hypot(vx[i], vy[i], vz[i]) + 1e-6;
      let fx = vx[i] / sp2, fy = vy[i] / sp2, fz = vz[i] / sp2;

      // right = normalize(cross(fwd, worldUp)); up = cross(right, fwd)
      let rX = -fz, rY = 0, rZ = fx;
      let l = Math.hypot(rX, rZ);
      if (l < 1e-4) { rX = 1; rZ = 0; l = 1; }
      rX /= l; rZ /= l;
      let uX = rY * fz - rZ * fy, uY = rZ * fx - rX * fz, uZ = rX * fy - rY * fx;
      // Bank: rotate up around fwd by roll.
      const cr = Math.cos(roll[i]), sr = Math.sin(roll[i]);
      const bX = uX * cr + rX * sr, bY = uY * cr + rY * sr, bZ = uZ * cr + rZ * sr;

      instData[o] = px[i]; instData[o + 1] = py[i]; instData[o + 2] = pz[i];
      instData[o + 3] = fx; instData[o + 4] = fy; instData[o + 5] = fz;
      instData[o + 6] = bX; instData[o + 7] = bY; instData[o + 8] = bZ;
      instData[o + 9] = fscale[i];
      instData[o + 10] = fphase[i];
      instData[o + 11] = 4.0 + sp2 * 0.85;       // tail beat follows speed
      instData[o + 12] = fglow[i];               // i_misc.w
      instData[o + 13] = colR[i]; instData[o + 14] = colG[i]; instData[o + 15] = colB[i];
      instData[o + 16] = fshape[i * 4];
      instData[o + 17] = fshape[i * 4 + 1];
      instData[o + 18] = fshape[i * 4 + 2];
      instData[o + 19] = fshape[i * 4 + 3];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData);
  }

  const camRight = [1, 0, 0], camUp = [0, 1, 0], camFwd = [0, 0, -1];

  function draw() {
    const aspectSafe = canvas.width / Math.max(1, canvas.height);

    // Time of day drives every colour below.
    const cycle = forcedCycle !== null && Number.isFinite(forcedCycle)
      ? Math.min(Math.max(forcedCycle, 0), 0.999)
      : (simTime % CYCLE_SECONDS) / CYCLE_SECONDS;
    evalPalette(cycle);

    // Camera: floating below the surface, gazing up at the sky.
    // Scrolling sinks us deeper and levels the gaze.
    parX += (ndcX - parX) * 0.03;
    parY += (ndcY - parY) * 0.03;
    const swayX = Math.sin(simTime * 0.10) * 0.7;
    const swayY = Math.sin(simTime * 0.073) * 0.45;
    const eyeX = swayX + parX * 1.3;
    const eyeY = swayY + parY * 0.9 - scrollFrac * 26;
    const eyeZ = 0;
    const lookY = eyeY + 30 - scrollFrac * 22;
    lookAt(view, eyeX, eyeY, eyeZ, eyeX * 0.35 + parX * 2.0, lookY + parY * 2.0, -40);

    // Camera basis (rows of the view rotation).
    camRight[0] = view[0]; camRight[1] = view[4]; camRight[2] = view[8];
    camUp[0] = view[1]; camUp[1] = view[5]; camUp[2] = view[9];
    camFwd[0] = -view[2]; camFwd[1] = -view[6]; camFwd[2] = -view[10];

    const tanF = Math.tan(FOV / 2);

    // Project the pointer along its view ray for the flee force.
    {
      const rx = camFwd[0] + camRight[0] * ndcX * tanF * aspectSafe + camUp[0] * ndcY * tanF;
      const ry = camFwd[1] + camRight[1] * ndcX * tanF * aspectSafe + camUp[1] * ndcY * tanF;
      const rz = camFwd[2] + camRight[2] * ndcX * tanF * aspectSafe + camUp[2] * ndcY * tanF;
      const rl = 30 / Math.hypot(rx, ry, rz);
      mouseWorld[0] = eyeX + rx * rl;
      mouseWorld[1] = eyeY + ry * rl;
      mouseWorld[2] = eyeZ + rz * rl;
    }

    // Sun position on screen (NDC) for the light shafts.
    const sd = pal.lightDir;
    const sl = 1 / Math.hypot(sd[0], sd[1], sd[2]);
    const sx = sd[0] * sl, sy = sd[1] * sl, sz = sd[2] * sl;
    const vx = camRight[0] * sx + camRight[1] * sy + camRight[2] * sz;
    const vy = camUp[0] * sx + camUp[1] * sy + camUp[2] * sz;
    const vz = camFwd[0] * sx + camFwd[1] * sy + camFwd[2] * sz;
    let sunNdcX = 0, sunNdcY = 2.5, sunVis = 0;
    if (vz > 0.03) {
      sunNdcX = vx / (vz * tanF * aspectSafe);
      sunNdcY = vy / (vz * tanF);
      sunVis = Math.min(1, vz * 4);
    }

    // Diving sinks every colour toward the deep.
    const ABYSS = [0.001, 0.010, 0.022];
    for (let c = 0; c < 3; c++) {
      bgTopNow[c] = pal.waterShallow[c] + (pal.waterDeep[c] - pal.waterShallow[c]) * (scrollFrac * 0.55);
      bgMidNow[c] = pal.waterDeep[c] + (ABYSS[c] - pal.waterDeep[c]) * (scrollFrac * 0.7);
      const ft = pal.waterShallow[c] * 0.55 + pal.waterDeep[c] * 0.45;
      fogTopNow[c] = ft + (bgMidNow[c] - ft) * (scrollFrac * 0.55);
    }

    gl.clearColor(bgMidNow[0], bgMidNow[1], bgMidNow[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Water, surface and sky overhead.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.bindVertexArray(bgVao);
    gl.uniform2f(U.bg.resolution, canvas.width, canvas.height);
    gl.uniform1f(U.bg.time, simTime);
    gl.uniform1f(U.bg.scroll, scrollFrac);
    gl.uniform3f(U.bg.camPos, eyeX, eyeY, eyeZ);
    gl.uniform3f(U.bg.camRight, camRight[0], camRight[1], camRight[2]);
    gl.uniform3f(U.bg.camUp, camUp[0], camUp[1], camUp[2]);
    gl.uniform3f(U.bg.camFwd, camFwd[0], camFwd[1], camFwd[2]);
    gl.uniform1f(U.bg.tanFov, tanF);
    gl.uniform3f(U.bg.waterShallow, bgTopNow[0], bgTopNow[1], bgTopNow[2]);
    gl.uniform3f(U.bg.waterDeep, bgMidNow[0], bgMidNow[1], bgMidNow[2]);
    gl.uniform3f(U.bg.skyHorizon, pal.skyHorizon[0], pal.skyHorizon[1], pal.skyHorizon[2]);
    gl.uniform3f(U.bg.skyZenith, pal.skyZenith[0], pal.skyZenith[1], pal.skyZenith[2]);
    gl.uniform3f(U.bg.sunCol, pal.light[0], pal.light[1], pal.light[2]);
    gl.uniform3f(U.bg.sunDir, sx, sy, sz);
    gl.uniform2f(U.bg.sunScreen, sunNdcX, sunNdcY);
    gl.uniform1f(U.bg.sunVis, sunVis);
    gl.uniform3f(U.bg.cloudCol, pal.cloudCol[0], pal.cloudCol[1], pal.cloudCol[2]);
    gl.uniform1f(U.bg.cloudAmt, pal.cloudAmt);
    gl.uniform1f(U.bg.starAmt, pal.starAmt);
    gl.uniform1f(U.bg.lightAmp, pal.lightAmp);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Fish school.
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.useProgram(fishProg);
    gl.bindVertexArray(fishVao);
    gl.uniformMatrix4fv(U.fish.proj, false, proj);
    gl.uniformMatrix4fv(U.fish.view, false, view);
    gl.uniform1f(U.fish.time, simTime);
    gl.uniform2f(U.fish.resolution, canvas.width, canvas.height);
    gl.uniform1f(U.fish.fogDensity, pal.clarity * (1 + scrollFrac * 0.9));
    gl.uniform1f(U.fish.caust, 1 - scrollFrac * 0.65);
    gl.uniform3f(U.fish.fogTop, fogTopNow[0], fogTopNow[1], fogTopNow[2]);
    gl.uniform3f(U.fish.fogBottom, bgMidNow[0], bgMidNow[1], bgMidNow[2]);
    gl.uniform3f(U.fish.lightCol, pal.light[0], pal.light[1], pal.light[2]);
    gl.uniform3f(U.fish.lightDir, sx, sy, sz);
    gl.uniform1f(U.fish.ambient, pal.ambient);
    gl.uniform1f(U.fish.glowBoost, pal.glowBoost);
    gl.uniform3f(U.fish.causticCol, pal.caustic[0], pal.caustic[1], pal.caustic[2]);
    gl.drawElementsInstanced(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_SHORT, 0, COUNT);

    // 3. Marine snow (additive, behind fish thanks to the depth test).
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(snowProg);
    gl.bindVertexArray(snowVao);
    gl.uniformMatrix4fv(U.snow.proj, false, proj);
    gl.uniformMatrix4fv(U.snow.view, false, view);
    gl.uniform1f(U.snow.time, simTime);
    gl.uniform1f(U.snow.pointScale, 0.5 * canvas.height * (1 / Math.tan(FOV / 2)));
    gl.uniform3f(U.snow.tint, pal.snow[0], pal.snow[1], pal.snow[2]);
    gl.drawArrays(gl.POINTS, 0, SNOW_COUNT);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (lastNow === null) lastNow = now;
    let dt = (now - lastNow) / 1000;
    lastNow = now;

    // Adaptive quality: if frames stay slow, render at a lower resolution.
    if (dt > 0.045 && quality > 0.6) {
      if (++slowFrames > 40) { quality = 0.7; slowFrames = 0; resize(); }
    } else if (slowFrames > 0) {
      slowFrames--;
    }

    dt = Math.min(dt, 0.05);
    simTime += dt;
    mouseStrength += (mouseTargetStrength - mouseStrength) * Math.min(1, dt * 4);
    diveOffset = scrollFrac * 24;

    step(dt, simTime);
    writeInstances();
    draw();
  }

  /* ---------------- Boot ---------------- */

  resize();
  onScroll();

  // Warm up so the school is already formed on first paint.
  for (let i = 0; i < 110; i++) step(1 / 30, simTime += 1 / 30);

  if (reducedMotion) {
    // A single, calm still frame.
    writeInstances();
    draw();
    window.addEventListener("resize", () => { resize(); draw(); });
    return;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      lastNow = null;
    } else if (rafId === null) {
      rafId = requestAnimationFrame(frame);
    }
  });

  rafId = requestAnimationFrame(frame);
})();
