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

### 1.3 Course Conversion ($CC \leftrightarrow MC \leftrightarrow TC$)
- **Forward ($CC \to MC$)**: `toMC(cc) = norm(cc + dev(cc))`
- **Inverse ($MC \to CC$)**: Fixed-point iteration converges to machine precision within 10 steps for all realistic deviation magnitudes ($|\delta| < 30^\circ$):
  ```js
  const toCC = mc => { let c = mc; for (let i = 0; i < 10; i++) c = mc - dev(c); return norm(c); };
  ```
- **True Course & Compass Error (Conversion Time)**:
  Using user-supplied current variation $V_{\text{current}}$ (never stored on the saved table):
  $$\text{Compass Error}(CC) = V_{\text{current}} + \delta(CC), \qquad TC = norm(MC + V_{\text{current}}) = norm(CC + \text{Compass Error}(CC))$$

### 1.4 Offline WMM2025 Magnetic Variation (`src/wmm.js`)
- Degree-6 World Magnetic Model (WMM2025, epoch `2025.0`, Schmidt semi-normalized Gauss coefficients $g_n^m, h_n^m$ and secular variation $\dot{g}_n^m, \dot{h}_n^m$) evaluates magnetic declination at `(lat, lon, date)` in `< 2.5 KB` with `< 0.1°` accuracy across navigable latitudes.
- When the user selects `TRUE` reference on Setup and variation has not been manually edited, `detectVariation()` requests `navigator.geolocation.getCurrentPosition` (`timeout: 4000ms`), rounds the computed declination to the nearest integer degree in $[-30^\circ, +30^\circ]$, and falls back to `0°` on error or permission denial.

---

## 2. UI & Interaction Invariants

1. **Strictly Vertical Portrait Layout & Desktop/Embed Constraint**:
   - Every screen uses a single top-to-bottom vertical CSS Grid (`grid-template-columns: 1fr`, `height: 100dvh`, `overflow: hidden` on active workflow screens, `gap: 3px` on `--gut` background).
   - `.app` is constrained to a portrait column (`width: min(100vw, 480px, 62dvh); height: 100dvh; margin: 0 auto; container-type: size;`) and sized exclusively with container query units (`cqmin`, `cqw`, `cqh`) so typography and controls scale from `.app`'s own box on phones, 4K desktop monitors, `<iframe>` embeds, and Web Components.
   - Portrait orientation is locked via `manifest.json` (`"orientation": "portrait-primary"`) and `screen.orientation.lock('portrait-primary')`. If a small mobile screen (`@media (orientation: landscape) and (max-height: 540px)`) ignores the lock, `.tilt-guard` displays a full-screen prompt to rotate upright.
   - Hero numerals are sized with `cqw`/`cqh` from `.app` (never nest `container-type: inline-size` on grid children that also use `cqh`, and always set `contain: size` on `<canvas>` elements so HiDPI `cv.width = w * dpr` buffer scaling never feeds back into CSS Flex/Grid intrinsic track widths).
   - Use Golden Ratio ($\varphi = 1.618$) proportions when dividing rows, gaps, or internal component geometry.
