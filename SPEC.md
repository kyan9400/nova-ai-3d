# Nova — SPEC (describes the code as built)

> This spec documents the shipped build in `src/`. An earlier, unrelated "v2" draft (multi-state orb, GSAP + Lenis +
> drei) that briefly replaced this file came from a stale run and is **not** what this site implements.

## 1. Concept
Nova is a fictional assistant for teams: it reads a workspace's docs, meetings and tickets and answers in seconds,
with the source attached. The site's job is to make "a mind that listens before it speaks" tangible. The hero is a
living orb of GPU particles, Nova's "mind". It leans toward your cursor, ripples with every key you type in a demo
chat, gathers itself while it "thinks" and pulses word by word while it answers.

Tone: calm, precise, a little dry. Graphite and one electric signal colour, like an instrument panel, not a neon
sci-fi poster.

## 2. Audience
- Primary: team leads and operators at 10–500 person companies who are tired of "who knows where that lives?".
- Secondary: hiring managers and clients looking at the portfolio. They should see a real design system, a
  reactive GPU particle system that stays fast, and an accessible interactive demo.

## 3. Sections (in order)
1. **Nav** (fixed, solid gradient, no backdrop-filter): logo, anchors (Demo, Capabilities, Pricing, FAQ),
   compact motion toggle, "Start free".
2. **Hero** (`#top`): eyebrow "Nova / assistant for teams", H1 "A mind that *listens* before it speaks." (three
   hand-set lines on a 12-column grid), lede, CTAs "Start free" / "Talk to the orb ↓", hint "Move your cursor. The orb
   is paying attention.", and a footer rail "01 Listens · 02 Thinks · 03 Answers" with a Scroll cue.
3. **Live demo** (`#demo`): H2 "Say something. *Watch it think.*" + chat box (scripted replies, three suggestion
   chips, live region for screen readers, Calm / Focus / Bright mind-mode buttons). Hero and demo share one sticky
   stage: on the way down the orb opens into a disc ("Every question opens the whole workspace.") and closes again
   beside the chat.
4. **Capabilities** (`#capabilities`): four cards: Answers with receipts, Meeting memory, Drafts in your voice,
   Hands off the busywork.
5. **How it works** (`#how`): Connect → Ask → Act.
6. **Trust** (`#trust`): privacy copy + three stats (1.4 s median answer, 0 workspace data used for training,
   99.95 % uptime target).
7. **Voices** (`#voices`): "Teams that stopped *asking around.*", three quotes from fictional people and companies,
   with the note "Names and companies are fictional, like Nova."
8. **Pricing** (`#pricing`): Spark ($0) / Orbit ($14, or $11 yearly, featured) / Nebula (custom), with a
   Monthly/Yearly switch (`aria-pressed` buttons).
9. **FAQ** (`#faq`): five `<details>` items, including "Is this a real product?" → fictional brand.
10. **Contact** (`#contact`): "Give your team a *second brain.*" with Start free (mailto), Email, WhatsApp, Telegram.
11. **Footer**: logo, "Concept project — fictional brand.", GitHub, Portfolio, motion toggle, "© 2026 Alhassan Alfarran",
   and a large outline "NOVA" wordmark (decorative).

Eyebrows carry a mono index (01–08). Section dots (≥ 1100 px) and a 2 px scroll progress bar sit on top.

All copy lives in `src/app/page.tsx`, `src/components/ChatDemo.tsx` and `src/components/Pricing.tsx`.

## 4. Signature 3D moment: the particle mind
- **One draw call for the shell**: `THREE.Points` + custom `ShaderMaterial` (`src/components/orb/shaders.ts`).
  Each particle has a Fibonacci-sphere home and four random seeds. The vertex shader pushes it through 3D simplex
  noise (three decorrelated samples ≈ curl-like currents), so the thick shell flows like slow thought.
- **Reactions, all uniforms** (`src/components/orb/engine.ts`):
  - cursor: a ray hits the sphere, then a local bulge + yellow highlight where you point, and the orb tilts toward the cursor;
  - typing: each keystroke adds energy and launches a ring wave across the shell from a point derived from the typed
    character (4 ripple slots, driven by the input value so phone keyboards work too);
  - sending: contraction + inner-layer swirl while "thinking";
  - answering: a radial beat with a travelling band on every streamed word.
- **Lit volume**: each particle is shaded as a point on a lit sphere: a warm key light from the upper left
  (`0.35 + 0.65·max(n·L, 0)`) and a steel fresnel rim. Colour is clamped to 1.35 so overlapping yellow never blows out.
