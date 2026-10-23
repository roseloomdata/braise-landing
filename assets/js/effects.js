// Mouse-driven effects. Desktop with a fine pointer only; everything is paused
// when off-screen or when the tab is hidden, so it costs nothing elsewhere.
(() => {
  const fine = window.matchMedia("(pointer: fine) and (min-width: 960px)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduceMotion) return;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const lerp = (a, b, t) => a + (b - a) * t;

  const mouse = { x: innerWidth / 2, y: innerHeight / 2, moved: false };
  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.moved = true;
  }, { passive: true });

  // =========================================================
  // 1. Liquid gradient hero (WebGL)
  // =========================================================
  const hero = $(".hero");
  const canvas = $("#heroGL");
  const gl = canvas && canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });

  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  // Domain-warped fbm noise tinted with the brand palette. Around the cursor the
  // domain is pushed along the mouse velocity and swirled, which reads as liquid.
  const FRAG = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform vec2 uVel;
    uniform float uHover;
    uniform vec3 uC1;
    uniform vec3 uC2;
    uniform vec3 uC3;
    uniform vec3 uBg;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + 3.7; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uRes;
      float aspect = uRes.x / uRes.y;
      vec2 p = vec2(uv.x * aspect, uv.y);
      vec2 m = vec2(uMouse.x * aspect, uMouse.y);

      vec2 d = p - m;
      float infl = exp(-dot(d, d) * 7.0) * uHover;
      p -= uVel * infl * 0.9;
      float ang = infl * 1.4;
      p = m + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (p - m);

      float t = uTime * 0.045;
      vec2 q = vec2(fbm(p * 1.3 + vec2(t, -t)), fbm(p * 1.3 + vec2(-t, t) + 5.2));
      vec2 r = vec2(fbm(p * 1.1 + q * 1.8 + t * 0.6), fbm(p * 1.1 + q * 1.8 - t * 0.4 + 1.7));
      float n = fbm(p + r * 1.4);

      vec3 col = uBg;
      col = mix(col, uC1, smoothstep(0.45, 0.88, n) * 0.36);
      col = mix(col, uC2, smoothstep(0.52, 0.94, r.x) * 0.30);
      col = mix(col, uC3, smoothstep(0.50, 0.96, q.y) * 0.38);
      col = mix(col, uC1, infl * 0.12);

      // fade into the page background near the bottom of the hero
      col = mix(col, vec3(1.0), smoothstep(0.55, 0.05, uv.y));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function initGL() {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    ["uRes", "uTime", "uMouse", "uVel", "uHover", "uC1", "uC2", "uC3", "uBg"].forEach((n) => (u[n] = gl.getUniformLocation(prog, n)));

    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const css = getComputedStyle(document.documentElement);
    gl.uniform3fv(u.uC1, hex(css.getPropertyValue("--c1").trim()));
    gl.uniform3fv(u.uC2, hex(css.getPropertyValue("--c2").trim()));
    gl.uniform3fv(u.uC3, hex(css.getPropertyValue("--c3").trim()));
    gl.uniform3fv(u.uBg, hex("#fbf7f2"));
    return u;
  }

  let uniforms = null;
  if (gl) {
    try {
      uniforms = initGL();
      hero.classList.add("has-gl");
    } catch (err) {
      console.warn("[Braise] WebGL hero disabled:", err);
    }
  }

  // Render at reduced resolution: the image is soft by nature, so it looks
  // identical and costs a fraction of the fill rate.
  const SCALE = 0.45;
  const resize = () => {
    if (!uniforms) return;
    const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
    const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uniforms.uRes, w, h);
    }
  };
  resize();
  window.addEventListener("resize", resize);

  const glState = { mx: 0.5, my: 0.6, vx: 0, vy: 0, hover: 0 };

  function drawGL(time) {
    const rect = canvas.getBoundingClientRect();
    const inside = mouse.moved && mouse.y >= rect.top && mouse.y <= rect.bottom;
    const tx = (mouse.x - rect.left) / rect.width;
    const ty = 1 - (mouse.y - rect.top) / rect.height;

    const px = glState.mx, py = glState.my;
    if (inside) {
      glState.mx = lerp(glState.mx, tx, 0.08);
      glState.my = lerp(glState.my, ty, 0.08);
    }
    glState.vx = lerp(glState.vx, (glState.mx - px) * 18, 0.12);
    glState.vy = lerp(glState.vy, (glState.my - py) * 18, 0.12);
    glState.hover = lerp(glState.hover, inside ? 1 : 0, 0.05);

    gl.uniform1f(uniforms.uTime, time / 1000);
    gl.uniform2f(uniforms.uMouse, glState.mx, glState.my);
    gl.uniform2f(uniforms.uVel, glState.vx, glState.vy);
    gl.uniform1f(uniforms.uHover, glState.hover);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // =========================================================
  // 2. Dashboard follows the mouse
  // =========================================================
  const device = $("#device");
  const tilt = { x: 0, y: 0 };
  function tiltDevice() {
    const r = device.getBoundingClientRect();
    const nx = (mouse.x - (r.left + r.width / 2)) / innerWidth;
    const ny = (mouse.y - (r.top + r.height / 2)) / innerHeight;
    tilt.x = lerp(tilt.x, mouse.moved ? nx * 8 : 0, 0.07);
    tilt.y = lerp(tilt.y, mouse.moved ? -ny * 4 : 0, 0.07);
    device.style.setProperty("--ry", `${tilt.x.toFixed(2)}deg`);
    device.style.setProperty("--rx", `${tilt.y.toFixed(2)}deg`);
  }

  // =========================================================
  // 3. Spotlight on cards
  // =========================================================
  $$(".feature, .plan, .mf, .quote").forEach((card) => {
    const glow = document.createElement("span");
    glow.className = "spot";
    glow.setAttribute("aria-hidden", "true");
    card.prepend(glow);
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  // =========================================================
  // 4. Magnetic buttons
  // =========================================================
  $$(".btn--grad, .btn--white, .btn--glass, .widget__launcher").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.18;
      const y = (e.clientY - r.top - r.height / 2) * 0.3;
      btn.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    });
    btn.addEventListener("pointerleave", () => (btn.style.translate = ""));
  });

  // =========================================================
  // 5. Ardi follows the cursor with his eyes
  // =========================================================
  const ardis = $$(".ardi-live").map((svg) => ({ svg, look: svg.querySelector(".ardi-look"), x: 0, y: 0, visible: false }));
  const ardiIo = new IntersectionObserver((entries) => entries.forEach((e) => {
    const a = ardis.find((o) => o.svg === e.target);
    if (a) a.visible = e.isIntersecting;
  }));
  ardis.forEach((a) => ardiIo.observe(a.svg));

  function lookAtCursor() {
    for (const a of ardis) {
      if (!a.visible) continue;
      const r = a.svg.getBoundingClientRect();
      // eyes sit at (25, 31.5) in the 4 2 36 44 viewBox
      const ex = r.left + (21 / 36) * r.width;
      const ey = r.top + (29.5 / 44) * r.height;
      const dx = mouse.x - ex;
      const dy = mouse.y - ey;
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 300);
      a.x = lerp(a.x, mouse.moved ? (dx / d) * 1.4 * reach : 0, 0.15);
      a.y = lerp(a.y, mouse.moved ? (dy / d) * 1.1 * reach : 0, 0.15);
      a.look.setAttribute("transform", `translate(${a.x.toFixed(2)} ${a.y.toFixed(2)})`);
    }
  }

  // =========================================================
  // Loop — hero work only runs while the hero is on screen
  // =========================================================
  let heroVisible = true;
  new IntersectionObserver((entries) => (heroVisible = entries[0].isIntersecting)).observe(hero);

  function frame(time) {
    if (!document.hidden) {
      lookAtCursor();
      if (heroVisible) {
        if (uniforms) drawGL(time);
        if (device) tiltDevice();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