2. **Heading Tape, Discrete Slider & Steppers**:
   - **Setup Discrete Starting-Heading Slider (`.dslider`)**: Single-line rail with a physical sliding thumb (`.dthumb`) that tracks horizontal pointer drag 1:1 and snaps to the $n \in \{6, 8, 12\}$ evenly spaced headings. Vertical internal split uses Golden Ratio powers ($\varphi^{-2} = 38.2\%$ from top to number center, $\varphi^{-2} = 38.2\%$ from number center to ruler line at $76.4\%$, and $\varphi^{-3} = 23.6\%$ below the ruler line) so unselected numbers have strictly equal space above and below. When switching from higher precision to lower precision, `snapHeading(cur, H)` rounds the current starting heading to the nearest available heading in `H` (breaking equal-distance ties downward in the first half $< 180^\circ$ and upward in the second half $\ge 180^\circ$).
   - **Setup & Inline Variation Steppers (`#vm`, `#vp`)**: When variation is positive (`+E`), the `+` button renders in the selected (`.on`) state and flashes unselected (`.flash` / `:active`) while tapped; when negative (`−W`), the `−` button renders `.on` and flashes unselected while tapped; when `0°`, both buttons render unselected.
   - **Measurement COG Instrument (`#cogZone`) & Cylindrical Barrel Tape (`Tape`)**:
     - **Physics-like 1:1 cylindrical barrel drag, zero momentum, plain tap is a no-op**: Pointer capture tracks continuous floating-point degrees (`vFloat`, `ppd` scaled to fit cleanly) with $\sin\theta$ cylindrical tick projection, edge alpha falloff, upper grip ticks, a lower lubber line that stops below the `10°` numbers (`h * 0.50`), and smooth spring-snap to the integer degree on pointer release. On `measure.html`, `Tape` draws the deviation band between `CC` (`steer(k)`) and `MC` (`vFloat` in `°M`, `vFloat - vr` in `°T`) in translucent accent color, plus a muted variation band between `MC` and `TC` (`vFloat`) in `°T`, and positions zero-layout-impact boundary labels below `#tapeT` (`CC` and `MC` in `°M` when deviation $\ne 0$; `CC`, `MC`, and `TC` in `°T`, stacking coincident marks vertically on separate lines under one centered tick). Paired with pronounced `−` and `+` buttons (`1 tap = ±1°`, press-and-hold repeats every `90ms` after a `450ms` delay).
     - **Symmetrical 3-Column `.cog-mid` Row (`COG` | `000°M`/`000°T` | Right Slot)**:
       - Uses the exact same 3-column tracks (`--side-w`, `minmax(0, 1fr)`, `--side-w`) and vertical instrument height (`--inst-h`) as `#tapeT` below it so `#cogMag` aligns pixel-for-pixel in width and height with the tape bar, and `#cogCtrl` right-aligns with the `+` button.
       - Center magnifier (`#cogMag`) has a `2px solid var(--fg)` hairline frame matching `#cogCtrl`/`#tapeT` and fixed unit column (`grid-template-columns: auto .65em`) so switching `M` $\leftrightarrow$ `T` never shifts `000°` or any surrounding element.
       - Starts white (unmeasured). Changing COG via `−`/`+`/tape drag or clicking the white `#cogMag` box marks `measured[k] = true` (turns `#cogMag` blue permanently for that heading, even if returned to the default value).
       - Right slot shows ambient dark-grey **`VARIATION`** (`+4°`, `−3°`, `0°`) when unmeasured in `°T` (empty in `°M`); switches to ambient dark-grey **`DEVIATION`** (`0°`, `+4°`, `−3°`) once measured; and opens the hairline inline variation editor (`°M`/`°T` segmented toggle pinned at the top edge in both modes, **`VARIATION`** label + `−`/`+` variation bar below shown only when `°T` is selected) either when clicking the visible **`VARIATION`** readout (unmeasured `°T`) or when clicking `T`/`M` (`#cogUnit`) on an already-measured (blue) value. Clicking or touching anywhere outside `#cogCtrl` immediately closes it and restores the ambient slot (`VARIATION` if unmeasured `°T`, hidden if unmeasured `°M`, or `DEVIATION` if measured).
