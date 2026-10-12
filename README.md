# Nova — a mind that listens before it speaks

A concept landing page for **Nova**, a fictional assistant for teams. The hero is a living orb of up to
60,000 GPU particles — Nova's "mind". It leans toward your cursor, ripples with every key you type in the demo
chat, gathers itself while it "thinks" and pulses word by word while it answers. Below it: capabilities, how it
works, trust, pricing tiers, FAQ and contact.

Concept project — fictional brand.

**Live:** https://nova-ai-3d-xi.vercel.app

## Tech stack
- Next.js 16 (App Router, TypeScript strict, `src/` dir), React 19
- three.js 0.186 + @react-three/fiber 9, loaded with `next/dynamic(..., { ssr: false })` so the HTML renders instantly
- Tailwind CSS 4 (`@import "tailwindcss"` + `@theme` tokens) and hand-written component CSS
- `next/font` (Archivo with its width axis + Martian Mono), `next/og` for the icons; the OG/Twitter
  image is a 1200×630 screenshot of the live site (`opengraph-image.png` / `twitter-image.png` + `.alt.txt`)
- Design: graphite ink with one electric accent (signal yellow #FFD60A); the orb is silver particles that light up
  yellow where you point, type or listen

Versions are pinned exactly (see `package.json` / `STACK.md`). Deviations from the shared stack, on purpose:
`@react-three/drei`, `@react-three/postprocessing`, GSAP and Lenis are **not installed** — there are no
scroll-scrubbed scenes (native scroll is the one smoothing layer), the glow comes from additive blending instead
of a bloom pass, and the adaptive-resolution controller is a small in-house class, so those packages would only add
weight.

## The signature 3D technique
- **One draw call, all motion on the GPU.** `THREE.Points` with a custom `ShaderMaterial`. Every particle has a
  Fibonacci-sphere home and four random seeds; the vertex shader pushes it through a 3D simplex-noise field
  (three decorrelated samples ≈ curl-like currents) so the shell flows like slow thought.
- **Uniform-driven reactions** (`src/components/orb/engine.ts`):
  cursor ray hits the sphere → local bulge + highlight; each keystroke → energy + a ring wave that travels across
  the shell from a point derived from the typed character (4 ripple slots); sending → contraction and swirl;
  every streamed word → a radial beat with a travelling band. A second `Points` layer of orbiting sparks and an
  additive core glow complete it.
- **Lit particle volume.** Each particle is shaded as a point on a lit sphere (warm key light from the upper left
  plus a steel fresnel rim), so the cloud reads as a rounded volume from every angle.
- **Pearl nucleus (high + medium).** An undisplaced `MeshPhysicalMaterial` sphere (clearcoat + iridescence) lit by
  three.js `RoomEnvironment` through `PMREMGenerator`: studio light made in code, no HDRI. It breathes with
  typing and glows signal yellow while Nova thinks or answers.
- **Synapse filaments (high + medium).** One `LineSegments` of great-circle arcs between shell points, with a
  pulse that runs along each arc; they breathe with the shell (shared GLSL) and flare while thinking.
- **Intro: the orb switches on.** Particles converge from far out with per-particle delays, then the glow and the
  nucleus light up. The headline is never hidden: it paints first and only gets a transform-only rise.
- **The mind opens.** Halfway between the hero and the demo, the orb flies apart into a tilted disc of thought
  while the field of view narrows (a dolly-zoom feel without moving the camera), then closes again beside the chat.
- **Mind modes.** Calm / Focus / Bright buttons in the demo card change uniform presets (no rebuild); remembered.
- **Bokeh (high tier).** Near particles grow and flatten into soft discs for depth, at zero extra draw calls.
- **DOM ↔ 3D bridge**: a tiny mutable signal module (`src/lib/orb-signal.ts`), read inside `useFrame` — no React
  renders per frame, no allocations per frame.

## Performance
- `frameloop="demand"`: the loop runs only while the stage is on screen, the tab is visible and full motion is on
  (or a reaction is still settling). Off screen = zero GPU work.
- Quality tier decided **before** the canvas exists (GPU name via `WEBGL_debug_renderer_info`, touch, cores,
  save-data; `?quality=low|medium|high` overrides): high 60k particles / DPR 2, medium 26k / 1.5, low 9k / 1.
- Adaptive DPR: drops resolution when frames slow down, raises it after 2 s of headroom, never bounces.
- Shaders compiled with `gl.compileAsync` behind a code-drawn poster; the canvas fades in only when ready.
- No `backdrop-filter` anywhere; panels over the canvas are solid/gradient tinted. CSS animates only
  transform/opacity; scroll reveals use CSS `animation-timeline: view()` (no JS).
- Reduced motion is respected by default, with a **Turn on full motion** toggle (nav + footer, remembered;
  `?motion=full|reduced` overrides). Reduced = no autonomous drift/spin; the orb still answers you, then stops.
- No WebGL or a lost context → the poster stays and the page (including the chat) works fully.
- Software WebGL (SwiftShader, llvmpipe, softpipe, Microsoft Basic Render, Mesa offscreen, or a context that only
  exists with `failIfMajorPerformanceCaveat` off) → the 3D chunk is never downloaded and the poster stays.
  `?quality=low|medium|high` still forces the canvas on. The probe is a 1×1 context; three.js is not imported for it.
- First-load JS for `/`: ~181 KB gzip; the three.js chunk (~245 KB gzip) is requested only after window `load` +
  `requestIdleCallback` (2.5 s timeout), never during hydration (`src/lib/after-idle.ts`). Particle attributes are
  generated in slices that yield to the main thread, with yields before the environment and `compileAsync`.
- Section dots, magnetic buttons and the cursor ring are a separate chunk behind the same load + idle gate.
  The progress bar, split-word headings and the mid-scroll caption are CSS scroll timelines (no JS).
- The poster SVG is a server component (in the HTML, never hydrated) and mirrors the live scene (nucleus +
  filaments). The hero headline is the LCP: it is never faded or clipped, only nudged with a transform.

## Run it
```bash
npm install
npm run dev      # local development
npm run build    # production build
npm run build:pages  # static GitHub Pages mirror in out/ (base path /nova-ai-3d)
npm run lint
```
On Windows, if the build runs out of memory: `NODE_OPTIONS=--max-old-space-size=3072 npm run build`.

## Project layout
```
src/app/            layout, page, globals.css (design tokens), 404, OG/Twitter image (PNG), icons, robots, sitemap
src/components/     Stage (sticky canvas + poster), ChatDemo, Pricing, MotionToggle, MobileMenu, OrbPoster,
                    SplitWords (word reveals), EnhancementsGate + Enhancements (dots, cursor, magnetic buttons)
src/components/orb/ OrbCanvas (r3f), engine.ts (scene + per-frame logic), shaders.ts (GLSL)
src/lib/            orb-signal (DOM ↔ 3D), mind-mode, motion preference, quality tiers, after-idle, site
SPEC.md             concept, copy, design system, performance budget
```

## Credits
Fonts (SIL OFL), npm libraries and the simplex-noise code are listed in [CREDITS.md](CREDITS.md).
All 3D is made in code; there are no third-party assets.

## License
© 2026 Alhassan Alfarran. All rights reserved — see [LICENSE](LICENSE).
