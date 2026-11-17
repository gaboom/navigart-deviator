# Deviator — Specification (Why?)

> **Domain**: `deviator.navigart.net`  
> **Documentation Map**: [GEMINI.md](GEMINI.md) · **Why?** [SPEC.md](SPEC.md) · **What?** [README.md](README.md) · **How?** [AGENTS.md](AGENTS.md)

---

## 1. Purpose & Context

**Deviator** is an offline-first Progressive Web App (PWA) for teaching and performing yacht magnetic compass deviation measurements (*"swinging the compass"*) and converting courses between **Compass**, **Magnetic**, and **True**.

### Operational & Pedagogical Environment
- **Coastal Sailing Instruction**: Used during training sessions in calm, low-current waters prior to a longer coastal or offshore passage.
- **Multi-Crew & Multi-Device**: An instructor and rotating student navigation teams run Deviator independently on their own phones or tablets while simultaneously maintaining traditional paper-and-pencil logbook records.
- **Real On-Board Utility**: Once approved by the instructor and saved, the resulting deviation table serves as the yacht's live reference card and course converter for the voyage.

---

## 2. Core Product Decisions & Rationale

### 2.1 Mode A Only: Steer Compass, Read Chartplotter COG
- **Why**: In real yacht practice, the helmsman holds a steady **Compass Course ($CC$)** on the steering binnacle while the navigator reads the settled **Course Over Ground ($COG$)** from the boat's fixed chartplotter (in slack water with negligible leeway).
- **Why Device GPS is Excluded from Measurement**: Letting the phone's internal GPS auto-fill or suggest $COG$ short-circuits the student's responsibility to read the vessel's instruments, verify steady-heading settling, and understand magnetic vs. true reference settings.
  - Device GPS may **only** appear as a faint, low-opacity debug cross-check (`GPS 046°T · debug`) when explicitly enabled in Settings.

### 2.2 Precision & 5-Coefficient Harmonic Model
- **Why `6x, 8x, 12x` Headings (Default `8x`)**:
  Magnetic deviation on a vessel follows the classic 5-term Fourier harmonic expansion:
  $$\delta(c) = A + B\sin c + C\cos c + D\sin 2c + E\cos 2c$$
  - **`8x` (Every $45^\circ$, default)**: The maritime standard. Over-determines the 5 coefficients with 3 degrees of freedom so a single bad reading visibly stands out from the smooth curve.
  - **`6x` (Every $60^\circ$)**: Faster swing with 1 degree of freedom above the 5-parameter fit.
  - **`12x` (Every $30^\circ$)**: High angular resolution (7 degrees of freedom) for thorough calibration and training exercises.
- **Offline WMM2025 Magnetic Variation Auto-Default**:
  - Most yachts configure their chartplotter to display `MAGNETIC` course over ground (so variation is not needed during the swing, and `MAGNETIC` is the default selection). While `MAGNETIC` is selected, `VARIATION` remains strictly disabled—tapping variation controls never implicitly switches the reference to `TRUE`, because the navigator must consciously know which reference their chartplotter is sailing on.
  - When the crew explicitly switches Chartplotter reference to `TRUE`, the app defaults Variation to `0°` and requests a one-shot device position (`navigator.geolocation.getCurrentPosition`). If granted, it evaluates the embedded degree-6 **World Magnetic Model (WMM2025)** spherical harmonics (`src/wmm.js`, `< 2.5 KB`, offline) to pre-fill the local magnetic variation rounded to the nearest integer degree (`+E` / `−W`), falling back cleanly to `0°` if offline/denied.

### 2.3 Two Opposite-Direction Rounds on the Same Grid
- **Why Starboard (`▶`) + Port (`◀`) on Identical Headings**:
  Turning a yacht onto a sequence of headings introduces systematic compass card drag, fluid swirl, and helmsman overshoot biased toward the direction of turn.
- **Why Offset Second Rounds Were Rejected**:
  Measuring intermediate headings on a second round mixes directional turning lag with angular interpolation, making the hysteresis invisible. Measuring the **exact same headings** in the opposite turning direction makes turning lag immediately visible as two parallel curves ($\text{Starboard } \triangleright$ vs. $\text{Port } \triangleleft$) whose average cancels the bias.