3. **Progress Lights & Directional Shapes (`#lights`) & Navigation (`#nav`)**:
   - Starboard round (`dir === 'stbd'`): right-pointing SVG triangles filling **left-to-right** (`j = 0 .. n-1`), paired with `[ ◀ PREV | TURN <step>° STARBOARD ▶ | ABORT/FINISH ]`.
   - Port round (`dir === 'port'`): left-pointing SVG triangles filling **right-to-left** (`#lights.port { flex-direction: row-reverse; }`, `j = 0` at far right advancing left), paired with swapped navigation `[ ABORT/FINISH | TURN <step>° PORT ◀ | PREV ▶ ]` (`#nav.port`).
   - Unmeasured headings (`!measured[j]`): **empty outline triangle** in `--muted` grey (never green/red before measurement). Measured headings (`measured[j]`): **full solid triangle** in green (`--stbd`) or red (`--port`).
   - All triangles are scaled larger (`clamp(19px, 5.2cqw, 26px)`), with **no square frame** on the active heading; instead, the active heading's triangle (`.lt.cur`) is displayed **even bigger** (`clamp(29px, 8cqw, 40px)`). Tapping any indicator light jumps directly to that heading.
   - `#next` (`TURN <step>° STARBOARD ▶` / `TURN <step>° PORT ◀`) renders **grey** (`.t.alt`, still clickable) when the current heading has not been measured yet, turns **accent** (`.t.acc`) once the current heading is measured while headings remain (`abortMode`), and returns to **grey** (`.t.alt`) once all headings are measured (or in `remeasure` mode) so only `FINISH` renders **accent**.
   - The abort/finish navigation tile (`#exit`, right in Starboard, left in Port) reads `ABORT` until all $n$ headings in the active round are measured (`measured.every(Boolean)`), at which point it transforms into `FINISH` (accent tile, single tap → `review.html`). In `ABORT` mode, a quick tap is a no-op; holding for `1200ms` (`Mock.HOLD_MS`) sweeps a reddish overlay (`rgba(225,75,40,.46)` in Light / `rgba(245,58,74,.38)` in Night, distinct from `--port`) across `#exit` and navigates directly to `start.html` (or `review.html` during re-measurement) on completion.
4. **Uniform Inline Hold-to-Confirm (`HOLD_MS = 1200ms`)**:
   - Never use `window.confirm()`, small modal popups, or a separate confirmation page (`confirm.html` removed).
   - Every destructive or reset action (`ABORT` on `measure.html`/`review.html`, `#rePort`/`#reStbd` on `review.html`, `.del` `DELETE` on `saved.html`, and `#erase` `ERASE ALL DATA` on `settings.html`) binds `hold(el, HOLD_MS, ...)` with a live `requestAnimationFrame` progress bar (`--p: 0..1`) that resets immediately on release/cancel.
5. **System Back Button, Persistence & Disabled Browser/OS Misc Interactions**:
   - Production app traps `popstate` via `history.pushState` so Android/iOS edge-back gestures do nothing.
   - Every state transition and measurement change persists immediately to `localStorage` so reloading or reopening the PWA resumes at the exact workflow step.
   - Globally disable all miscellaneous browser interactions across the app: prevent `contextmenu` (right-click / long-press menu), `selectstart` / text selection (`user-select: none`, except inside `<input>`), `dragstart` (`-webkit-user-drag: none`), `-webkit-touch-callout: none`, `-webkit-tap-highlight-color: transparent`, and `overscroll-behavior: none`.
6. **External Favicon**:
   - Link directly to `<link rel="icon" type="image/svg+xml" href="https://navigart.net/logo.svg">` (do not download a local copy unless explicitly requested).

---

## 3. Data & URL-Hash Sharing Format

### `localStorage` Keys
- `deviator.theme`: `'light' | 'night' | 'auto'` (default `'auto'`)
- `deviator.gps`: `'0' | '1'` (default `'0'`, debug device GPS cross-check)
- `deviator.active`: JSON of in-progress measurement session (or `null` when idle)
- `deviator.tables`: JSON array of saved tables (starts `[]`; pure `0.5°`-precision compass deviation only so harmonic fit & converter reproduce the exact Review curve bit-for-bit, formatted as symmetric integers in UI tables via `fmtDev`; timestamps stored internally in shortest ISO-8601 UTC `YYYY-MM-DDTHH:MM:SSZ`; default `title` is `""` and displays the local-time conversion of `createdAt` without duplicating it in metadata, moving the local time into the subtitle once the user sets a non-empty `title`; no measurement `ref` or `var` is ever persisted):
  ```json
  {
    "id": "2026-11-17-mi3a1b",
    "title": "",
    "createdAt": "2026-11-17T21:15:08Z",
    "n": 8,
    "dev": [-1.5, 2, 4, 3, -0.5, -3, -3.5, -3]
  }
  ```

