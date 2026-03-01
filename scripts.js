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

  // ---------- Water Ripple Effect (Canvas) ----------
  const canvas = document.getElementById("rippleCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width, height;
  const ripples = [];
  let mouseX = -1000;
  let mouseY = -1000;
  let lastRippleTime = 0;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  // Track mouse position
  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    const now = Date.now();
    if (now - lastRippleTime > 60) {
      ripples.push({
        x: mouseX,
        y: mouseY,
        radius: 0,
        maxRadius: 80 + Math.random() * 60,
        opacity: 0.12 + Math.random() * 0.06,
        speed: 1.2 + Math.random() * 0.8,
        lineWidth: 1 + Math.random() * 0.5,
      });
      lastRippleTime = now;
    }

    // Limit ripple count
    if (ripples.length > 25) {
      ripples.splice(0, ripples.length - 25);
    }
  });

  // Click creates a bigger ripple
  document.addEventListener("click", (e) => {
    for (let i = 0; i < 3; i++) {
      ripples.push({
        x: e.clientX,
        y: e.clientY,
        radius: i * 8,
        maxRadius: 120 + Math.random() * 80 + i * 30,
        opacity: 0.18 - i * 0.03,
        speed: 1.5 + Math.random() * 0.5,
        lineWidth: 1.5 - i * 0.3,
      });
    }
  });

  function drawRipple(r) {
    const progress = r.radius / r.maxRadius;
    const alpha = r.opacity * (1 - progress * progress);
    if (alpha <= 0) return;

    // Main ripple ring
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 210, 240, ${alpha})`;
    ctx.lineWidth = r.lineWidth * (1 - progress * 0.5);
    ctx.stroke();

    // Inner caustic-like highlight
    if (progress < 0.5) {
      const innerAlpha = alpha * 0.4 * (1 - progress * 2);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 230, 255, ${innerAlpha})`;
      ctx.lineWidth = r.lineWidth * 0.5;
      ctx.stroke();
    }

    // Subtle reflection shimmer
    if (progress < 0.3) {
      const shimmerAlpha = alpha * 0.15 * (1 - progress / 0.3);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 240, 255, ${shimmerAlpha})`;
      ctx.fill();
    }
  }

  // Ambient cursor glow
  function drawCursorGlow() {
    const gradient = ctx.createRadialGradient(
      mouseX, mouseY, 0,
      mouseX, mouseY, 100
    );
    gradient.addColorStop(0, "rgba(160, 200, 240, 0.04)");
    gradient.addColorStop(0.5, "rgba(140, 180, 220, 0.015)");
    gradient.addColorStop(1, "rgba(140, 180, 220, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(mouseX - 100, mouseY - 100, 200, 200);
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    drawCursorGlow();

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.radius += r.speed;
      drawRipple(r);

      if (r.radius >= r.maxRadius) {
        ripples.splice(i, 1);
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
});