- **Why Optional at Round Completion**:
  Sea room, traffic, or training time may only permit a single 360° swing. Choosing the starting direction upfront and offering *"Continue turning `<opposite direction>`"* after completing Round 1 keeps the workflow flexible.

### 2.4 Cockpit-First Marine Ergonomics & Strictly Vertical Layout
- **Strictly Vertical (Portrait) Tile Stack**: People scan top-to-bottom. Every screen is arranged as a single top-to-bottom vertical flow of high-contrast flat tiles separated by `3px` gutters, without side-by-side multi-column layout shifts.
- **Portrait Lock & Desktop/Embed Constraint**:
  - On mobile/small screens, the app locks portrait orientation (`"orientation": "portrait-primary"` in `manifest.json` + `screen.orientation.lock('portrait-primary')`), falling back to a full-screen tilt prompt (`Portrait orientation only`) if a mobile browser tab ignores the lock in landscape.
  - On large desktop monitors, `.app` is constrained to a centered portrait column (`width: min(100vw, 480px, 62dvh)`, `height: 100dvh`) using CSS size containment (`container-type: size` + `cqmin`/`cqw`/`cqh` units). This preserves true portrait proportions on any monitor and makes the app trivial to embed inside an `<iframe>` or Web Component.
- **No System Keyboard During Measurement**: Summoning a mobile virtual keyboard covers half the viewport and hijacks the Android system Back gesture. All degree inputs use a **physics-like 3D cylindrical horizontal barrel tape** paired with pronounced **`±1°` stepper buttons** (tap for $1^\circ$, hold to repeat; plain taps on the tape do nothing to prevent accidental jumps).
- **Distinct Visual Hierarchy Between Helmsman Target (`000°C`) and Navigator Instrument (`000°M` / `000°T`)**:
  - The helmsman's target (**`STEER · COMPASS COURSE`**, displayed as **`000°C`** with a smaller `C`) is the largest hero readout at the top of `measure.html`.
  - The navigator's interactive **`MEASURE · COURSE OVER GROUND`** section is the second-largest element: the selected COG (**`000°M`** or **`000°T`**) emerges directly out of the center lubber line of the horizontal barrel tape as a magnifier window, flanked symmetrically by a **`COG`** label on the left and a contextual readout/control slot on the right. On the barrel, a translucent accent band stretches between **`CC`** and **`MC`** so compass deviation is immediately visible at a glance; in `°T`, a muted variation band also links **`MC`** to **`TC`**. Tiny labels directly below the X-axis mark **`CC`** and **`MC`** in Magnetic mode (and **`CC`**, **`MC`**, **`TC`** in True mode) without shifting layout geometry.
- **KISS Default Value (`DEVIATION = 0°` Baseline) & Explicit Measured State**:
  - Every unmeasured heading defaults its initial $COG$ to the steered compass heading corrected for current variation (`steer(i)` in `°M`, `norm(steer(i) + var)` in `°T`, so **`0°` deviation** is the neutral starting point in both modes; still-unmeasured headings update automatically if `°M`/`°T` or variation changes) in an unmeasured **white** state (`#cogMag`).
  - Changing the $COG$ via `−`, `+`, or dragging the tape—even if returned to the default value—or clicking directly on the default white `000°M`/`000°T` box marks that heading as **measured**, turning the magnifier box **blue** (`var(--acc)`) and filling that heading's directional indicator light (`▶` / `◀`).
  - Before a heading is measured (white), when `°T` is active, the right-hand slot displays the ambient grey **`VARIATION`** (`+4°`, `−3°`, `0°`; hidden when `°M`), and clicking that **`VARIATION`** readout opens the compact inline variation editor (`°M`/`°T` segmented toggle pinned at the top + **`VARIATION`** label and `−`/`+` variation steppers aligned below when `°T` is selected; hidden in `°M` without moving `°M`/`°T`). Once a heading is measured (blue), the right-hand slot displays the ambient grey **`DEVIATION`** readout (`0°`, `+4°`, `−3°`), and clicking **`T`/`M`** on the measured (blue) box opens the same inline variation editor in that exact right-hand slot without shifting any layout element. Touching or clicking anywhere outside the editor immediately resets the slot back to the ambient readout.