- **Pearl nucleus** (high + medium): `SphereGeometry(0.34, 96, 64)` with `MeshPhysicalMaterial` (clearcoat 1,
  iridescence 1, roughness 0.18), lit by `RoomEnvironment` prefiltered with `PMREMGenerator` (built once after the
  renderer exists, before `compileAsync`). Undisplaced, so the normals are perfectly smooth. Its scale breathes with
  energy and speech and its emissive goes to signal yellow (up to 0.25) while thinking or answering. ACES tone
  mapping at exposure 1.1 (ShaderMaterials are not tone-mapped). The canvas has a depth buffer: shell, sparks and
  filaments test depth but never write it, so the nucleus hides far-side particles.
- **Synapse filaments** (high 160 / medium 90): one `LineSegments` of 12-segment great-circle arcs between shell
  points 25°–70° apart, lifted by `sin(πt)·0.12`, with a travelling pulse (steel body, signal head). They share the
  shell's breathing GLSL, so they stay attached. Visibility ≈ 0.08 idle, 0.6 thinking, +0.4 on word beats.
- **Intro**: `uIntro` 0 → 1 over 1.8 s after reveal. Each particle converges from `home·(2.6 + seed·1.2)` with a
  per-particle delay, then the glow and nucleus light up. Instant in reduced motion.
- **The mind opens** (the scroll moment): `open = sin(π·t)` over the hero → demo progress. Particles fly out along
  `dir·(1 + open·(0.6 + 1.6·seed))`, flatten into a tilted, swirling disc, sparks move to the rim, the root scale
  grows ×1.35 while the camera FOV narrows 40 → 32 (dolly-zoom feel), the nucleus glows (0.3) and filaments flare
  (0.5). A CSS-only caption fades in at mid-scroll. Reduced motion keeps the cut and no opening.
- **Mind modes**: Calm (default), Focus (half flow, tighter shell, cooler steel, filaments 0.25), Bright (more
  signal, sparks ×1.4, nucleus emissive 0.12). Damped uniforms, no rebuild; saved in localStorage `nova-mode`.
- **Bokeh** (high only): near particles grow ×1.6 and flatten into soft discs.
- **Sparks**: a second `Points` layer on crossing orbits. **Core**: an additive glow quad.
- **Colour**: graphite/silver particles. Noise peaks, cursor highlights and ripples light up in signal yellow,
  and thinking adds a pale-yellow glow. Additive blending, no post-processing.
- **DOM ↔ 3D bridge**: a mutable signal object (`src/lib/orb-signal.ts`) read inside `useFrame`, with no React
  renders and no allocations per frame.

### Quality tiers (decided before the Canvas exists, `src/lib/quality.ts`)
| tier | particles | sparks | DPR cap | antialias | nucleus | filaments | bokeh |
|---|---|---|---|---|---|---|---|
| high | 60 000 | 900 | 2 | yes | yes | 160 | yes |
| medium | 26 000 | 500 | 1.5 | yes | yes | 90 | no |
| low | 9 000 | 220 | 1 | no | no | 0 | no |

The intro and the scroll moment run on every tier.

GPU name via `WEBGL_debug_renderer_info` on a 1×1 throwaway context: software renderers (SwiftShader, llvmpipe,
Basic Render, or a failIfMajorPerformanceCaveat refusal) → no 3D at all, the poster stays (low when `?quality=` forces it). Intel/AMD integrated, Apple, Mali, Adreno and
PowerVR → at most medium. Touch or ≤ 4 cores → medium. Save-data, ≤ 2 cores or ≤ 2 GB → low.
`?quality=low|medium|high` overrides.

## 5. Performance
- `frameloop="demand"`. The loop runs only while the stage is on screen (IntersectionObserver), the tab is visible
  and either full motion is on or a reaction is still settling. Off screen = zero GPU work.
- Adaptive DPR (`AdaptiveDpr` in `engine.ts`): it is fed only consecutive frames, lowers the DPR when frames slow down,
  raises it after 2 s of headroom and stops raising after two bounces. drei's `PerformanceMonitor` is not used,
  because it reads render-on-demand gaps as slow frames.
- Warm-up: the nucleus environment (PMREM) and `gl.compileAsync(scene, camera)` run behind the code-drawn SVG poster
  (which mirrors the nucleus and filaments), and the canvas fades in only when ready. The loop stays continuous only
  while the intro, the scroll opening, the FOV or a mode change is still settling.
