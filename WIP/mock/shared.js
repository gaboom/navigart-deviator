/* Shared helpers for the flow-state mocks. Throwaway WIP: not production code. */
(function () {
  'use strict';

  const RAD  = Math.PI / 180;
  const norm = d => ((d % 360) + 360) % 360;
  const fmt3 = d => String(Math.round(norm(d)) % 360).padStart(3, '0') + '°';
  const fmtDev = d => { const r = Math.round(d); return r === 0 ? '0°' : Math.abs(r) + '°' + (r > 0 ? 'E' : 'W'); };
  const $ = (s, r) => (r || document).querySelector(s);
  const css = k => getComputedStyle(document.body).getPropertyValue(k).trim();
  const accent = () => document.body.classList.contains('night') ? css('--fg') : css('--acc');

  /* ---------- Flow state carried in the URL (mock stand-in for the app state) ---------- */
  const KEEP = ['n', 'start', 'dir', 'ref', 'var', 'round', 'rounds', 'boat', 'date', 'use'];
  const raw  = new URLSearchParams(location.search);
  function params() {
    const g = (k, d) => raw.has(k) ? raw.get(k) : d;
    const use = {};
    String(g('use', '')).split(',').filter(Boolean).forEach(kv => { const [h, m] = kv.split(':'); if (h && m) use[+h] = m; });
    return {
      n: +g('n', 8), start: +g('start', 0), dir: g('dir', 'stbd'),
      ref: g('ref', 'T'), var: +g('var', 4), round: +g('round', 1), rounds: +g('rounds', 2),
      boat: g('boat', 'Kittiwake'), date: g('date', '2026-10-09'), use,
      remeasure: raw.has('remeasure') ? +raw.get('remeasure') : null
    };
  }
  function fmtUse(use) {
    const s = Object.entries(use || {}).filter(([, m]) => m && m !== 'both').map(([h, m]) => `${h}:${m}`).join(',');
    return s || null;
  }
  function link(page, over) {
    const q = new URLSearchParams();
    KEEP.forEach(k => { if (raw.has(k)) q.set(k, raw.get(k)); });
    Object.entries(over || {}).forEach(([k, v]) => { if (v === null || v === undefined || v === '') q.delete(k); else q.set(k, v); });
    const s = q.toString();
    return page + (s ? '?' + s : '');
  }
  const here = () => location.pathname.split('/').pop() || 'index.html';

  /* ---------- Theme (light / night / auto) & Portrait Lock ---------- */
  function applyTheme() {
    const pref = raw.get('theme') || localStorage.getItem('deviator.theme') || 'auto';
    const night = pref === 'night' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('night', night);
  }
  applyTheme();

  if (!document.querySelector('link[rel="manifest"]')) {
    const m = document.createElement('link');
    m.rel = 'manifest'; m.href = 'manifest.json';
    document.head.appendChild(m);
  }
  const lockPortrait = () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait-primary').catch(() => {}); } catch (e) {} };
  lockPortrait();
  window.addEventListener('pointerdown', lockPortrait, { once: true });

  /* Globally block right-click / long-press context menu, text selection, and native element dragging */
  ['contextmenu', 'dragstart', 'selectstart'].forEach(ev =>
    window.addEventListener(ev, e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
    }, { capture: true })
  );

  const tg = document.createElement('div');
  tg.className = 'tilt-guard';
  tg.innerHTML = '<div class="icon">↻</div><div class="title">Portrait orientation only</div><div class="hint">Please rotate your device upright to continue.</div>';
  document.body.appendChild(tg);

  if (here() !== 'index.html') {
    const a = document.createElement('a');
    a.className = 'mockbar'; a.href = 'index.html'; a.textContent = 'MOCK · INDEX';
    document.body.appendChild(a);
  }

  /* Harmonic fit: dev(c) = A + B sin c + C cos c + D sin 2c + E cos 2c
     At n = 4 (0, 90, 180, 270), sin(2c) = 0 (quadrantal D is unobservable) and cos(2c) = ±1 is at the Nyquist
     frequency where sum(cos^2(2c)) = n = 4, so E must be scaled by 1/n rather than 2/n. */
  function fit(H, D) {
    const n = H.length; let A = 0, B = 0, C = 0, Dd = 0, E = 0;
    H.forEach((h, i) => {
      const r = h * RAD, d = D[i];
      A += d; B += d * Math.sin(r); C += d * Math.cos(r); Dd += d * Math.sin(2 * r); E += d * Math.cos(2 * r);
    });
    A /= n; B *= 2 / n; C *= 2 / n; Dd *= (n <= 4 ? 0 : 2 / n); E *= (n === 4 ? 1 / n : 2 / n);
    const dev  = c => { const r = c * RAD; return A + B * Math.sin(r) + C * Math.cos(r) + Dd * Math.sin(2 * r) + E * Math.cos(2 * r); };
    const toMC = cc => norm(cc + dev(cc));
    const toCC = mc => { let c = mc; for (let i = 0; i < 10; i++) c = mc - dev(c); return norm(c); };
    return { A, B, C, D: Dd, E, dev, toMC, toCC };
  }

  /* ---------- Sample measurement (East = +). Starboard round and port round differ by turning lag ---------- */
  const SAMPLE = {
    boat: 'Kittiwake', date: '2026-10-09',
    H:    [0, 45, 90, 135, 180, 225, 270, 315],
    stbd: [-2.0, 1.5, 4.0, 2.5, 0.0, -3.0, -4.5, -4.0],
    port: [-1.0, 2.5, 5.0, 3.5, 1.0, -2.0, -3.5, -3.0]
  };
  SAMPLE.avg = SAMPLE.stbd.map((d, i) => (d + SAMPLE.port[i]) / 2);
  SAMPLE.fit = fit(SAMPLE.H, SAMPLE.avg);

  /* Build a sample dataset matching the requested precision n, rounds, and per-heading selection */
  function sample(p) {
    const P = p || params(), n = [4, 6, 8, 10, 12].includes(P.n) ? P.n : 8;
    const hasS = P.rounds === 2 || P.dir === 'stbd', hasP = P.rounds === 2 || P.dir === 'port';
    const H = Array.from({ length: n }, (_, i) => Math.round(i * 360 / n));
    const stbd = n === 8 ? SAMPLE.stbd.slice() : H.map(h => Math.round((SAMPLE.fit.dev(h) - 0.5) * 2) / 2);
    const port = n === 8 ? SAMPLE.port.slice() : H.map(h => Math.round((SAMPLE.fit.dev(h) + 0.5) * 2) / 2);
    const modeFor = h => {
      const u = P.use && P.use[h];
      if (u === 'stbd' && hasS) return 'stbd';
      if (u === 'port' && hasP) return 'port';
      return hasS && hasP ? 'both' : hasS ? 'stbd' : 'port';
    };
    const avg = H.map((h, i) => {
      const m = modeFor(h);
      return m === 'stbd' ? stbd[i] : m === 'port' ? port[i] : (stbd[i] + port[i]) / 2;
    });
    return { boat: P.boat || SAMPLE.boat, date: P.date || SAMPLE.date, H, stbd, port, avg, hasS, hasP, modeFor, fit: fit(H, avg) };
  }

  /* ---------- Canvas helper ---------- */
  function prep(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [g, w, h];
  }

  /* ---------- Heading tape: physics-like 1:1 cylindrical barrel drag + smooth integer snap, taps do nothing ---------- */
  function Tape(cv, get, set, getAnchor, onBand) {
    let ppd = 16, drag = null, vFloat = get(), lastVal = vFloat, snapRaf = null;
    function draw() {
      const [g, w, h] = prep(cv), mid = w / 2, cur = get();
      if (!drag && cur !== lastVal) {
        if (snapRaf) { cancelAnimationFrame(snapRaf); snapRaf = null; }
        vFloat = lastVal = cur;
      } else if (!drag && !snapRaf) {
        vFloat = lastVal = cur;
      }
      const s = Math.max(1, h / 78); ppd = Math.min(16 * s, Math.max(11, w / 14.5));
      const fg = css('--fg'), muted = css('--muted'), line = css('--line'), tile2 = css('--tile2'), acc = accent();

      /* Subtle recessed barrel track & top/bottom grip rails */
      g.fillStyle = tile2;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = line; g.lineWidth = 1.5 * s;
      g.beginPath();
      g.moveTo(0, 1 * s); g.lineTo(w, 1 * s);
      g.moveTo(0, h - 1 * s); g.lineTo(w, h - 1 * s);
      g.stroke();

      /* Cylindrical barrel projection: ticks compress and fade naturally toward the left/right edges */
      const maxDeg = Math.min(34, Math.ceil((mid / ppd) * 1.35) + 2);
      const R = mid * 1.08;

      /* Deviation band [CC, MC] (accent) and optional Variation band [MC, TC] (muted) */
      const wrapDiff = (a, b) => (((a - b) % 360) + 540) % 360 - 180;
      const degPos = val => {
        const d = wrapDiff(val, vFloat);
        const th = (d * ppd) / R;
        const rawX = mid + R * Math.sin(th);
        const onTape = Math.abs(th) < 1.32 && rawX > 0 && rawX < w;
        return { d, x: onTape ? rawX : (th < 0 ? 0 : w), onTape };
      };
      let band = { visible: false, devVisible: false, varVisible: false, w, mid };
      if (typeof getAnchor === 'function') {
        const refObj = getAnchor();
        const ccVal = (refObj && typeof refObj === 'object') ? refObj.cc : refObj;
        const varDeg = (refObj && typeof refObj === 'object' && refObj.varDeg) ? refObj.varDeg : 0;
        const isTrue = !!(refObj && typeof refObj === 'object' && refObj.isTrue);
        const mcVal = vFloat - varDeg, tcVal = isTrue ? vFloat : null;
        const hasDev = Math.abs(wrapDiff(mcVal, ccVal)) > 0.01;
        const hasVar = isTrue && Math.abs(wrapDiff(tcVal, mcVal)) > 0.01;
        const pCc = degPos(ccVal), pMc = degPos(mcVal), pTc = isTrue ? degPos(tcVal) : null;
        band = { visible: hasDev || hasVar, devVisible: hasDev, varVisible: hasVar, w, mid, pCc, pMc, pTc };

        if (hasVar) {
          const x0 = Math.min(pMc.x, pTc.x), bw = Math.abs(pTc.x - pMc.x);
          g.save();
          g.globalAlpha = 0.10;
          g.fillStyle = muted;
          g.fillRect(x0, 0, bw, h);
          g.globalAlpha = 0.45;
          g.strokeStyle = muted; g.lineWidth = 1.5 * s;
          g.beginPath();
          g.moveTo(x0, 1 * s); g.lineTo(x0 + bw, 1 * s);
          g.moveTo(x0, h - 1 * s); g.lineTo(x0 + bw, h - 1 * s);
          if (pMc.onTape && Math.abs(pMc.d) > 0.01) {
            g.moveTo(pMc.x, h); g.lineTo(pMc.x, h * 0.50);
          }
          g.stroke();
          g.restore();
        }
        if (hasDev) {
          const x0 = Math.min(pCc.x, pMc.x), bw = Math.abs(pMc.x - pCc.x);
          g.save();
          g.globalAlpha = 0.22;
          g.fillStyle = acc;
          g.fillRect(x0, 0, bw, h);
          g.restore();
          g.strokeStyle = acc; g.lineWidth = 2 * s;
          g.beginPath();
          g.moveTo(x0, 1 * s); g.lineTo(x0 + bw, 1 * s);
          g.moveTo(x0, h - 1 * s); g.lineTo(x0 + bw, h - 1 * s);
          [pCc, pMc].forEach(pt => {
            if (pt.onTape && Math.abs(pt.d) > 0.01) {
              g.moveTo(pt.x, 0); g.lineTo(pt.x, 10 * s);
              g.moveTo(pt.x, h); g.lineTo(pt.x, h * 0.50);
            }
          });
          g.stroke();
        }
      }
      if (typeof onBand === 'function') onBand(band);

      const baseDeg = Math.floor(vFloat);
      const frac = vFloat - baseDeg;

      g.font = `700 ${Math.round(14 * s)}px "Segoe UI", system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'top';

      for (let k = -maxDeg; k <= maxDeg; k++) {
        const dOff = k - frac;
        const theta = (dOff * ppd) / R;
        if (Math.abs(theta) >= 1.32) continue;
        const x = mid + R * Math.sin(theta);
        const cosT = Math.cos(theta);
        const deg = norm(baseDeg + k);
        const is10 = deg % 10 === 0, is5 = deg % 5 === 0;
        const len = (is10 ? h * 0.42 : is5 ? h * 0.29 : h * 0.17) * (0.72 + 0.28 * cosT);

        g.save();
        g.globalAlpha = Math.max(0.14, Math.pow(cosT, 1.4));
        g.strokeStyle = is5 ? fg : muted;
        g.lineWidth = (is10 ? 2.2 : is5 ? 1.6 : 1) * s * (0.65 + 0.35 * cosT);
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x, h - len);
        g.stroke();

        /* Subtle upper grip ticks */
        g.strokeStyle = muted;
        g.lineWidth = 1 * s;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, (is5 ? 5.5 : 3) * s * cosT);
        g.stroke();

        if (is10) {
          g.fillStyle = fg;
          g.translate(x, 13 * s);
          g.scale(0.8 + 0.2 * cosT, 1);
          g.fillText(String(deg).padStart(3, '0'), 0, 0);
        }
        g.restore();
      }

      /* Center lubber pointer at top & lower lubber line (stops below the degree numbers so it never strikes through 000) */
      g.fillStyle = acc; g.strokeStyle = acc; g.lineWidth = 3 * s;
      g.beginPath(); g.moveTo(mid, h); g.lineTo(mid, h * 0.50); g.stroke();
      g.beginPath();
      g.moveTo(mid - 8 * s, 0);
      g.lineTo(mid + 8 * s, 0);
      g.lineTo(mid, 10 * s);
      g.closePath();
      g.fill();
    }

    function animateSnap() {
      const target = get();
      let diff = ((target - vFloat + 540) % 360) - 180;
      if (Math.abs(diff) < 0.02) {
        vFloat = target;
        snapRaf = null;
        draw();
        return;
      }
      vFloat = norm(vFloat + diff * 0.32);
      draw();
      snapRaf = requestAnimationFrame(animateSnap);
    }

    cv.addEventListener('pointerdown', e => {
      if (snapRaf) { cancelAnimationFrame(snapRaf); snapRaf = null; }
      cv.setPointerCapture(e.pointerId);
      vFloat = get();
      drag = { x: e.clientX, v0: vFloat, moved: false };
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = drag.x - e.clientX;
      if (Math.abs(dx) > 2) drag.moved = true;
      if (!drag.moved) return;
      vFloat = norm(drag.v0 + dx / ppd);
      const nv = norm(Math.round(vFloat));
      lastVal = nv;
      set(nv);
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      if (snapRaf) cancelAnimationFrame(snapRaf);
      snapRaf = requestAnimationFrame(animateSnap);
    };
    ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, endDrag));
    return { draw };
  }

  /* ± buttons: one tap = 1 degree, holding repeats */
  function stepper(btn, step) {
    let t1, t2;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); step();
      t1 = setTimeout(() => t2 = setInterval(step, 90), 450);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, stop));
  }

  /* ---------- Cartesian curve: heading across, deviation up/down ---------- */
  function drawCurve(cv, o) {
    const [g, w, h] = prep(cv);
    const s = Math.max(1, Math.min(w, h) / 300), fs = Math.round(11 * s);
    const padL = 34 * s, padR = 10 * s, padT = (o.title ? 30 : 10) * s, padB = 20 * s;
    const pw = w - padL - padR, ph = h - padT - padB;
    let m = 0;
    for (let c = 0; c <= 360; c += 2) m = Math.max(m, Math.abs(o.fit.dev(c)));
    (o.sets || []).forEach(S => S.pts.forEach(p => m = Math.max(m, Math.abs(p[1]))));
    m = Math.max(5, Math.ceil(m + 1));
    const X = c => padL + c / 360 * pw, Y = d => padT + ph / 2 - d / m * (ph / 2);

    g.font = `${fs}px "Segoe UI", system-ui, sans-serif`; g.textBaseline = 'middle';
    g.strokeStyle = css('--line'); g.lineWidth = 1; g.fillStyle = css('--muted');
    for (let d = -m; d <= m; d++) {
      g.beginPath(); g.moveTo(X(0), Y(d)); g.lineTo(X(360), Y(d)); g.stroke();
      if (d % 2 === 0) { g.textAlign = 'right'; g.fillText(d === 0 ? '0' : Math.abs(d) + (d > 0 ? 'E' : 'W'), padL - 5 * s, Y(d)); }
    }
    g.textAlign = 'center';
    for (let c = 0; c <= 360; c += 45) {
      g.beginPath(); g.moveTo(X(c), padT); g.lineTo(X(c), padT + ph); g.stroke();
      if (c % 90 === 0) g.fillText(String(c).padStart(3, '0'), X(c), h - padB / 2);
    }
    g.strokeStyle = css('--muted'); g.lineWidth = 1.5 * s;
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(360), Y(0)); g.stroke();

    g.strokeStyle = css('--curve'); g.lineWidth = 3 * s; g.beginPath();
    for (let c = 0; c <= 360; c++) { const x = X(c), y = Y(o.fit.dev(c)); c ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();

    (o.sets || []).forEach(S => {
      g.fillStyle = css(S.color || '--pt');
      const r = (S.size || 5) * s;
      S.pts.forEach(([c, d]) => {
        (c === 0 ? [0, 360] : [c]).forEach(cc => {
          const x = X(cc), y = Y(d);
          g.beginPath();
          if (S.shape === 'tri-r')      { g.moveTo(x - r, y - r); g.lineTo(x + r, y); g.lineTo(x - r, y + r); g.closePath(); }
          else if (S.shape === 'tri-l') { g.moveTo(x + r, y - r); g.lineTo(x - r, y); g.lineTo(x + r, y + r); g.closePath(); }
          else                          { g.arc(x, y, r, 0, Math.PI * 2); }
          g.fill();
        });
      });
    });

    if (o.cursor != null) {
      const x = X(o.cursor), y = Y(o.fit.dev(o.cursor));
      g.strokeStyle = accent(); g.lineWidth = 2 * s; g.setLineDash([6 * s, 4 * s]);
      g.beginPath(); g.moveTo(x, padT); g.lineTo(x, padT + ph); g.stroke(); g.setLineDash([]);
      g.fillStyle = accent(); g.beginPath(); g.arc(x, y, 7 * s, 0, Math.PI * 2); g.fill();
    }
  }

  /* ---------- Hold-to-confirm: the fill grows while pressed, letting go cancels ---------- */
  function hold(el, ms, done, shouldHold) {
    let raf = null, t0 = 0, fired = false;
    const active = () => !shouldHold || shouldHold();
    const set = p => el.style.setProperty('--p', p);
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms); set(p);
      if (p >= 1) { fired = true; raf = null; el.classList.remove('holding'); done(); } else raf = requestAnimationFrame(tick);
    };
    el.classList.add('hold');
    el.addEventListener('pointerdown', e => {
      if (!active()) return;
      e.preventDefault(); fired = false; t0 = performance.now();
      el.classList.add('holding');
      raf = requestAnimationFrame(tick);
    });
    const cancel = () => {
      el.classList.remove('holding');
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (!fired) set(0);
    };
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.addEventListener(t, cancel));
    el.addEventListener('click', e => { if (active()) e.preventDefault(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* ---------- Measurement screen, shared by the "measure" and "measure-complete" states ---------- */
  function measure(opts) {
    const p = params(), remeasure = p.remeasure !== null, complete = !!(opts && opts.complete) || remeasure;
    const n = p.n, step = 360 / n;
    const dir = p.round === 2 ? (p.dir === 'stbd' ? 'port' : 'stbd') : p.dir;
    const sign = dir === 'stbd' ? 1 : -1;
    const steer = k => norm(p.start + sign * k * step);
    const headings = Array.from({ length: n }, (_, i) => steer(i));
    let ref = p.ref, vr = p.var, k = remeasure ? Math.max(0, headings.indexOf(norm(p.remeasure))) : (complete ? n - 1 : 0);
    let ctrlOpen = raw.get('gnss') === '1', geoTried = false;
    const measured = Array.from({ length: n }, () => complete);
    if (raw.get('gnss') === '1' || raw.get('meas') === '1') measured[k] = true;
    const F = SAMPLE.fit;
    const defCog = i => norm(steer(i) + (ref === 'T' ? vr : 0));
    const vals = Array.from({ length: n }, (_, i) =>
      complete ? Math.round(norm(steer(i) + F.dev(steer(i)) + (ref === 'T' ? vr : 0))) : defCog(i));
    const syncUnmeasured = () => {
      for (let i = 0; i < n; i++) if (!measured[i]) vals[i] = defCog(i);
    };
    const fmtSigned = d => {
      const r = Math.round(d);
      return r === 0 ? '0°' : (r > 0 ? '+' : '−') + Math.abs(r) + '°';
    };
    const calcDev = idx => {
      const mc = ref === 'T' ? vals[idx] - vr : vals[idx];
      return fmtSigned(((mc - steer(idx) + 540) % 360) - 180);
    };

    const app = $('#app');
    app.className = 'app measure';
    app.innerHTML = `
      <div class="t" id="steerT">
        <div class="k">Steer · compass course</div>
        <div class="v hero-cc" id="steer"></div>
        <div class="gps" id="gps"></div>
      </div>
      <div class="t" id="cogZone">
        <div class="k cog-title">Measure · course over ground</div>
        <div class="cog-mid">
          <div class="cog-side-lbl">COG</div>
          <div class="cog-mag-wrap">
            <div class="cog-mag" id="cogMag">
              <span class="mag-num" id="cogNum"></span><span class="mag-unit" id="cogUnit" title="Tap T/M when measured to toggle GNSS & Variation"></span>
            </div>
            <div class="mag-stem"></div>
          </div>
          <div class="gnss-wrap">
            <div class="dev-amb" id="devAmb">
              <div class="dev-amb-k" id="devAmbKey">VARIATION</div>
              <div class="dev-amb-v" id="devAmbVal"></div>
            </div>
            <div class="gnss-box" id="cogCtrl">
              <div class="gnss-toggle">
                <button class="gnss-seg" id="refM">°M</button>
                <button class="gnss-seg" id="refT">°T</button>
              </div>
              <div class="gnss-var-lbl" id="varLbl">VARIATION</div>
              <div class="gnss-var" id="varChips">
                <button class="var-mini" id="vm">−</button>
                <span class="var-mini-val" id="varVal"></span>
                <button class="var-mini" id="vp">+</button>
              </div>
            </div>
          </div>
        </div>
        <div id="tapeT">
          <button id="minus" aria-label="minus one degree">−</button>
          <canvas id="tape"></canvas>
          <button id="plus" aria-label="plus one degree">+</button>
          <div class="tape-marks" id="tapeMarks" aria-hidden="true">
            <span class="tape-mark cc" id="tmCc">CC</span>
            <span class="tape-mark mc" id="tmMc">MC</span>
            <span class="tape-mark tc" id="tmTc">TC</span>
          </div>
        </div>
      </div>
      <div class="t lights" id="lights"></div>
      <div id="nav">
        <button class="t alt" id="prev">◀ PREV</button>
        <button class="t acc" id="next">NEXT ▶</button>
        <a class="t alt" id="exit"></a>
      </div>`;

    const updateMarks = b => {
      const box = $('#tapeMarks');
      if (!box) return;
      const show = b && (ref === 'T' ? b.visible : b.devVisible);
      if (!show) {
        box.classList.remove('show');
        return;
      }
      const rawMarks = [];
      if (b.pCc.onTape) rawMarks.push({ label: 'CC', x: b.pCc.x, isMc: false });
      if (b.pMc.onTape) rawMarks.push({ label: 'MC', x: b.pMc.x, isMc: true });
      if (ref === 'T' && b.pTc && b.pTc.onTape) rawMarks.push({ label: 'TC', x: b.pTc.x, isMc: false });
      if (!rawMarks.length) {
        box.classList.remove('show');
        return;
      }
      rawMarks.sort((a, c) => a.x - c.x);

      const groups = [];
      rawMarks.forEach(m => {
        const last = groups[groups.length - 1];
        if (last && Math.abs(m.x - last.x) < 4) {
          last.labels.push(m.label);
          last.x = (last.x * (last.labels.length - 1) + m.x) / last.labels.length;
          last.isMc = last.isMc || m.isMc;
        } else {
          groups.push({ labels: [m.label], x: m.x, isMc: m.isMc });
        }
      });

      const minSep = 17;
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 1; i < groups.length; i++) {
          const d = groups[i].x - groups[i - 1].x;
          if (d < minSep) {
            const push = (minSep - d) / 2;
            groups[i - 1].x -= push;
            groups[i].x += push;
          }
        }
      }

      const slots = [$('#tmCc'), $('#tmMc'), $('#tmTc')];
      slots.forEach((el, i) => {
        const g = groups[i];
        if (!g) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.innerHTML = g.labels.map(lbl => `<span class="${lbl === 'MC' ? 'tm-mc' : ''}">${lbl}</span>`).join('');
        el.className = 'tape-mark' + (g.isMc ? ' mc' : '');
        el.style.left = `${g.x}px`;
      });
      box.classList.add('show');
    };

    const tape = Tape(
      $('#tape'),
      () => vals[k],
      v => { vals[k] = v; measured[k] = true; render(); },
      () => ({ cc: steer(k), varDeg: ref === 'T' ? vr : 0, isTrue: ref === 'T' }),
      updateMarks
    );

    function render() {
      const isMeas = measured[k];
      const boxOpen = ctrlOpen;
      const showAmb = !boxOpen && (isMeas || ref === 'T');
      const ambCanOpen = showAmb && !isMeas && ref === 'T';
      $('#steer').innerHTML = `<span class="cc-num">${fmt3(steer(k))}</span><span class="cc-unit">C</span>`;
      $('#cogNum').textContent = fmt3(vals[k]);
      $('#cogUnit').textContent = ref;
      $('#cogMag').classList.toggle('measured', isMeas);
      $('#devAmb').classList.toggle('show', showAmb);
      $('#devAmb').classList.toggle('clickable', ambCanOpen);
      $('#devAmbKey').textContent = isMeas ? 'DEVIATION' : 'VARIATION';
      $('#devAmbVal').textContent = isMeas ? calcDev(k) : fmtSigned(vr);
      $('#cogCtrl').classList.toggle('open', boxOpen);
      $('#cogCtrl').inert = !boxOpen;
      $('#refM').disabled = !boxOpen;
      $('#refT').disabled = !boxOpen;
      $('#refM').classList.toggle('on', ref === 'M');
      $('#refT').classList.toggle('on', ref === 'T');
      $('#varLbl').classList.toggle('show', boxOpen && ref === 'T');
      $('#varChips').classList.toggle('show', boxOpen && ref === 'T');
      $('#vm').disabled = !boxOpen || ref !== 'T';
      $('#vp').disabled = !boxOpen || ref !== 'T';
      $('#varVal').textContent = ref === 'T' ? fmtSigned(vr) : '';
      $('#gps').textContent = localStorage.getItem('deviator.gps') !== '1' ? '' : `GPS ${fmt3(vals[k] + 1)}${ref === 'T' ? 'T' : 'M'} · debug`;
      const isPort = dir === 'port';
      const triPts = !isPort ? '4,3 24,14 4,25' : '24,3 4,14 24,25';
      const triSvg = filled =>
        `<svg viewBox="0 0 28 28" aria-hidden="true"><polygon points="${triPts}" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
      $('#lights').classList.toggle('port', isPort);
      $('#lights').innerHTML = measured.map((v, j) =>
        `<span class="lt ${!isPort ? 's' : 'p'}${v ? ' meas' : ''}${j === k ? ' cur' : ''}" data-j="${j}">${triSvg(v)}</span>`).join('');
      $('#lights').querySelectorAll('[data-j]').forEach(el => el.onclick = () => { k = +el.dataset.j; ctrlOpen = false; render(); });
      $('#nav').classList.toggle('port', isPort);
      $('#prev').textContent = isPort ? 'PREV ▶' : '◀ PREV';
      const all = measured.every(Boolean), ex = $('#exit'), abortMode = !all && !remeasure;
      $('#next').textContent = `TURN ${Math.round(step)}° ` + (isPort ? 'PORT ◀' : 'STARBOARD ▶');
      $('#next').className = 't ' + (isMeas && abortMode ? 'acc' : 'alt');
      ex.textContent = abortMode ? 'ABORT' : 'FINISH';
      ex.className = 't hold ' + (abortMode ? 'alt abort-hold' : 'acc');
      if (abortMode) {
        ex.removeAttribute('href');
        if (!ex.classList.contains('holding')) ex.style.setProperty('--p', +raw.get('abortp') || 0);
      } else {
        ex.style.setProperty('--p', 0);
        ex.href = remeasure ? link('review.html', { ref, var: vr, remeasure: null })
                            : link('finish.html', { ref, var: vr });
      }
      tape.draw();
    }

    /* Clicking or touching anywhere outside #cogCtrl closes it and returns to the DEVIATION number. */
    let closedByOutside = false;
    document.addEventListener('pointerdown', e => {
      closedByOutside = false;
      if (!ctrlOpen) return;
      const box = $('#cogCtrl');
      if (box && box.contains(e.target)) return;
      ctrlOpen = false;
      closedByOutside = true;
      render();
    }, true);

    /* Clicking white #cogMag marks it measured (blue).
       The variation selector opens either by clicking T/M (#cogUnit) on a measured (blue) value
       or by clicking the grey VARIATION readout when it is visible on an unmeasured °T heading. */
    $('#cogMag').onclick = e => {
      if (closedByOutside) {
        closedByOutside = false;
        return;
      }
      if (!measured[k]) {
        measured[k] = true;
        ctrlOpen = false;
        render();
        return;
      }
      if (e.target === $('#cogUnit') || $('#cogUnit').contains(e.target)) {
        ctrlOpen = true;
        render();
      }
    };
    $('#devAmb').onclick = () => {
      if (measured[k] || ref !== 'T' || ctrlOpen) return;
      ctrlOpen = true;
      render();
    };
    $('#refM').onclick = () => { if (!ctrlOpen) return; ref = 'M'; syncUnmeasured(); render(); };
    $('#refT').onclick = () => {
      if (!ctrlOpen) return;
      ref = 'T';
      syncUnmeasured();
      if (!geoTried && vr === 0) {
        geoTried = true;
        detectVariation(v => { vr = v; syncUnmeasured(); render(); });
      }
      render();
    };
    const pulseVar = (btn, delta) => {
      if (!ctrlOpen || ref !== 'T') return;
      vr = Math.max(-30, Math.min(30, vr + delta));
      syncUnmeasured();
      render();
      btn.classList.add('flash');
      clearTimeout(btn._ft);
      btn._ft = setTimeout(() => btn.classList.remove('flash'), 120);
    };
    $('#vm').onclick = () => pulseVar($('#vm'), -1);
    $('#vp').onclick = () => pulseVar($('#vp'), 1);

    $('#prev').onclick = () => { k = (k - 1 + n) % n; ctrlOpen = false; render(); };
    $('#next').onclick = () => { k = (k + 1) % n; ctrlOpen = false; render(); };
    hold($('#exit'), 2000, () => { location.href = 'start.html'; }, () => !measured.every(Boolean) && !remeasure);
    stepper($('#minus'), () => { vals[k] = norm(vals[k] - 1); measured[k] = true; render(); });
    stepper($('#plus'),  () => { vals[k] = norm(vals[k] + 1); measured[k] = true; render(); });
    new ResizeObserver(render).observe(document.body);
    render();
  }

  /* ---------- WMM2025 offline magnetic variation (declination) ---------- */
  const WMM_COEFF = [
    [1,0,-29351.8,0,12.0,0],[1,1,-1410.8,4545.4,9.7,-21.5],
    [2,0,-2556.6,0,-11.6,0],[2,1,2951.1,-3133.6,-5.2,-27.7],[2,2,1649.3,-815.1,-8.0,-12.1],
    [3,0,1361.0,0,-1.3,0],[3,1,-2404.1,-56.6,-4.2,4.8],[3,2,1243.8,237.5,0.4,-0.3],[3,3,453.6,-549.5,-15.6,-4.9],
    [4,0,895.0,0,-1.6,0],[4,1,799.5,278.6,-2.4,-1.1],[4,2,55.7,-133.9,-6.0,4.1],[4,3,-281.4,212.0,5.6,1.6],[4,4,12.1,-375.6,-7.0,-4.4],
    [5,0,-233.2,0,0.6,0],[5,1,368.9,47.7,1.4,-0.5],[5,2,187.2,208.8,0.0,2.2],[5,3,-138.7,-121.3,0.6,0.9],[5,4,-142.0,32.2,2.2,1.7],[5,5,20.9,99.1,0.9,0.5],
    [6,0,64.4,0,-0.2,0],[6,1,63.8,-19.1,-0.4,0.3],[6,2,76.9,25.0,0.9,-1.6],[6,3,-115.7,52.7,1.2,-0.4],[6,4,-40.9,-57.8,-0.9,0.9],[6,5,14.9,10.9,0.3,0.7],[6,6,-60.7,72.7,0.9,0.9]
  ];
  function wmmDeclination(latDeg, lonDeg, date) {
    const dt = ((date instanceof Date ? date.getTime() : Date.now()) / 86400000 / 365.2425 + 1970) - 2025.0;
    const lat = Math.max(-89.9, Math.min(89.9, +latDeg || 0)) * RAD, lon = (+lonDeg || 0) * RAD;
    const a = 6378.137, b = 6356.7523142, r0 = 6371.2;
    const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    const gcLat = Math.atan2(b * b * sinLat, a * a * cosLat);
    const r = Math.sqrt((a * cosLat) ** 2 + (b * sinLat) ** 2);
    const theta = Math.PI / 2 - gcLat, cosT = Math.cos(theta), sinT = Math.max(1e-10, Math.sin(theta));
    const P = Array.from({ length: 7 }, () => new Float64Array(7));
    const dP = Array.from({ length: 7 }, () => new Float64Array(7));
    const S = Array.from({ length: 7 }, () => new Float64Array(7));
    P[0][0] = 1; S[0][0] = 1;
    for (let n = 1; n <= 6; n++) {
      P[n][n] = sinT * P[n - 1][n - 1];
      dP[n][n] = sinT * dP[n - 1][n - 1] + cosT * P[n - 1][n - 1];
      S[n][0] = S[n - 1][0] * (2 * n - 1) / n;
      for (let m = 0; m < n; m++) {
        const k = n === 1 ? 0 : ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3));
        P[n][m] = cosT * P[n - 1][m] - k * (n >= 2 ? P[n - 2][m] : 0);
        dP[n][m] = cosT * dP[n - 1][m] - sinT * P[n - 1][m] - k * (n >= 2 ? dP[n - 2][m] : 0);
      }
      for (let m = 1; m <= n; m++) S[n][m] = S[n][m - 1] * Math.sqrt((n - m + 1) * (m === 1 ? 2 : 1) / (n + m));
    }
    let Xc = 0, Y = 0, Zc = 0;
    for (const [n, m, g0, h0, dg, dh] of WMM_COEFF) {
      const g = (g0 + dg * dt) * S[n][m], h = (h0 + dh * dt) * S[n][m];
      const ratio = (r0 / r) ** (n + 2), cosM = Math.cos(m * lon), sinM = Math.sin(m * lon), gm = g * cosM + h * sinM;
      Xc += ratio * gm * dP[n][m];
      Y  += ratio * m * (g * sinM - h * cosM) * P[n][m] / sinT;
      Zc -= (n + 1) * ratio * gm * P[n][m];
    }
    const psi = gcLat - lat, X = Xc * Math.cos(psi) - Zc * Math.sin(psi);
    return Math.atan2(Y, X) / RAD;
  }
  function detectVariation(cb, timeoutMs) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { cb(0, null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords, ex = wmmDeclination(latitude, longitude);
        cb(Math.max(-30, Math.min(30, Math.round(ex))), { lat: latitude, lon: longitude, exact: ex });
      },
      () => cb(0, null),
      { enableHighAccuracy: false, maximumAge: 86400000, timeout: timeoutMs || 4000 }
    );
  }

  window.Mock = { RAD, norm, fmt3, fmtDev, fmtUse, $, css, accent, params, link, here, SAMPLE, sample, fit, prep, Tape, stepper, drawCurve, hold, measure, applyTheme, wmmDeclination, detectVariation };
})();