- **Redundant Shape, Fill, Size & Color Indicators**: Starboard turns use right-pointing triangles (`▶`) filling left-to-right with `[ ◀ PREV | TURN 45° STARBOARD ▶ | ABORT ]`; Port turns mirror cleanly using left-pointing triangles (`◀`) filling right-to-left with `[ ABORT | TURN 45° PORT ◀ | PREV ▶ ]` (with the step angle `360° / n` matching the chosen precision). Unmeasured headings render as **empty grey outlines**, turning into **full green (`--stbd`) or red (`--port`) triangles** only once measured, while the active heading is shown **even bigger** (with no square frame). Similarly, `TURN <step>° STARBOARD ▶` / `TURN <step>° PORT ◀` renders **grey** (still clickable) until the current heading is measured, then turns **accent blue**—and once all headings are measured (so `FINISH` turns **accent blue**), `TURN <step>° ...` returns to **grey** so only `FINISH` carries the primary blue highlight. Direction, progress, and active step remain unambiguous in monochrome, red-light night vision, or for color-blind crew.
- **Night Vision Mode**: True dark-red palette (`#000` background, dim red foreground) preserves rhodopsin dark adaptation during night passages.

### 2.5 Unbreakable State & Destructive Action Safety
- **Always Resume**: If the browser tab is backgrounded, reloaded, or closed mid-swing, the app resumes at the exact screen, heading, and values in `localStorage`.
- **System Back Button Trapped & Native Browser Chrome / Misc Interactions Disabled**:
  - Accidental edge-swipes on a heeling boat must never navigate backward or erase measurements. The browser History API traps Back navigation as a no-op; all transitions use explicit on-screen tiles.
  - All miscellaneous browser/OS interactions are globally disabled so the app behaves like a dedicated hardware marine instrument: right-click / long-press context menu (`contextmenu`), text selection (`user-select: none` / `selectstart`, except inside explicit text `<input>` rename fields), native element/link dragging (`dragstart` / `-webkit-user-drag: none`), iOS touch callouts (`-webkit-touch-callout: none`), tap-highlight flashes (`-webkit-tap-highlight-color: transparent`), and pull-to-refresh / rubber-band overscrolling (`overscroll-behavior: none`).
  - > [!IMPORTANT]
  - > **Open Architecture Review — Back Button Use & Flow Consistency Completeness**: Because the system Back gesture is trapped (and unavailable in standalone PWA / desktop viewports), every screen in the state machine must be audited for exit/return completeness so a user is never trapped on a dead-end state. **Concrete example**: On `setup.html`, there is currently no on-screen `Back` / `Home` button, leaving a user who tapped `START` from the home screen unable to return to `start.html` without starting and then aborting a measurement. Back navigation and flow graph completeness will be reviewed holistically across all pages once the per-page pass is complete.
- **Uniform Inline Hold-to-Confirm (`1200ms`) & Merged Review Choices**:
  - Completing all $n$ headings (`FINISH`) on `measure.html` navigates straight to `review.html` (eliminating any blind post-round intermediate screen), where the crew immediately sees the maximum-precision harmonic curve (with 8-wind compass rose markers, **blue** whenever rounded Port & Starboard match within `±1°`), a low-contrast `Δ` spread column between `◀ PORT` and `▶ STBD`, and per-heading deviations rounded symmetrically to whole integers for display while saved at **`0.5°` precision** so downstream tables and converters reproduce the **exact same harmonic curve**. Table rows stay uncolored (`--tile`), a single **amber** vertical tether marks spreads strictly `> 5°` on the graph, and hovering/clicking rows or chart points highlights the linked row (boosting `Δ` to full contrast) & compass-rose halo and displays a small live curve-deviation readout (`click` locks/pins a point, clicking again resets to hover). Below a full-width `HOLD · MEASURE AGAIN` subheader strip, holding `◀ PORT` or `STARBOARD ▶` (`1200ms`) returns to `measure.html`—jumping straight to the selected heading if a row is pinned (keeping all other headings measured and resetting only that heading to unmeasured `0°`-deviation default) or resuming where `FINISH` was clicked (`at`) if none is selected, with `ABORT` during re-measurement returning safely to `review.html`—or tap `SAVE TO DEVIATION TABLES` to immediately persist the table (`title: ""`, `createdAt` in shortest ISO-8601 UTC `YYYY-MM-DDTHH:MM:SSZ`) and open `deviation-table.html` directly (no intermediate save form).
  - Every destructive or session-resetting action uses the same **inline continuous press-and-hold (`1200ms`)** directly on its trigger button (`ABORT` on `measure.html`/`review.html`, `HOLD · MEASURE AGAIN` on `review.html`, `DELETE` on `saved.html`, and `ERASE ALL DATA` on `settings.html`)—never modal popups and no separate confirmation page. Releasing early resets the progress sweep immediately.

