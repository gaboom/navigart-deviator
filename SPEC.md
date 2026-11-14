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
  - All miscellaneous browser/OS interactions are globally disabled so the app behaves like a dedicated hardware marine instrument: right-click / long-press context menu (`contextmenu`), text selection (`user-select: none` / `selectstart`, except inside explicit text `<input>` fields on `save.html`), native element/link dragging (`dragstart` / `-webkit-user-drag: none`), iOS touch callouts (`-webkit-touch-callout: none`), tap-highlight flashes (`-webkit-tap-highlight-color: transparent`), and pull-to-refresh / rubber-band overscrolling (`overscroll-behavior: none`).
  - > [!IMPORTANT]
  - > **Open Architecture Review — Back Button Use & Flow Consistency Completeness**: Because the system Back gesture is trapped (and unavailable in standalone PWA / desktop viewports), every screen in the state machine must be audited for exit/return completeness so a user is never trapped on a dead-end state. **Concrete example**: On `setup.html`, there is currently no on-screen `Back` / `Home` button, leaving a user who tapped `START` from the home screen unable to return to `start.html` without starting and then aborting a measurement. Back navigation and flow graph completeness will be reviewed holistically across all pages once the per-page pass is complete.
- **Hold-to-Abort Directly on `measure.html` & Destructive Confirmation**:
  - Cancelling an active measurement on `measure.html` does not open a separate confirmation page: `ABORT` requires a continuous **2-second press-and-hold** directly on `#exit` while a distinct reddish overlay (visually distinct from the `--port` crimson indicator color) sweeps across the button, jumping straight to `start.html` when complete and resetting immediately if released early.
  - Other destructive actions (`DELETE`, `ERASE ALL DATA`) use `confirm.html` without small modal popups, where:
  1. The **safe choice** is the largest tile at the bottom of the screen.
  2. The **destructive choice** requires a continuous **2-second press-and-hold** with a visual progress fill bar, positioned away from the triggering button so a double-tap can never trigger it.

### 2.6 Pedagogical Integrity & Immutability
- **No Automatic Outlier Flagging**: The app plots the harmonic curve and the raw directional points (`▶` / `◀`), leaving it to the student and instructor to visually identify bad readings.
- **No Freehand Number Fudging**: In Review, students cannot arbitrarily type a fake deviation number. For any heading, they may only select **Starboard only**, **Port only**, **Both (averaged)**, or **Re-measure** that heading on the water.
- **Saved Tables Store Deviation Only (Period)**: Once approved by the instructor and saved with a boat name and date, a deviation table is **immutable**. It can be viewed, used for course conversions, shared, or deleted—never reopened for editing. Both the **Starboard/Port split** and the **chartplotter reference / swing-day magnetic variation** are temporary measurement-stage tools only: variation is used solely during swinging to strip `COG °T` down to Magnetic Course ($MC = COG - V$) so pure compass deviation ($\delta = MC - CC$) is obtained. The saved model contains **strictly `{ boat, date, n, dev[] }`**—never the chartplotter reference (`M`/`T`) and never the variation it was measured under.
- **Conversion-Time Variation & Compass Error**: Whenever a saved deviation table is used later in the converter, **Variation** ($V_{\text{current}}$) is supplied fresh by the user for the current cruising grounds and date as needed, yielding **Compass Error**:
  $$\text{Compass Error} = V_{\text{current}} + \delta_{\text{saved}}(CC), \qquad TC = CC + \text{Compass Error}$$

### 2.7 Zero-Backend & Self-Contained Sharing
- **Why No Server**: Yachts operate offline out of cellular coverage, and training fleets should never require user accounts or cloud databases.
- **Chat + URL Hash Sharing**: Sharing generates a plain-text summary (readable directly in WhatsApp/Signal/SMS) followed by a self-contained `https://deviator.navigart.net/#t=v1&...` URL hash link that imports the saved table onto another crew member's device offline.

---

## 3. Scope & Non-Goals

- **In Scope**: Single-page offline PWA (`/docs` for GitHub Pages deployment at `deviator.navigart.net`), Mode A compass swinging (`4, 6, 8, 10, 12` headings, 1 or 2 rounds), harmonic curve fitting and inverse solver, interactive course converter (`Compass ↔ Magnetic ↔ True`), multi-boat local storage, URL-hash sharing, Day/Night/Auto themes.
- **Out of Scope**: Cloud sync, user accounts, NMEA/Wi-Fi boat bus integration, hand-bearing compass transit modes, automatic outlier rejection, or post-save editing of approved tables.