- 3D chunk (three + r3f) loads via `next/dynamic(..., { ssr: false })`, only after window `load` + an idle
  callback (never during hydration, shared helper `src/lib/after-idle.ts`) and never on software renderers. Particle
  generation yields between slices. First-load JS for `/` ≈ 181 KB gzip, and the lazy 3D chunk ≈ 245 KB gzip.
- UI enhancements (section dots, nav underline, magnetic buttons, cursor ring) are a separate chunk behind the same
  gate. The cursor and magnetic pull run only for a fine pointer with full motion; the native cursor always stays.
- The hero H1 is the LCP: server-rendered, never faded, curtained or clipped; the intro only nudges its lines with a
  transform. Below-the-fold sections use `content-visibility: auto`,
  switched off on the first same-page link click so smooth anchor jumps land on real section heights.
- Security headers (nosniff, referrer policy, permissions policy, frame deny) in `next.config.ts`; WebSite JSON-LD.
- No backdrop-filter, no background-attachment: fixed. CSS animates only transform/opacity, and scroll reveals use
  CSS `animation-timeline: view()`.
- No GSAP, no Lenis: nothing is scroll-scrubbed. Native scroll is the only scroll layer, and the orb's
  hero→demo move reads scroll progress once per scroll event (rAF-throttled).
- Reduced motion is the default when the OS asks for it. A **Turn on full motion** toggle sits in the nav and
  footer (localStorage `nova-motion`, `?motion=full|reduced` overrides, and an inline head script prevents a flash).
  Reduced = no autonomous drift or spin, and the hero→demo move is a cut. The orb still answers input, then stops.
- No WebGL / context lost: the poster stays and the whole page, chat included, works.

## 6. Design system
**Palette** (dark only; all text pairs ≥ 4.5:1)
| token | hex | use |
|---|---|---|
| ink | #0A0A0B | page background |
| ink-2 | #121213 | panels, alt sections |
| ink-3 | #1B1B1D | chat bubbles |
| line | #2C2C2F | borders, dividers |
| text | #F4F3EE | primary text |
| muted | #B5B4AD | body copy |
| dim | #908F89 | hints, captions |
| signal | #FFD60A | the one accent: CTAs, focus ring, eyebrows, highlights (dark text on it) |
| steel | #C8CBD2 | cool neutral for secondary strokes and states |
| glow | #FFF0A3 | pale tint of the accent (speaking state, small icons) |

**Fonts** (Google Fonts, SIL OFL, via `next/font`): **Archivo** (variable weight + width, with an expanded 800 cut
for display and the normal width for UI/body) and **Martian Mono** (eyebrows, labels, chat input, step numbers).

**Spacing**: 4 px base. 4 8 12 16 24 32 48 64 96 128 (`--s-1` … `--s-10`). Gutter `clamp(16px, 4vw, 48px)`,
max width 1200 px. Radius 10 / 18 / pill.

**Type scale**: display `clamp(44px, 8.4vw, 132px)` (line-height 0.92), contact display `clamp(40px, 7.2vw, 112px)`,
stats `clamp(56px, 7vw, 104px)`, H2 `clamp(30px, 4.2vw, 52px)` with word-by-word reveals, H3 18, lede 17–20, body 16,
labels 12–13 mono.

**Motion tokens**: `--ease-out` (0.16, 1, 0.3, 1), `--ease-in-out` (0.65, 0, 0.35, 1), `--dur-1` 180 ms,
`--dur-2` 420 ms, `--dur-3` 900 ms. Only transform and opacity animate.

## 7. Accessibility
Skip link, `main` focus target, visible 2 px signal focus ring, one H1 → H2 per section → H3, 44 px minimum tap
targets (buttons 48), no horizontal scroll at 320 px, a chat log region with a polite live region, sr-only speaker
labels, and pricing CTAs with plan names for screen readers. Section dots are a `<nav aria-label="Sections">` of links
with `aria-current` and 44 × 44 px hit areas; the mind modes and billing switch are `aria-pressed` buttons in labelled
groups; the progress bar, cursor ring, rail line, caption and wordmark are `aria-hidden`. Split-word headings keep
real spaces, so they read as normal sentences.

## 8. Assets & licences
- 3D, poster, favicon, apple icon, OG/Twitter images: all made in code (GLSL, SVG, `next/og`).
- 3D simplex noise adapted from webgl-noise (MIT), credited in CREDITS.md.
- Fonts: Archivo, Martian Mono (OFL). Libraries: next, react, three, @react-three/fiber (MIT).
- No runtime third-party requests.

## 9. Budget
Route first-load JS < 250 KB gzip (excluding the lazy 3D chunk). Lighthouse mobile ≥ 85 perf, ≥ 95 a11y/BP/SEO.
