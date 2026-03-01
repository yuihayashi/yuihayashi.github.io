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

  // ---------- Particle Animation (ochyai.dev style) ----------
  const canvas = document.getElementById("rippleCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width, height;
  let mouseX = -1000;
  let mouseY = -1000;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Particle system
  const PARTICLE_COUNT = 120;
  const CONNECTION_DISTANCE = 130;
  const MOUSE_RADIUS = 180;
  const particles = [];

  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * 1.8 + 0.5;
      this.baseOpacity = Math.random() * 0.12 + 0.04;
      this.opacity = this.baseOpacity;
      // Slow organic drift
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      // Sine-based wobble parameters
      this.wobbleX = Math.random() * Math.PI * 2;
      this.wobbleY = Math.random() * Math.PI * 2;
      this.wobbleSpeedX = Math.random() * 0.008 + 0.003;
      this.wobbleSpeedY = Math.random() * 0.008 + 0.003;
      this.wobbleAmplitude = Math.random() * 0.4 + 0.15;
    }

    update() {
      this.wobbleX += this.wobbleSpeedX;
      this.wobbleY += this.wobbleSpeedY;

      this.x += this.vx + Math.sin(this.wobbleX) * this.wobbleAmplitude;
      this.y += this.vy + Math.cos(this.wobbleY) * this.wobbleAmplitude;

      // Mouse interaction: gentle repulsion
      const dx = this.x - mouseX;
      const dy = this.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MOUSE_RADIUS && dist > 0) {
        const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
        const angle = Math.atan2(dy, dx);
        this.x += Math.cos(angle) * force * 1.5;
        this.y += Math.sin(angle) * force * 1.5;
        this.opacity = this.baseOpacity + force * 0.15;
      } else {
        this.opacity += (this.baseOpacity - this.opacity) * 0.05;
      }

      // Wrap around edges with padding
      if (this.x < -50) this.x = width + 50;
      if (this.x > width + 50) this.x = -50;
      if (this.y < -50) this.y = height + 50;
      if (this.y > height + 50) this.y = -50;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245, 245, 245, ${this.opacity})`;
      ctx.fill();
    }
  }

  // Initialize particles
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECTION_DISTANCE) {
          const opacity =
            (1 - dist / CONNECTION_DISTANCE) *
            Math.min(particles[i].opacity, particles[j].opacity) *
            0.6;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(245, 245, 245, ${opacity})`;
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      }
    }
  }

  // Ambient cursor glow
  function drawCursorGlow() {
    if (mouseX < 0 || mouseY < 0) return;
    const gradient = ctx.createRadialGradient(
      mouseX, mouseY, 0,
      mouseX, mouseY, 140
    );
    gradient.addColorStop(0, "rgba(245, 245, 245, 0.025)");
    gradient.addColorStop(0.5, "rgba(245, 245, 245, 0.008)");
    gradient.addColorStop(1, "rgba(245, 245, 245, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(mouseX - 140, mouseY - 140, 280, 280);
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    drawCursorGlow();

    for (const p of particles) {
      p.update();
      p.draw();
    }

    drawConnections();

    requestAnimationFrame(animate);
  }

  animate();
});