### Share URL Hash Format
- `https://deviator.navigart.net/#t=v1&title=<title>&d=<YYYY-MM-DD>&n=<6|8|12>&dev=<d0,d1,...>`

---

## 4. Working with the Mocks & Automated Verification

- **Mock Rules**: Keep exactly one HTML file per flow state in [`WIP/mock/`](WIP/mock/index.html) (`start.html`, `setup.html`, `measure.html`, `review.html`, `deviation-table.html`, `saved.html`, `settings.html`). Never create versioned duplicates (`v1`, `v2`).
- **Local Server**:
  ```powershell
  npx --yes http-server WIP/mock -p 8080 -c-1 --silent
  ```
- **Browser Verification**:
  Verify all 7 flow states across phone portrait (`390×844`), phone landscape (`844×390`), and tablet (`1024×768`) in both Light and Night modes, checking that `scrollWidth <= innerWidth`, `scrollHeight <= innerHeight`, and zero console/page errors occur. (When capturing headless Chromium screenshots on Windows, pass `--force-device-scale-factor=1 --window-size=540,860` because Windows enforces a `504px` minimum outer window width.)
- **Current Page-by-Page Review Progress**:
  - **Page 1 (`start.html`)**: Completed & signed off (starts empty with zero saved tables; `Open saved` appears once a table is saved).
  - **Page 2 (`setup.html`)**: Completed & signed off.
  - **Page 3 (`measure.html`)**: Completed & signed off (`measure-complete.html` removed; `measure.html?complete=1` covers the all-measured `FINISH` state, which now navigates directly to `review.html`).
  - **Page 4 (`review.html`, merged with `finish.html` & single-heading remeasure)**: Completed & signed off (`SAVE TO DEVIATION TABLES` auto-saves as shortest ISO-8601 UTC `YYYY-MM-DDTHH:MM:SSZ` directly into `localStorage` and opens `deviation-table.html`).
  - **Page 5 (`confirm.html`) & Page 6 (`save.html`)**: Removed (`confirm.html` replaced by `1200ms` inline `hold()`; `save.html` replaced by instant UTC timestamp auto-save + inline `saved.html` rename).
  - **In Review (`deviation-table.html`, `saved.html`)**:
    - `deviation-table.html`: Redesigned with header title/timestamp strip (`+TZ ↔ Z` toggle + inline `RENAME` drawer), borderless interactive curve chart (`8`-wind roses + click/drag sync + curve pill), clickable deviation grid, 3-way `COMPASS °C | MAGNETIC °M | TRUE °T` segmented selector, `measure.html`-matched 3-column magnifier + barrel tape (`CC↔MC` blue deviation band, `MC↔TC` variation band, stacked `CC/MC/TC` marks, inline `VARIATION ±30°` + `WMM2025 AUTO`), and 3-tile outputs (`Magnetic`/`Steer Compass`, `True`/`Magnetic`, `Dev · Error`).
    - `saved.html`: Redesigned with free-form `title` (default `""`, displaying local `+TZ` converted from stored UTC `Z` with click-to-toggle `Z`), inline `RENAME` + compass-type examples, and `1200ms` hold `DELETE`.
    - Remaining: `settings.html`.
- **TODO (Run After All Pages Are Signed Off)**:
  - Holistic end-of-pass review across the full `start → setup → measure ↔ review → deviation-table → saved → settings` flow: verify consistency between `review.html` and the rest of the measurement/table flow, audit Back/return paths on every screen (`setup.html`, `saved.html`, `settings.html`, `deviation-table.html`), and run full responsive & Light/Night verification across all 7 pages.
- **Later `v2` / Production PWA Tasks (`docs/`)**:
  - Define GitHub Pages `404.html` and offline/error fallback screens tailored to static hosting (`deviator.navigart.net`).
  - Design share URL structure, rich link previews in messaging apps (since URL `#hash` fragments aren't seen by server scrapers / static meta tags), and mobile offline installed PWA schema registration (`manifest.json` `protocol_handlers`, deep links / `start_url` handling when offline).
