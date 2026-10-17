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
- **Why `4, 6, 8, 10, 12` Headings (Default `8`)**:
  Magnetic deviation on a vessel follows the classic 5-term Fourier harmonic expansion:
  $$\delta(c) = A + B\sin c + C\cos c + D\sin 2c + E\cos 2c$$
  - **$N = 8$ (Every $45^\circ$)**: The maritime standard. Over-determines the 5 coefficients with 3 degrees of freedom so a single bad reading visibly stands out from the smooth curve.
  - **$N = 4$ (Cardinal points $000^\circ, 090^\circ, 180^\circ, 270^\circ$)**: Quick check, but $\sin 2c = 0$ at all four points, making quadrantal error $D$ mathematically unobservable (and placing $E\cos 2c$ at the Nyquist limit).
  - **$N = 6, 10, 12$**: Allow instructors to demonstrate under-redundancy ($N = 6$) vs. higher angular resolution ($N = 10, 12$).

### 2.3 Two Opposite-Direction Rounds on the Same Grid
- **Why Starboard (`▶`) + Port (`◀`) on Identical Headings**:
  Turning a yacht onto a sequence of headings introduces systematic compass card drag, fluid swirl, and helmsman overshoot biased toward the direction of turn.
- **Why Offset Second Rounds Were Rejected**:
  Measuring intermediate headings on a second round mixes directional turning lag with angular interpolation, making the hysteresis invisible. Measuring the **exact same headings** in the opposite turning direction makes turning lag immediately visible as two parallel curves ($\text{Starboard } \triangleright$ vs. $\text{Port } \triangleleft$) whose average cancels the bias.
- **Why Optional at Round Completion**:
  Sea room, traffic, or training time may only permit a single 360° swing. Choosing the starting direction upfront and offering *"Continue turning `<opposite direction>`"* after completing Round 1 keeps the workflow flexible.

### 2.4 Cockpit-First Marine Ergonomics
- **Edge-to-Edge Tile Grid**: High-contrast, flat tiles separated by `3px` gutters maximize touch targets on a wet, pitching deck and scale cleanly across phone portrait, phone landscape, and tablet viewports without scrolling during active workflows.
- **No System Keyboard During Measurement**: Summoning a mobile virtual keyboard covers half the viewport and hijacks the Android system Back gesture. All degree inputs use a **drag-only heading tape** paired with **`±1°` stepper buttons** (tap for $1^\circ$, hold to repeat; plain taps on the tape do nothing to prevent accidental jumps).
- **KISS Default Value (`COG = Steered Heading`)**: Every heading defaults its initial $COG$ to the steered compass heading (`045°` $\rightarrow$ `045°`). Since yacht deviation is typically only a few degrees, the student only needs a few degrees of adjustment.
- **Redundant Shape + Color Indicators**: Starboard turns use green right-pointing triangles (`▶` visited / `▷` unvisited); Port turns use red left-pointing triangles (`◀` visited / `◁` unvisited). Direction and completion remain unambiguous in monochrome, red-light night vision, or for color-blind crew.
- **Night Vision Mode**: True dark-red palette (`#000` background, dim red foreground) preserves rhodopsin dark adaptation during night passages.

### 2.5 Unbreakable State & Destructive Action Safety
- **Always Resume**: If the browser tab is backgrounded, reloaded, or closed mid-swing, the app resumes at the exact screen, heading, and values in `localStorage`.
- **System Back Button Trapped**: Accidental edge-swipes on a heeling boat must never navigate backward or erase measurements. The browser History API traps Back navigation as a no-op; all transitions use explicit on-screen tiles.
- **Full-Screen 2-Second Hold-to-Confirm**: No small modal popups. Destructive actions (`ABORT`, `DELETE`, `ERASE ALL DATA`) open a dedicated confirmation screen where:
  1. The **safe choice** is the largest tile at the bottom of the screen.
  2. The **destructive choice** requires a continuous **2-second press-and-hold** with a visual progress fill bar, positioned away from the triggering button so a double-tap can never trigger it.

### 2.6 Pedagogical Integrity & Immutability
- **No Automatic Outlier Flagging**: The app plots the harmonic curve and the raw directional points (`▶` / `◀`), leaving it to the student and instructor to visually identify bad readings.
- **No Freehand Number Fudging**: In Review, students cannot arbitrarily type a fake deviation number. For any heading, they may only select **Starboard only**, **Port only**, **Both (averaged)**, or **Re-measure** that heading on the water.
- **Saved Tables Are Final**: Once approved by the instructor and saved with a boat name and date, a deviation table is **immutable**. It can be viewed, used for course conversions, shared, or deleted—never reopened for editing. Furthermore, the Starboard/Port split is a workflow tool only; saved tables store only the consolidated per-heading deviations and metadata.

### 2.7 Zero-Backend & Self-Contained Sharing
- **Why No Server**: Yachts operate offline out of cellular coverage, and training fleets should never require user accounts or cloud databases.
- **Chat + URL Hash Sharing**: Sharing generates a plain-text summary (readable directly in WhatsApp/Signal/SMS) followed by a self-contained `https://deviator.navigart.net/#t=v1&...` URL hash link that imports the saved table onto another crew member's device offline.

---

## 3. Scope & Non-Goals

- **In Scope**: Single-page offline PWA (`/docs` for GitHub Pages deployment at `deviator.navigart.net`), Mode A compass swinging (`4, 6, 8, 10, 12` headings, 1 or 2 rounds), harmonic curve fitting and inverse solver, interactive course converter (`Compass ↔ Magnetic ↔ True`), multi-boat local storage, URL-hash sharing, Day/Night/Auto themes.
- **Out of Scope**: Cloud sync, user accounts, NMEA/Wi-Fi boat bus integration, hand-bearing compass transit modes, automatic outlier rejection, or post-save editing of approved tables.
