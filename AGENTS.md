> [!NOTE]
> Make sure to read [GEMINI.md](GEMINI.md) (for non-Gemini/Antigravity agents).

# Deviator — Engineering & Agent Guide (How?)

> **Documentation Map**: [GEMINI.md](GEMINI.md) · **Why?** [SPEC.md](SPEC.md) · **What?** [README.md](README.md) · **How?** [AGENTS.md](AGENTS.md)

This document defines **how** Deviator is architected, implemented, and verified. Follow these invariants whenever modifying mocks in [`WIP/mock/`](WIP/mock/index.html) or building the production PWA in `docs/`.

---

## 1. Mathematical Spec

### 1.1 Conventions & Normalization
- All headings and courses are normalized to $[0^\circ, 360^\circ)$ via `norm(d) = ((d % 360) + 360) % 360` and formatted as 3-digit tabular numerals (`000°`–`359°`).
- **East is positive (`+`)**, **West is negative (`−`)** for both Magnetic Variation ($V$) and Compass Deviation ($\delta$).
- Fundamental relationship (**C**ompass $\leftrightarrow$ **M**agnetic $\leftrightarrow$ **T**rue):
  $$MC = CC + \delta(CC), \qquad TC = MC + V$$
- During Mode A measurement on steered compass course $CC_i$ with chartplotter reading $COG_i$:
  $$MC_i = \begin{cases} COG_i - V & \text{if reference is TRUE} \\ COG_i & \text{if reference is MAGNETIC} \end{cases}$$
  $$\delta_i = \operatorname{wrap}_{[-180^\circ, +180^\circ)}(MC_i - CC_i)$$

### 1.2 5-Coefficient Harmonic Fit
Given $n \in \{4, 6, 8, 10, 12\}$ evenly spaced compass headings $H_i = i \cdot \frac{360^\circ}{n}$ and consolidated deviations $d_i$ (in degrees):
$$\delta(c) = A + B\sin c + C\cos c + D\sin 2c + E\cos 2c$$
By discrete Fourier orthogonality over evenly spaced points:
- $A = \frac{1}{n}\sum_{i=0}^{n-1} d_i$
- $B = \frac{2}{n}\sum_{i=0}^{n-1} d_i \sin H_i, \qquad C = \frac{2}{n}\sum_{i=0}^{n-1} d_i \cos H_i$
- $D = \begin{cases} 0 & \text{if } n = 4 \\ \frac{2}{n}\sum_{i=0}^{n-1} d_i \sin(2H_i) & \text{if } n \ge 6 \end{cases}$
- $E = \begin{cases} \frac{1}{n}\sum_{i=0}^{n-1} d_i \cos(2H_i) & \text{if } n = 4 \text{ (Nyquist frequency: } \sum \cos^2 2H_i = n\text{)} \\ \frac{2}{n}\sum_{i=0}^{n-1} d_i \cos(2H_i) & \text{if } n \ge 6 \end{cases}$

### 1.3 Course Conversion ($CC \leftrightarrow MC$)
- **Forward ($CC \to MC$)**: `toMC(cc) = norm(cc + dev(cc))`
- **Inverse ($MC \to CC$)**: Fixed-point iteration converges to machine precision within 10 steps for all realistic deviation magnitudes ($|\delta| < 30^\circ$):
  ```js
  const toCC = mc => { let c = mc; for (let i = 0; i < 10; i++) c = mc - dev(c); return norm(c); };
  ```

---

## 2. UI & Interaction Invariants

1. **Tile Grid Layout**:
   - Full-viewport CSS Grid (`height: 100dvh`, `overflow: hidden` on active workflow screens, `gap: 3px` on `--gut` background).
   - Responsive breakpoint at `@media (min-aspect-ratio: 5/4)` switching cleanly between portrait (phone) and landscape/tablet layouts.
   - Hero numerals use CSS container queries (`container-type: inline-size` + `font-size: clamp(56px, min(38cqw, 28vmin), 260px)`) so 3-digit degree values never clip or wrap.