### 2.6 Pedagogical Integrity, Zero-Friction Auto-Save & Title Organization
- **No Automatic Outlier Flagging**: The app plots the harmonic curve and the raw directional points (`▶` / `◀`), leaving it to the student and instructor to visually identify bad readings.
- **No Freehand Number Fudging**: In Review, students cannot arbitrarily type a fake deviation number. To fix a questionable reading, they select the heading row or direction and re-measure it directly on the water in `measure.html` (`0°`-deviation fresh default).
- **Empty Start, Empty Default Title & Clickable Local `+TZ` ↔ UTC `Z` Display**: The app starts with **zero** saved tables (`start.html` hides `Open saved` until the first measurement is saved). Leaving Review via `SAVE TO DEVIATION TABLES` immediately persists `{ id, title: "", createdAt: "YYYY-MM-DDTHH:MM:SSZ", n, dev[] }` at `0.5°` precision (measurement values cannot be edited afterwards). Displayed timestamps always include an explicit timezone suffix—defaulting to local time with its ISO offset (`+HH:MM` / `-HH:MM`, e.g. `+01:00`)—and clicking any displayed timestamp toggles it in place to UTC (`Z`, e.g. `2026-11-17 21:15:08Z`). When `title` is empty, the formatted timestamp is the entry's primary label (never repeated in the subtitle); once the user renames `title` in `saved.html` (via free text + one-tap compass-type example chips: `Main navigation compass`, `Hand bearing compass`, `Chart table compass`, `Gyrocompass heading`, `iPad`, `Smart watch`), the custom `title` becomes the primary label and the timestamp moves into the secondary metadata line. Both the **Starboard/Port split** and the **chartplotter reference / swing-day magnetic variation** are temporary measurement-stage tools only and are never persisted on the saved model.
- **Conversion-Time Variation & Compass Error**: Whenever a saved deviation table is used later in the converter, **Variation** ($V_{\text{current}}$) is supplied fresh by the user for the current cruising grounds and date as needed, yielding **Compass Error**:
  $$\text{Compass Error} = V_{\text{current}} + \delta_{\text{saved}}(CC), \qquad TC = CC + \text{Compass Error}$$

### 2.7 Zero-Backend & Self-Contained Sharing
- **Why No Server**: Yachts operate offline out of cellular coverage, and training fleets should never require user accounts or cloud databases.
- **Chat + URL Hash Sharing**: Sharing generates a plain-text summary (readable directly in WhatsApp/Signal/SMS) followed by a self-contained `https://deviator.navigart.net/#t=v1&...` URL hash link that imports the saved table onto another crew member's device offline.

---

## 3. Scope & Non-Goals

- **In Scope**: Single-page offline PWA (`/docs` for GitHub Pages deployment at `deviator.navigart.net`), Mode A compass swinging (`4, 6, 8, 10, 12` headings, 1 or 2 rounds), harmonic curve fitting and inverse solver, interactive course converter (`Compass ↔ Magnetic ↔ True`), multi-boat local storage, URL-hash sharing, Day/Night/Auto themes.
- **Out of Scope**: Cloud sync, user accounts, NMEA/Wi-Fi boat bus integration, hand-bearing compass transit modes, automatic outlier rejection, or post-save editing of approved tables.
