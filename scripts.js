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

  // ---------- Rain on Glass Effect (Canvas 2D) ----------
  const canvas = document.getElementById("rippleCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let W, H;
  let mouseX = -9999, mouseY = -9999;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // --- Droplet class ---
  class Droplet {
    constructor(isStatic) {
      this.reset(isStatic);
    }

    reset(isStatic) {
      this.x = Math.random() * W;
      this.y = isStatic ? Math.random() * H : -Math.random() * H * 0.5;
      this.radius = isStatic
        ? Math.random() * 12 + 4
        : Math.random() * 6 + 2;
      this.isStatic = isStatic;
      this.vy = isStatic ? 0 : Math.random() * 0.15 + 0.03;
      this.vx = 0;
      this.opacity = Math.random() * 0.3 + 0.15;
      this.life = 1;
      this.maxLife = isStatic
        ? Math.random() * 800 + 600
        : Math.random() * 1200 + 400;
      this.age = 0;
      this.wobblePhase = Math.random() * Math.PI * 2;
      this.wobbleSpeed = Math.random() * 0.01 + 0.005;
      this.wobbleAmp = Math.random() * 0.15 + 0.05;
      this.trail = [];
      this.trailTimer = 0;
    }

    update(drops) {
      this.age++;
      this.wobblePhase += this.wobbleSpeed;

      const fadeIn = Math.min(this.age / 60, 1);
      const fadeOut = Math.max(1 - (this.age - this.maxLife + 120) / 120, 0);
      this.life = fadeIn * (this.age > this.maxLife - 120 ? fadeOut : 1);

      if (this.age > this.maxLife) {
        this.reset(this.isStatic);
        return;
      }

      if (!this.isStatic) {
        this.vy += 0.002 + this.radius * 0.0003;
        this.vy = Math.min(this.vy, 1.5 + this.radius * 0.1);
        this.vx += (Math.random() - 0.5) * 0.01;
        this.vx *= 0.98;
        this.x += this.vx + Math.sin(this.wobblePhase) * 0.2;
        this.y += this.vy;

        this.trailTimer++;
        if (this.trailTimer > 3 && this.radius > 3) {
          this.trail.push({
            x: this.x,
            y: this.y - this.radius * 0.5,
            r: this.radius * (0.2 + Math.random() * 0.15),
            opacity: this.opacity * 0.4 * this.life,
            age: 0,
          });
          this.trailTimer = 0;
        }

        if (this.y > H + 20) this.reset(false);

        for (const other of drops) {
          if (other === this) continue;
          const dx = this.x - other.x;
          const dy = this.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < this.radius + other.radius) {
            if (other.radius < this.radius) {
              this.radius = Math.min(this.radius + other.radius * 0.3, 22);
              this.vy += 0.05;
              other.reset(other.isStatic);
            }
          }
        }
      } else {
        this.x += Math.sin(this.wobblePhase) * 0.03;
      }

      const dx = this.x - mouseX;
      const dy = this.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        const force = (150 - dist) / 150;
        this.opacity = Math.min(this.opacity + force * 0.1, 0.6);
        if (this.isStatic && force > 0.3) {
          this.isStatic = false;
          this.vy = 0.3;
        }
      }
    }

    draw() {
      if (this.life <= 0) return;
      const r = this.radius;
      const x = this.x;
      const y = this.y;
      const alpha = this.opacity * this.life;

      // Trail
      for (let i = this.trail.length - 1; i >= 0; i--) {
        const t = this.trail[i];
        t.age++;
        t.opacity *= 0.985;
        if (t.opacity < 0.005 || t.age > 300) { this.trail.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 220, 240, ${t.opacity})`;
        ctx.fill();
      }

      ctx.save();
      const stretch = this.isStatic ? 1 : Math.min(1 + this.vy * 0.08, 1.4);
      const wobble = 1 + Math.sin(this.wobblePhase * 3) * this.wobbleAmp;
      ctx.translate(x, y);
      ctx.scale(wobble, stretch);

      // Body gradient — glass refraction
      const bodyGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
      bodyGrad.addColorStop(0, `rgba(240, 250, 255, ${alpha * 0.7})`);
      bodyGrad.addColorStop(0.3, `rgba(200, 225, 245, ${alpha * 0.4})`);
      bodyGrad.addColorStop(0.7, `rgba(160, 195, 230, ${alpha * 0.2})`);
      bodyGrad.addColorStop(1, `rgba(140, 180, 220, ${alpha * 0.05})`);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Edge rim
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 210, 240, ${alpha * 0.25})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Primary specular highlight (top-left)
      const hlR = r * 0.45;
      const hlGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, -r * 0.3, -r * 0.3, hlR);
      hlGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.9})`);
      hlGrad.addColorStop(0.4, `rgba(255, 255, 255, ${alpha * 0.3})`);
      hlGrad.addColorStop(1, `rgba(255, 255, 255, 0)`);
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.3, hlR, 0, Math.PI * 2);
      ctx.fillStyle = hlGrad;
      ctx.fill();

      // Secondary highlight (bottom-right)
      const hl2R = r * 0.2;
      const hl2Grad = ctx.createRadialGradient(r * 0.25, r * 0.3, 0, r * 0.25, r * 0.3, hl2R);
      hl2Grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.5})`);
      hl2Grad.addColorStop(1, `rgba(255, 255, 255, 0)`);
      ctx.beginPath();
      ctx.arc(r * 0.25, r * 0.3, hl2R, 0, Math.PI * 2);
      ctx.fillStyle = hl2Grad;
      ctx.fill();

      // Caustic shimmer
      const caustR = r * 0.35;
      const caustGrad = ctx.createRadialGradient(0, r * 0.15, 0, 0, r * 0.15, caustR);
      const shimmer = Math.sin(this.wobblePhase * 2) * 0.15 + 0.15;
      caustGrad.addColorStop(0, `rgba(220, 240, 255, ${alpha * shimmer})`);
      caustGrad.addColorStop(1, `rgba(220, 240, 255, 0)`);
      ctx.beginPath();
      ctx.arc(0, r * 0.15, caustR, 0, Math.PI * 2);
      ctx.fillStyle = caustGrad;
      ctx.fill();

      // Shadow / refraction lens
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.06})`;
      ctx.fill();

      ctx.restore();
    }
  }

  // Condensation fog patches
  const fogPatches = [];
  for (let i = 0; i < 25; i++) {
    fogPatches.push({
      x: Math.random() * W, y: Math.random() * H,
      rx: Math.random() * 120 + 40, ry: Math.random() * 80 + 30,
      opacity: Math.random() * 0.04 + 0.01,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function drawFog() {
    for (const f of fogPatches) {
      f.phase += 0.002;
      const osc = Math.sin(f.phase) * 0.01;
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.rx);
      grad.addColorStop(0, `rgba(200, 220, 240, ${f.opacity + osc})`);
      grad.addColorStop(0.6, `rgba(180, 210, 235, ${(f.opacity + osc) * 0.3})`);
      grad.addColorStop(1, `rgba(180, 210, 235, 0)`);
      ctx.save();
      ctx.scale(1, f.ry / f.rx);
      ctx.beginPath();
      ctx.arc(f.x, f.y * (f.rx / f.ry), f.rx, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }
  }

  // Create droplets
  const drops = [];
  for (let i = 0; i < 60; i++) drops.push(new Droplet(true));
  for (let i = 0; i < 20; i++) drops.push(new Droplet(false));

  let spawnTimer = 0;

  function animate() {
    ctx.clearRect(0, 0, W, H);
    drawFog();

    spawnTimer++;
    if (spawnTimer > 120 + Math.random() * 180) {
      spawnTimer = 0;
      if (drops.filter((d) => !d.isStatic).length < 30) {
        drops.push(new Droplet(false));
      }
    }

    for (const d of drops) d.update(drops);
    drops.sort((a, b) => a.radius - b.radius);
    for (const d of drops) d.draw();

    if (mouseX > 0 && mouseY > 0) {
      const grad = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 100);
      grad.addColorStop(0, "rgba(200, 225, 245, 0.03)");
      grad.addColorStop(0.5, "rgba(190, 215, 240, 0.01)");
      grad.addColorStop(1, "rgba(190, 215, 240, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(mouseX - 100, mouseY - 100, 200, 200);
    }

    requestAnimationFrame(animate);
  }

  animate();
});