2. **Heading Tape & Steppers**:
   - **Drag only, zero momentum, plain tap is a no-op**: Pointer capture tracks horizontal drag distance (`14px` scaled per degree).
   - Paired with large `−` and `+` buttons (`1 tap = ±1°`, press-and-hold repeats every `90ms` after a `450ms` delay).
3. **Visited Lights & Directional Shapes**:
   - Starboard round (`dir === 'stbd'`): green (`--stbd`) right-pointing triangles (`▶` visited, `▷` unvisited).
   - Port round (`dir === 'port'`): red (`--port`) left-pointing triangles (`◀` visited, `◁` unvisited).
   - Active heading is framed with a `2px` border (`.lt.cur`); tapping any indicator light jumps directly to that heading.
   - The right-hand navigation tile reads `ABORT` until all $n$ headings in the active round are visited (`visited.every(Boolean)`), at which point it transforms into `FINISH` (accent tile).
4. **Destructive Action Confirmation (`confirm.html`)**:
   - Never use `window.confirm()` or small popups.
   - Always route destructive actions (`ABORT`, `DELETE`, `ERASE ALL DATA`) to the full-screen confirmation state.
   - The **safe option** is the largest accent tile at the bottom; the **danger tile** sits above it (never overlapping the triggering button's screen coordinates) and requires a continuous `2000ms` pointer hold (`requestAnimationFrame` progress bar `--p: 0..1`) that resets immediately on release/cancel.
5. **System Back Button & Persistence**:
   - Production app traps `popstate` via `history.pushState` so Android/iOS edge-back gestures do nothing.
   - Every state transition and measurement change persists immediately to `localStorage` so reloading or reopening the PWA resumes at the exact workflow step.
6. **External Favicon**:
   - Link directly to `<link rel="icon" type="image/svg+xml" href="https://navigart.net/logo.svg">` (do not download a local copy unless explicitly requested).

---

## 3. Data & URL-Hash Sharing Format

### `localStorage` Keys
- `deviator.theme`: `'light' | 'night' | 'auto'` (default `'auto'`)
- `deviator.gps`: `'0' | '1'` (default `'0'`, debug device GPS cross-check)
- `deviator.active`: JSON of in-progress measurement session (or `null` when idle)
- `deviator.tables`: JSON array of saved, immutable boat tables:
  ```json
  {
    "id": "2026-10-09-kittiwake-1",
    "boat": "Kittiwake",
    "date": "2026-10-09",
    "n": 8,
    "ref": "T",
    "var": 4,
    "dev": [-1.5, 2.0, 4.5, 3.0, 0.5, -2.5, -4.0, -3.5]
  }
  ```

### Share URL Hash Format
- `https://deviator.navigart.net/#t=v1&b=<boat>&d=<YYYY-MM-DD>&n=<4|6|8|10|12>&ref=<T|M>&var=<deg>&dev=<d0,d1,...>`

---

## 4. Working with the Mocks & Automated Verification

- **Mock Rules**: Keep exactly one HTML file per flow state in [`WIP/mock/`](WIP/mock/index.html) (`start.html`, `setup.html`, `measure.html`, `measure-complete.html`, `finish.html`, `confirm.html`, `review.html`, `review-heading.html`, `save.html`, `deviation-table.html`, `saved.html`, `settings.html`). Never create versioned duplicates (`v1`, `v2`).
- **Local Server**:
  ```powershell
  npx --yes http-server WIP/mock -p 8080 -c-1 --silent
  ```
- **Browser Verification**:
  Verify all 12 flow states across phone portrait (`390×844`), phone landscape (`844×390`), and tablet (`1024×768`) in both Light and Night modes, checking that `scrollWidth <= innerWidth`, `scrollHeight <= innerHeight`, and zero console/page errors occur.
