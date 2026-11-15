// Animated certificate renderer. Everything is drawn on one <canvas>, so the live page,
// the PNG and the MP4 all come from the same code.
// render(ctx, cert, t, { theme, loop }) — ctx must already be scaled to W x H logical units.
(function () {
  const W = 1600, H = 1130;
  const LOOP = 9; // seconds; every moving thing repeats exactly every 9s, so the video loops with no jump

  const C = {
    orange: '#FF6A13', deep: '#E4500A', amber: '#FFB23E',
    green: '#14A049', emerald: '#0A6B35', mint: '#8FE3A9',
  };

  const THEMES = {
    paper: {
      bg: '#FFF8EF', card: '#FFFFFF', ink: '#1B140F', ink2: 'rgba(27,20,15,.68)', ink3: 'rgba(27,20,15,.46)',
      line: 'rgba(27,20,15,.10)', dot: 'rgba(27,20,15,.13)', blobA: 0.30, ribbonA: 0.15, guillA: 0.10,
      sweepOp: 'source-over', sweepA: 0.55, medalShadow: 'rgba(228,80,10,.32)', logo: 'onLight',
    },
    night: {
      bg: '#0F0D0A', card: '#FFFFFF', ink: '#FFF6EA', ink2: 'rgba(255,246,234,.74)', ink3: 'rgba(255,246,234,.50)',
      line: 'rgba(255,246,234,.12)', dot: 'rgba(255,246,234,.10)', blobA: 0.34, ribbonA: 0.22, guillA: 0.16,
      sweepOp: 'screen', sweepA: 0.30, medalShadow: 'rgba(255,106,19,.45)', logo: 'onDark',
    },
  };

  const TIERS = {
    winner:      { label: 'Winner',          rank: '1st',    shape: 'burst',   grad: [C.amber, C.orange, C.deep], verb: 'won first place at' },
    runner1:     { label: '1st Runner-up',   rank: '2nd',    shape: 'rosette', grad: [C.orange, C.deep, C.emerald], verb: 'secured 1st Runner-up at' },
    runner2:     { label: '2nd Runner-up',   rank: '3rd',    shape: 'rosette', grad: [C.mint, C.green, C.orange], verb: 'secured 2nd Runner-up at' },
    finalist:    { label: 'Finalist',        rank: 'Top 10', shape: 'hex',     grad: [C.mint, C.green, C.emerald], verb: 'was a Finalist at' },
    special:     { label: 'Special Mention', rank: 'Jury',   shape: 'rosette', grad: [C.amber, C.green, C.emerald], verb: 'earned a Special Mention at' },
    participant: { label: 'Participant',     rank: '',       shape: 'ring',    grad: [C.amber, C.orange, C.green], verb: 'built and shipped at' },
  };

  // ---------- small helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    back: (x) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  };
  const TAU = Math.PI * 2;
  function hash(str) { let h = 2166136261 >>> 0; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function setLS(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/); const lines = []; let line = '';
    for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
    if (line) lines.push(line); return lines;
  }

  // ---------- unique identity per certificate ID ----------
  // The ID seeds every pattern, so no two certificates look the same, but the same ID always looks the same.
  const idCache = new Map();
  function identity(id) {
    if (idCache.has(id)) return idCache.get(id);
    const r = rng(hash(id));
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const g = guillocheParams(r);
    const g2 = guillocheParams(r);
    const it = {
      flip: r() < 0.5, // which brand colour leads
      ribbons: Array.from({ length: 3 + Math.floor(r() * 3) }, () => ({
        f: 0.5 + r() * 1.4, ph: r() * TAU, amp: 50 + r() * 110, y: 0.3 + r() * 0.62,
        w: 36 + r() * 100, tilt: -0.32 + r() * 0.5, dir: r() < 0.5 ? 1 : -1, warm: r(),
      })),
      blobs: Array.from({ length: 4 }, (_, i) => ({ x: 0.1 + r() * 0.8, y: 0.1 + r() * 0.8, rad: 0.28 + r() * 0.3, warm: i % 2 === 0, orbit: 30 + r() * 70, ph: r() * TAU, k: 1 + Math.floor(r() * 2) })),
      dots: { fx: 2 + r() * 4, fy: 2 + r() * 4, ph: r() * TAU, k: pick([1, 2]) },
      petals: 14 + Math.floor(r() * 12),
      sparkles: Array.from({ length: 7 }, () => ({ a: r() * TAU, d: 205 + r() * 110, s: 5 + r() * 9, k: 1 + Math.floor(r() * 3), ph: r() * TAU, warm: r() < 0.5 })),
      ring: g, water: g2,
      ringPath: guillochePath(g), waterPath: guillochePath(g2),
    };
    idCache.set(id, it);
    return it;
  }
  function guillocheParams(r) {
    const R = 40 + Math.floor(r() * 30);
    let rr = 7 + Math.floor(r() * 18); if (gcd(R, rr) === rr) rr += 1;
    return { R, r: rr, d: rr * (0.6 + r() * 1.1), sym: R / gcd(R, rr) };
  }
  // Hypotrochoid "guilloche" — the fine spiral lines used on banknotes. Built once, scaled to unit radius.
  function guillochePath({ R, r, d }) {
    const turns = r / gcd(R, r); const steps = Math.min(5000, turns * 140);
    const max = R - r + d; const p = new Path2D();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * TAU * turns;
      const x = ((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t)) / max;
      const y = ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t)) / max;
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    return p;
  }

  // ---------- QR ----------
  const qrCache = new Map();
  function qrMatrix(text) {
    if (qrCache.has(text)) return qrCache.get(text);
    const q = qrcode(0, 'L'); q.addData(text); q.make();
    const n = q.getModuleCount(); const m = [];
    for (let y = 0; y < n; y++) { m.push([]); for (let x = 0; x < n; x++) m[y].push(q.isDark(y, x)); }
    qrCache.set(text, m); return m;
  }

  // ---------- fonts ----------
  const F = {
    serif: '"Instrument Serif", Georgia, serif',
    sans: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
    mono: '"Geist Mono", ui-monospace, monospace',
  };
  // Official logo images (see logo.js). Drawn once loaded; header falls back to text until then.
  const LOGO = {};
  function loadLogos() {
    const src = window.HACKINDIA_LOGO || {};
    return Promise.all(['onLight', 'onDark'].filter((k) => src[k]).map((k) => new Promise((res) => {
      const im = new Image(); im.onload = () => { LOGO[k] = im; res(); }; im.onerror = res; im.src = src[k];
    })));
  }
  function ready() {
    return Promise.all([
      loadLogos(),
      document.fonts.load(`400 100px ${F.serif}`), document.fonts.load(`italic 400 100px ${F.serif}`),
      document.fonts.load(`400 30px ${F.sans}`), document.fonts.load(`500 30px ${F.sans}`), document.fonts.load(`600 30px ${F.sans}`),
      document.fonts.load(`400 18px ${F.mono}`),
    ]).catch(() => {});
  }

  // ---------- timeline ----------
  // Intro (0–5s): border draws, light sweep, name writes on, details rise, badge pops, QR prints.
  // Hold (5–8s) with a second sweep. Loop mode only: content fades out 8.1–8.95 so frame 9.0 == frame 0.
  function sweepAt(tt, once) {
    if (tt >= 1.0 && tt <= 2.4) return E.inOut(prog(tt, 1.0, 2.4));
    if (!once) return tt >= 5.6 && tt <= 6.8 ? E.inOut(prog(tt, 5.6, 6.8)) : null;
    if (tt > 5) { const s = (tt - 5) % 6; return s >= 0.6 && s <= 1.8 ? E.inOut(prog(s, 0.6, 1.8)) : null; }
    return null;
  }

  function render(ctx, cert, t, opt = {}) {
    const th = THEMES[opt.theme] || THEMES.paper;
    const tier = TIERS[cert.tier] || TIERS.participant;
    const id = identity(cert.id || 'preview');
    const once = !opt.loop;
    const tt = once ? t : ((t % LOOP) + LOOP) % LOOP;
    const ph = (TAU * (((t % LOOP) + LOOP) % LOOP)) / LOOP; // 0..2π over one loop
    const out = once ? 1 : 1 - E.inOut(prog(tt, 8.1, 8.95));
    const sw = sweepAt(tt, once);
    const sweepX = sw == null ? null : -400 + sw * (W + 800);
    const A = id.flip ? C.green : C.orange, B = id.flip ? C.orange : C.green;

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // 1. Paper + flowing colour fields (always on, perfectly periodic)
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
    for (const b of id.blobs) {
      const cx = b.x * W + Math.cos(ph * b.k + b.ph) * b.orbit, cy = b.y * H + Math.sin(ph * b.k + b.ph) * b.orbit;
      const rad = b.rad * W;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const col = b.warm ? (id.flip ? '20,160,73' : '255,106,19') : (id.flip ? '255,106,19' : '20,160,73');
      g.addColorStop(0, `rgba(${col},${th.blobA})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // dot field with a slow wave
    ctx.fillStyle = th.dot;
    for (let y = 70; y < H - 60; y += 30) for (let x = 70; x < W - 60; x += 30) {
      const w = 0.5 + 0.5 * Math.sin((x / W) * id.dots.fx * TAU + (y / H) * id.dots.fy * TAU + ph * id.dots.k + id.dots.ph);
      const s = 1 + w * 1.6; ctx.globalAlpha = 0.25 + w * 0.75; ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    // ribbons
    ctx.lineCap = 'round';
    for (const rb of id.ribbons) {
      const pts = [];
      for (let x = -120; x <= W + 120; x += 24) {
        pts.push([x, rb.y * H + Math.sin((x / W) * rb.f * TAU + ph * rb.dir + rb.ph) * rb.amp + (x - W / 2) * rb.tilt]);
      }
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, rb.warm > 0.5 ? A : B); g.addColorStop(0.55, C.amber); g.addColorStop(1, rb.warm > 0.5 ? B : A);
      const line = (off, lw, a) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + off) : ctx.moveTo(x, y + off))); ctx.lineWidth = lw; ctx.globalAlpha = a; ctx.strokeStyle = g; ctx.stroke(); };
      line(0, rb.w, th.ribbonA);
      line(-rb.w * 0.5 - 8, 1.2, th.ribbonA * 2.2);
      line(rb.w * 0.5 + 8, 1.2, th.ribbonA * 2.2);
    }
    ctx.globalAlpha = 1;
    // large guilloche watermark behind the badge
    ctx.save(); ctx.translate(1240, 450); ctx.rotate(ph / id.water.sym); ctx.scale(330, 330);
    ctx.lineWidth = 1 / 330; ctx.strokeStyle = A; ctx.globalAlpha = th.guillA; ctx.stroke(id.waterPath); ctx.restore();

    // ---------- content (fades with `out` in loop mode) ----------
    const show = (a0, a1, dy = 18) => { const a = E.out(prog(tt, a0, a1)); ctx.globalAlpha = a * out; return (1 - a) * dy; };

    // 2. Glowing animated border
    {
      const p = E.inOut(prog(tt, 0.0, 1.4));
      const x = 40, y = 40, w = W - 80, h = H - 80, r = 30;
      const per = 2 * (w + h) - (8 - TAU) * r;
      const cg = ctx.createConicGradient ? ctx.createConicGradient(ph, W / 2, H / 2) : ctx.createLinearGradient(0, 0, W, H);
      [[0, C.orange], [0.22, C.amber], [0.45, C.green], [0.7, C.mint], [0.85, C.green], [1, C.orange]].forEach(([o, c]) => cg.addColorStop(o, c));
      ctx.save();
      ctx.globalAlpha = out;
      ctx.setLineDash([per * p, per]);
      ctx.strokeStyle = cg; ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(255,140,40,.55)'; ctx.shadowBlur = 22 + 10 * Math.sin(ph * 2);
      rrect(ctx, x, y, w, h, r); ctx.stroke();
      ctx.shadowBlur = 0; ctx.setLineDash([]);
      ctx.globalAlpha = out * E.out(prog(tt, 0.6, 1.6));
      ctx.strokeStyle = th.line; ctx.lineWidth = 1; rrect(ctx, 58, 58, W - 116, H - 116, 20); ctx.stroke();
      // corner ticks
      ctx.strokeStyle = B; ctx.lineWidth = 3;
      for (const [cx, cy, sx, sy] of [[58, 58, 1, 1], [W - 58, 58, -1, 1], [58, H - 58, 1, -1], [W - 58, H - 58, -1, -1]]) {
        ctx.beginPath(); ctx.moveTo(cx + sx * 34, cy + sy * 0); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * 34); ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Header
    {
      const dy = show(0.5, 1.4);
      ctx.save(); ctx.translate(0, dy);
      // official HackIndia logo, then a hairline and the event name + venue
      const mx = 110, my = 104, lh = 50;
      const logo = LOGO[th.logo];
      const lw = logo ? Math.round(lh * logo.naturalWidth / logo.naturalHeight) : 0;
      if (logo) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(logo, mx, my - 1, lw, lh); }
      const tx = logo ? mx + lw + 48 : mx;
      if (logo) { ctx.fillStyle = th.line; ctx.fillRect(mx + lw + 24, my + 2, 1.5, lh - 6); }
      ctx.fillStyle = th.ink; ctx.font = `600 26px ${F.sans}`; ctx.textBaseline = 'alphabetic'; setLS(ctx, -0.3);
      ctx.fillText(cert.event || 'HackIndia', tx, my + 21);
      ctx.fillStyle = th.ink3; ctx.font = `500 17px ${F.sans}`; setLS(ctx, 0);
      ctx.fillText(cert.venue ? `${cert.venue}` : 'Official certificate', tx, my + 46);
      // right side
      ctx.textAlign = 'right';
      ctx.fillStyle = th.ink2; ctx.font = `600 17px ${F.sans}`; setLS(ctx, 4);
      ctx.fillText('CERTIFICATE OF ACHIEVEMENT', W - 110 + 4, my + 20);
      setLS(ctx, 0.5); ctx.fillStyle = th.ink3; ctx.font = `400 17px ${F.mono}`;
      ctx.fillText(`No. ${cert.id || '—'}`, W - 110, my + 47);
      ctx.textAlign = 'left'; setLS(ctx, 0);
      ctx.restore();
    }

    // 4. Name block
    const X0 = 110, maxW = 900;
    {
      let dy = show(1.0, 1.9);
      ctx.save(); ctx.translate(0, dy);
      ctx.fillStyle = th.ink2; ctx.font = `italic 400 38px ${F.serif}`;
      ctx.fillText('This certifies that', X0, 372);
      ctx.restore();

      // fit the name to the column
      const name = cert.name || 'Your Name';
      let size = 152; ctx.font = `400 ${size}px ${F.serif}`; setLS(ctx, -3);
      while (ctx.measureText(name).width > maxW && size > 70) { size -= 4; ctx.font = `400 ${size}px ${F.serif}`; }
      const nw = ctx.measureText(name).width; const ny = 512;
      const p = E.out(prog(tt, 1.5, 2.8));
      ctx.save();
      ctx.globalAlpha = out;
      ctx.beginPath(); ctx.rect(0, ny - size, X0 + p * (nw + 60), size * 1.45); ctx.clip();
      let fill = th.ink;
      if (sweepX != null) {
        const c = (sweepX - X0) / nw;
        if (c > -0.3 && c < 1.3) {
          const g = ctx.createLinearGradient(X0, 0, X0 + nw, 0);
          g.addColorStop(0, th.ink); g.addColorStop(clamp(c - 0.16), th.ink); g.addColorStop(clamp(c - 0.05), C.orange);
          g.addColorStop(clamp(c), C.amber); g.addColorStop(clamp(c + 0.05), C.green); g.addColorStop(clamp(c + 0.16), th.ink); g.addColorStop(1, th.ink);
          fill = g;
        }
      }
      ctx.fillStyle = fill; ctx.fillText(name, X0, ny);
      ctx.restore(); setLS(ctx, 0);
      // write-on light edge
      if (p > 0 && p < 1) {
        const ex = X0 + p * (nw + 60);
        ctx.save(); ctx.globalAlpha = out * Math.sin(p * Math.PI);
        const lg = ctx.createLinearGradient(0, ny - size, 0, ny + size * 0.3);
        lg.addColorStop(0, 'rgba(255,178,62,0)'); lg.addColorStop(0.5, C.amber); lg.addColorStop(1, 'rgba(20,160,73,0)');
        ctx.fillStyle = lg; ctx.shadowColor = C.amber; ctx.shadowBlur = 30; ctx.fillRect(ex - 2, ny - size, 4, size * 1.3);
        ctx.restore();
      }
      // underline grows with the name
      ctx.save(); ctx.globalAlpha = out;
      const ug = ctx.createLinearGradient(X0, 0, X0 + nw, 0); ug.addColorStop(0, C.orange); ug.addColorStop(0.6, C.amber); ug.addColorStop(1, C.green);
      ctx.fillStyle = ug; ctx.fillRect(X0, ny + 34, Math.max(0, E.inOut(prog(tt, 1.9, 3.0)) * Math.min(nw, maxW)), 3);
      ctx.restore();

      // achievement sentence
      dy = show(2.6, 3.4);
      ctx.save(); ctx.translate(0, dy);
      const parts = [[tier.verb + ' ', `400 31px ${F.sans}`, th.ink], [cert.event || 'HackIndia', `600 31px ${F.sans}`, th.ink]];
      let x = X0; for (const [txt, font, col] of parts) { ctx.font = font; ctx.fillStyle = col; ctx.fillText(txt, x, 616); x += ctx.measureText(txt).width; }
      ctx.restore();
      if (cert.project) {
        dy = show(2.9, 3.7);
        ctx.save(); ctx.translate(0, dy);
        ctx.font = `italic 400 34px ${F.serif}`; ctx.fillStyle = th.ink2;
        const lines = wrap(ctx, `for building “${cert.project}”`, maxW - 40).slice(0, 2);
        lines.forEach((l, i) => ctx.fillText(l, X0, 666 + i * 42));
        ctx.restore();
      }
    }

    // 5. Details row
    {
      const cols = [['DATE', fmtDate(cert.date)], ['VENUE', cert.venue || '—'], ['TEAM', cert.team || '—']];
      cols.forEach(([k, v], i) => {
        const dy = show(3.9 + i * 0.12, 4.7 + i * 0.12);
        ctx.save(); ctx.translate(0, dy);
        const x = X0 + i * 290;
        ctx.fillStyle = th.ink3; ctx.font = `600 14px ${F.sans}`; setLS(ctx, 3); ctx.fillText(k, x, 872); setLS(ctx, 0);
        ctx.fillStyle = th.ink; ctx.font = `500 25px ${F.sans}`;
        let s = v; while (ctx.measureText(s).width > 260 && s.length > 3) s = s.slice(0, -2) + '…';
        ctx.fillText(s, x, 908);
        ctx.restore();
      });
      const dy = show(4.4, 5.1);
      ctx.save(); ctx.translate(0, dy);
      ctx.fillStyle = th.line; ctx.fillRect(X0, 960, maxW - 40, 1);
      ctx.fillStyle = th.ink3; ctx.font = `400 15px ${F.mono}`; setLS(ctx, 0.3);
      ctx.fillText(`Signed digitally · scan the code to check it is real · ${cert.id || ''}`, X0, 1000);
      setLS(ctx, 0); ctx.restore();
    }

    // 6. Badge
    drawBadge(ctx, cert, tier, id, th, tt, ph, out, sweepX, show);

    // 7. QR
    drawQR(ctx, cert, th, tt, out, show);

    // 8. Light sweep across the whole card
    if (sweepX != null) {
      ctx.save(); ctx.globalAlpha = out; ctx.globalCompositeOperation = th.sweepOp;
      ctx.translate(sweepX, H / 2); ctx.rotate(0.32);
      const g = ctx.createLinearGradient(-220, 0, 220, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, `rgba(255,250,240,${th.sweepA * 0.5})`);
      g.addColorStop(0.5, `rgba(255,255,255,${th.sweepA})`); g.addColorStop(0.58, `rgba(255,250,240,${th.sweepA * 0.5})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-220, -H, 440, H * 2);
      ctx.restore();
    }

    ctx.restore();
  }

  function shapePath(ctx, shape, R, petals) {
    ctx.beginPath();
    if (shape === 'burst') {
      const n = 28; for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * TAU - Math.PI / 2; const r = i % 2 ? R * 0.9 : R; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    } else if (shape === 'rosette') {
      for (let i = 0; i <= 360; i++) { const a = (i / 360) * TAU; const r = R * (0.94 + 0.06 * Math.cos(petals * a)); i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    } else if (shape === 'hex') {
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; i ? ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R) : ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); }
    } else ctx.arc(0, 0, R, 0, TAU);
    ctx.closePath();
  }

  function drawBadge(ctx, cert, tier, id, th, tt, ph, out, sweepX, show) {
    const cx = 1240, cy = 450, R = 172;
    const pop = prog(tt, 3.1, 4.1);
    const s = pop <= 0 ? 0 : E.back(pop);
    if (s <= 0) return;
    ctx.save(); ctx.translate(cx, cy);
    ctx.globalAlpha = out * clamp(pop * 3);

    // halo (breathing)
    const hr = R * (1.75 + 0.08 * Math.sin(ph * 2));
    const hg = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, hr);
    hg.addColorStop(0, 'rgba(255,160,60,.42)'); hg.addColorStop(0.55, 'rgba(20,160,73,.14)'); hg.addColorStop(1, 'rgba(20,160,73,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, hr, 0, TAU); ctx.fill();

    // burst ring on reveal
    const bp = prog(tt, 3.5, 4.6);
    if (bp > 0 && bp < 1) {
      ctx.save(); ctx.globalAlpha = out * (1 - bp) * 0.8; ctx.strokeStyle = C.amber; ctx.lineWidth = 6 * (1 - bp) + 1;
      ctx.beginPath(); ctx.arc(0, 0, R * (1 + bp * 0.9), 0, TAU); ctx.stroke(); ctx.restore();
    }

    ctx.scale(s, s);
    ctx.rotate((1 - E.out(pop)) * -0.6);

    // guilloche ring (slow turn, one symmetry step per loop = seamless)
    ctx.save(); ctx.rotate(ph / id.ring.sym); ctx.scale(R * 1.2, R * 1.2);
    const rg = ctx.createLinearGradient(-1, -1, 1, 1); rg.addColorStop(0, C.orange); rg.addColorStop(1, C.green);
    ctx.strokeStyle = rg; ctx.lineWidth = 1.1 / (R * 1.2); ctx.globalAlpha *= 0.55; ctx.stroke(id.ringPath); ctx.restore();

    // medal body
    const g = ctx.createLinearGradient(-R, -R, R, R);
    tier.grad.forEach((c, i) => g.addColorStop(i / (tier.grad.length - 1), c));
    ctx.save();
    ctx.shadowColor = th.medalShadow; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
    shapePath(ctx, tier.shape, R, id.petals); ctx.fillStyle = g; ctx.fill();
    ctx.restore();

    // inner disc + rings
    const ig = ctx.createLinearGradient(0, -R, 0, R);
    ig.addColorStop(0, 'rgba(255,255,255,.22)'); ig.addColorStop(1, 'rgba(0,0,0,.10)');
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, TAU); ctx.stroke();
    ctx.save(); ctx.rotate(-ph / 6); ctx.setLineDash([2, 9]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, TAU); ctx.stroke(); ctx.restore();

    // sheen when the sweep passes
    if (sweepX != null) {
      ctx.save(); shapePath(ctx, tier.shape, R, id.petals); ctx.clip();
      const lx = sweepX - cx;
      const sg = ctx.createLinearGradient(lx - 120, 0, lx + 120, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.rotate(0.32); ctx.fillStyle = sg; ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4); ctx.restore();
    }

    // rank text
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    const rank = (cert.rank || tier.rank || '').trim();
    const m = rank.match(/^(\d+)\s*(st|nd|rd|th)$/i);
    if (m) {
      ctx.font = `400 168px ${F.serif}`; const nw = ctx.measureText(m[1]).width;
      ctx.font = `600 38px ${F.sans}`; const sw = ctx.measureText(m[2].toUpperCase()).width;
      const x0 = -(nw + sw + 6) / 2;
      ctx.textAlign = 'left';
      ctx.font = `400 168px ${F.serif}`; ctx.fillText(m[1], x0, 52);
      ctx.font = `600 38px ${F.sans}`; ctx.fillText(m[2].toUpperCase(), x0 + nw + 6, -30);
    } else if (rank) {
      let size = 96; ctx.font = `400 ${size}px ${F.serif}`;
      while (ctx.measureText(rank).width > R * 1.15 && size > 36) { size -= 4; ctx.font = `400 ${size}px ${F.serif}`; }
      ctx.fillText(rank, 0, size * 0.34);
    } else {
      star4(ctx, 0, 0, 70, 0.32); ctx.fill();
    }
    ctx.restore();

    // tier label under the badge
    const dy = show(3.8, 4.5, 12);
    ctx.save(); ctx.translate(cx, cy + R + 66 + dy);
    ctx.font = `600 24px ${F.sans}`; setLS(ctx, 6); ctx.textAlign = 'center';
    const label = tier.label.toUpperCase(); const lw = ctx.measureText(label).width;
    const lg = ctx.createLinearGradient(-lw / 2, 0, lw / 2, 0); lg.addColorStop(0, C.deep); lg.addColorStop(1, C.emerald);
    ctx.fillStyle = th === THEMES.night ? C.amber : lg; ctx.fillText(label, 3, 0);
    setLS(ctx, 0); ctx.restore();

    // twinkles
    ctx.save(); ctx.translate(cx, cy);
    for (const sp of id.sparkles) {
      const a = Math.pow(Math.max(0, Math.sin(ph * sp.k + sp.ph)), 3) * out * clamp(prog(tt, 4.0, 4.8));
      if (a <= 0.01) continue;
      ctx.globalAlpha = a; ctx.fillStyle = sp.warm ? C.amber : C.mint;
      star4(ctx, Math.cos(sp.a) * sp.d, Math.sin(sp.a) * sp.d, sp.s, 0.25); ctx.fill();
    }
    ctx.restore();
  }

  function star4(ctx, x, y, r, inner) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU - Math.PI / 2; const rr = i % 2 ? r * inner : r; i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }

  function drawQR(ctx, cert, th, tt, out, show) {
    if (!cert.verifyUrl || typeof qrcode === 'undefined') return;
    const m = qrMatrix(cert.verifyUrl); const n = m.length;
    const size = 226, pad = 14, cx = 1240, top = 740;
    const x0 = cx - size / 2, y0 = top;
    const dy = show(4.0, 4.6, 14);
    ctx.save(); ctx.translate(0, dy);
    ctx.shadowColor = 'rgba(17,17,17,.10)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    ctx.fillStyle = th.card; rrect(ctx, x0 - pad, y0 - pad, size + pad * 2, size + pad * 2, 18); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(17,17,17,.07)'; ctx.lineWidth = 1; ctx.stroke();
    const cell = size / n; const rows = Math.floor(E.inOut(prog(tt, 4.1, 4.9)) * n + 0.0001);
    ctx.fillStyle = '#16120E';
    for (let y = 0; y < Math.min(rows, n); y++) for (let x = 0; x < n; x++) if (m[y][x]) ctx.fillRect(x0 + x * cell, y0 + y * cell, cell + 0.4, cell + 0.4);
    if (rows < n && rows > 0) {
      const ly = y0 + rows * cell;
      ctx.fillStyle = C.green; ctx.shadowColor = C.green; ctx.shadowBlur = 16; ctx.fillRect(x0 - 6, ly - 1.5, size + 12, 3); ctx.shadowBlur = 0;
    }
    ctx.fillStyle = th.ink2; ctx.font = `600 14px ${F.sans}`; setLS(ctx, 4); ctx.textAlign = 'center';
    ctx.fillText('SCAN TO VERIFY', cx + 2, y0 + size + pad + 34);
    setLS(ctx, 0); ctx.textAlign = 'left';
    ctx.restore();
  }

  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  window.Cert = { W, H, LOOP, render, ready, identity, TIERS, fmtDate };
})();
