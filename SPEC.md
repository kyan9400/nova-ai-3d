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
2. **Hero** (`#top`): eyebrow "Nova / assistant for teams", H1 "A mind that *listens* before it speaks.", lede,
   CTAs "Start free" / "Talk to the orb ↓", hint "Move your cursor. The orb is paying attention."
3. **Live demo** (`#demo`): H2 "Say something. *Watch it think.*" + chat box (scripted replies, three suggestion
   chips, live region for screen readers). Hero and demo share one sticky stage, and the orb moves from the hero
   position to sit beside the chat as you scroll.
4. **Capabilities** (`#capabilities`): four cards: Answers with receipts, Meeting memory, Drafts in your voice,
   Hands off the busywork.
5. **How it works** (`#how`): Connect → Ask → Act.
6. **Trust** (`#trust`): privacy copy + three stats (1.4 s median answer, 0 workspace data used for training,
   99.95 % uptime target).
7. **Pricing** (`#pricing`): Spark ($0) / Orbit ($14, or $11 yearly, featured) / Nebula (custom), with a
   Monthly/Yearly switch (`aria-pressed` buttons).
8. **FAQ** (`#faq`): five `<details>` items, including "Is this a real product?" → fictional brand.
9. **Contact** (`#contact`): "Give your team a *second brain.*" with Start free (mailto), Email, WhatsApp, Telegram.
10. **Footer**: logo, "Concept project — fictional brand.", GitHub, Portfolio, motion toggle, "© 2026 Alhassan Alfarran".

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
- **Sparks**: a second `Points` layer on crossing orbits. **Core**: an additive glow quad.
- **Colour**: graphite/silver particles. Noise peaks, cursor highlights and ripples light up in signal yellow,
  and thinking adds a pale-yellow glow. Additive blending, no post-processing.
- **DOM ↔ 3D bridge**: a mutable signal object (`src/lib/orb-signal.ts`) read inside `useFrame`, with no React
  renders and no allocations per frame.

### Quality tiers (decided before the Canvas exists, `src/lib/quality.ts`)
| tier | particles | sparks | DPR cap | antialias |
|---|---|---|---|---|
| high | 60 000 | 900 | 2 | yes |
| medium | 26 000 | 500 | 1.5 | yes |
| low | 9 000 | 220 | 1 | no |

GPU name via `WEBGL_debug_renderer_info`: software renderers → low. Intel/AMD integrated, Apple, Mali, Adreno and
PowerVR → at most medium. Touch or ≤ 4 cores → medium. Save-data, ≤ 2 cores or ≤ 2 GB → low.
`?quality=low|medium|high` overrides.

## 5. Performance
- `frameloop="demand"`. The loop runs only while the stage is on screen (IntersectionObserver), the tab is visible
  and either full motion is on or a reaction is still settling. Off screen = zero GPU work.
- Adaptive DPR (`AdaptiveDpr` in `engine.ts`): it is fed only consecutive frames, lowers the DPR when frames slow down,
  raises it after 2 s of headroom and stops raising after two bounces. drei's `PerformanceMonitor` is not used,
  because it reads render-on-demand gaps as slow frames.
- Warm-up: `gl.compileAsync(scene, camera)` behind the code-drawn SVG poster, and the canvas fades in only when ready.
- 3D chunk (three + r3f) loads via `next/dynamic(..., { ssr: false })`. First-load JS for `/` ≈ 179 KB gzip, and
  the lazy 3D chunk ≈ 240 KB gzip.
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

**Type scale**: display `clamp(38px, 6.4vw, 88px)`, H2 `clamp(30px, 4.2vw, 52px)`, H3 18, lede 17–20, body 16,
labels 12–13 mono.

## 7. Accessibility
Skip link, `main` focus target, visible 2 px signal focus ring, one H1 → H2 per section → H3, 44 px minimum tap
targets (buttons 48), no horizontal scroll at 320 px, a chat log region with a polite live region, sr-only speaker
labels, and pricing CTAs with plan names for screen readers.

## 8. Assets & licences
- 3D, poster, favicon, apple icon, OG/Twitter images: all made in code (GLSL, SVG, `next/og`).
- 3D simplex noise adapted from webgl-noise (MIT), credited in CREDITS.md.
- Fonts: Archivo, Martian Mono (OFL). Libraries: next, react, three, @react-three/fiber (MIT).
- No runtime third-party requests.

## 9. Budget
Route first-load JS < 250 KB gzip (excluding the lazy 3D chunk). Lighthouse mobile ≥ 85 perf, ≥ 95 a11y/BP/SEO.
