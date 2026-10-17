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

  /* ---------- Theme (light / night / auto) ---------- */
  function applyTheme() {
    const pref = localStorage.getItem('deviator.theme') || 'auto';
    const night = pref === 'night' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('night', night);
  }
  applyTheme();

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

  /* ---------- Heading tape: drag only, no momentum, taps do nothing ---------- */
  function Tape(cv, get, set) {
    let ppd = 14, drag = null;
    function draw() {
      const [g, w, h] = prep(cv), mid = w / 2, v = get();
      const s = Math.max(1, h / 70); ppd = 14 * s;
      g.strokeStyle = css('--fg'); g.fillStyle = css('--fg');
      g.font = `600 ${Math.round(14 * s)}px "Segoe UI", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
      const span = Math.ceil(mid / ppd) + 1;
      for (let k = -span; k <= span; k++) {
        const deg = norm(v + k), x = mid + k * ppd;
        const len = deg % 10 === 0 ? h * 0.42 : deg % 5 === 0 ? h * 0.3 : h * 0.16;
        g.lineWidth = (deg % 5 === 0 ? 2 : 1) * s;
        g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - len); g.stroke();
        if (deg % 10 === 0) g.fillText(String(deg).padStart(3, '0'), x, 13 * s);
      }
      g.fillStyle = accent(); g.strokeStyle = accent(); g.lineWidth = 3 * s;
      g.beginPath(); g.moveTo(mid, h); g.lineTo(mid, 32 * s); g.stroke();
      g.beginPath(); g.moveTo(mid - 8 * s, 0); g.lineTo(mid + 8 * s, 0); g.lineTo(mid, 12 * s); g.closePath(); g.fill();
    }
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, v: get() }; });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const nv = norm(drag.v + Math.round((drag.x - e.clientX) / ppd));
      if (nv !== get()) set(nv);
    });
    ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => drag = null));
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
  function hold(el, ms, done) {
    let raf = null, t0 = 0, fired = false;
    const set = p => el.style.setProperty('--p', p);
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms); set(p);
      if (p >= 1) { fired = true; raf = null; done(); } else raf = requestAnimationFrame(tick);
    };
    el.classList.add('hold');
    el.addEventListener('pointerdown', e => { e.preventDefault(); fired = false; t0 = performance.now(); raf = requestAnimationFrame(tick); });
    const cancel = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } if (!fired) set(0); };
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => el.addEventListener(t, cancel));
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
    const visited = Array.from({ length: n }, () => complete);
    if (!complete) visited[k] = true;
    const F = SAMPLE.fit;
    const vals = Array.from({ length: n }, (_, i) =>
      complete ? Math.round(norm(steer(i) + F.dev(steer(i)) + (ref === 'T' ? vr : 0))) : steer(i));

    const app = $('#app');
    app.className = 'app measure';
    app.innerHTML = `
      <div class="t cq" id="steerT">
        <div class="k">Steer compass course</div>
        <div class="v hero" id="steer"></div>
        <div class="sub" id="roundTxt"></div>
        <a class="gear" id="gear" title="Settings">⚙</a>
        <div class="gps" id="gps"></div>
      </div>
      <div id="tapeT">
        <button id="minus" aria-label="minus one degree">−</button>
        <canvas id="tape"></canvas>
        <button id="plus" aria-label="plus one degree">+</button>
      </div>
      <div id="cogrow">
        <div class="t cq"><div class="k">COG from chartplotter</div><div class="v hero" id="cog"></div></div>
        <div id="side">
          <button class="t alt" id="refB"><div class="k">Reference</div><div class="v md" id="ref"></div></button>
          <button class="t alt" id="varB"><div class="k">Variation</div><div class="v md" id="vr"></div></button>
        </div>
      </div>
      <div class="t lights" id="lights"></div>
      <div id="nav">
        <button class="t alt" id="prev">◀ PREV</button>
        <button class="t acc" id="next">NEXT ▶</button>
        <a class="t alt" id="exit"></a>
      </div>`;

    const tape = Tape($('#tape'), () => vals[k], v => { vals[k] = v; render(); });
    $('#roundTxt').textContent = `${remeasure ? 'RE-MEASURE · ' : ''}ROUND ${p.round} · TURNING ${dir === 'stbd' ? 'STARBOARD ▶' : 'PORT ◀'}`;

    function render() {
      $('#steer').textContent = fmt3(steer(k));
      $('#cog').textContent = fmt3(vals[k]);
      $('#ref').textContent = ref === 'T' ? 'TRUE' : 'MAG';
      $('#vr').textContent = fmtDev(vr);
      $('#varB').style.display = ref === 'T' ? '' : 'none';
      $('#gear').href = link('settings.html', { ref, var: vr, from: here() });
      $('#gps').textContent = localStorage.getItem('deviator.gps') !== '1' ? '' : `GPS ${fmt3(vals[k] + 1)}${ref === 'T' ? 'T' : 'M'} · debug`;
      $('#lights').innerHTML = visited.map((v, j) =>
        `<span class="lt ${dir === 'stbd' ? 's' : 'p'}${j === k ? ' cur' : ''}" data-j="${j}" style="cursor:pointer">${dir === 'stbd' ? (v ? '▶' : '▷') : (v ? '◀' : '◁')}</span>`).join('');
      $('#lights').querySelectorAll('[data-j]').forEach(el => el.onclick = () => { k = +el.dataset.j; visited[k] = true; render(); });
      const all = visited.every(Boolean), ex = $('#exit');
      ex.textContent = all ? 'FINISH' : 'ABORT';
      ex.className = 't ' + (all ? 'acc' : 'alt');
      ex.href = remeasure ? link('review.html', { ref, var: vr, remeasure: null })
              : all       ? link('finish.html', { ref, var: vr })
                          : link('confirm.html', { ref, var: vr, what: 'measurement', back: link(here(), { ref, var: vr }), done: 'start.html' });
      tape.draw();
    }
    $('#prev').onclick = () => { k = (k - 1 + n) % n; visited[k] = true; render(); };
    $('#next').onclick = () => { k = (k + 1) % n; visited[k] = true; render(); };
    $('#refB').onclick = () => { ref = ref === 'T' ? 'M' : 'T'; render(); };          // mock: real UI would offer a proper picker
    $('#varB').onclick = () => { vr = vr >= 10 ? -10 : vr + 1; render(); };            // mock: real UI would offer a proper picker
    stepper($('#minus'), () => { vals[k] = norm(vals[k] - 1); render(); });
    stepper($('#plus'),  () => { vals[k] = norm(vals[k] + 1); render(); });
    new ResizeObserver(render).observe(document.body);
    render();
  }

  window.Mock = { RAD, norm, fmt3, fmtDev, fmtUse, $, css, accent, params, link, here, SAMPLE, sample, fit, prep, Tape, stepper, drawCurve, hold, measure, applyTheme };
})();
