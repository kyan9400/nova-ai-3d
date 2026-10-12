/*
  Quality tier, decided BEFORE the canvas is created (and before three.js is even downloaded).
  Hardware hints first, then the GPU name from a throwaway 1x1 WebGL2 context:
  software renderers -> no 3D at all (the poster stays) unless ?quality= forces it on, in which case low;
  integrated / mobile GPUs and touch devices -> at most medium.
  ?quality=low|medium|high overrides everything.
  This module never imports three, so the probe costs a few milliseconds.
*/

export type Tier = "low" | "medium" | "high";

export type TierSettings = {
  particles: number;
  sparks: number;
  dprCap: number;
  antialias: boolean;
  /** glass core sphere segments (width; height is 3/4 of it) */
  glassSegments: number;
  /** synapse filament arcs (0 = none) */
  filaments: number;
  /** light streams: loops x points per loop */
  streams: number;
  streamPoints: number;
  /** depth dust motes around the mind */
  dust: number;
  /** light rays in the halo */
  rays: boolean;
  /** near particles grow and soften (depth of field feel) */
  bokeh: boolean;
};

export const TIERS: Record<Tier, TierSettings> = {
  high: {
    particles: 44000, sparks: 900, dprCap: 2, antialias: true, glassSegments: 96, filaments: 220,
    streams: 36, streamPoints: 560, dust: 2400, rays: true, bokeh: true,
  },
  medium: {
    particles: 20000, sparks: 500, dprCap: 1.5, antialias: true, glassSegments: 64, filaments: 120,
    streams: 22, streamPoints: 380, dust: 1200, rays: true, bokeh: false,
  },
  low: {
    particles: 8000, sparks: 220, dprCap: 1, antialias: false, glassSegments: 40, filaments: 0,
    streams: 12, streamPoints: 240, dust: 400, rays: false, bokeh: false,
  },
};

const ORDER: Tier[] = ["low", "medium", "high"];
const lower = (a: Tier, b: Tier): Tier => (ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b);

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

function gpuName(gl: WebGL2RenderingContext) {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const unmasked = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || "") : "";
  return unmasked || String(gl.getParameter(gl.RENDERER) || "");
}

function tinyContext(caveat: boolean): WebGL2RenderingContext | null {
  // a canvas hands out only one context, so every attempt gets a fresh 1x1 canvas
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    return canvas.getContext("webgl2", {
      failIfMajorPerformanceCaveat: caveat,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
}

export type Quality = {
  /** WebGL2 works at all */
  webgl: boolean;
  /** CPU rasteriser (SwiftShader, llvmpipe, Basic Render...) or only a context with a major performance caveat */
  software: boolean;
  /** ?quality= is set */
  forced: boolean;
  tier: Tier;
  gpu: string;
};

export function detectQuality(): Quality {
  const q = new URLSearchParams(window.location.search).get("quality");
  const forced: Tier | null = q === "low" || q === "medium" || q === "high" ? q : null;

  let gl = tinyContext(true);
  let caveat = false;
  if (!gl) {
    gl = tinyContext(false);
    caveat = !!gl;
  }
  if (!gl) return { webgl: false, software: false, forced: !!forced, tier: "low", gpu: "" };

  const gpu = gpuName(gl);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  const software = caveat || SOFTWARE.test(gpu);

  if (forced) return { webgl: true, software, forced: true, tier: forced, gpu };

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  const touch = window.matchMedia("(pointer: coarse)").matches;

  let tier: Tier = "high";
  if (nav.connection?.saveData || cores <= 2 || memory <= 2) tier = "low";
  else if (touch || cores <= 4) tier = "medium";

  if (software) tier = "low";
  else if (/intel|uhd|iris|mali|adreno|powervr|apple gpu|radeon\(tm\) graphics|radeon graphics|vega/i.test(gpu))
    tier = lower(tier, "medium");

  return { webgl: true, software, forced: false, tier, gpu };
}
