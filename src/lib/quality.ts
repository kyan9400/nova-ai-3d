/*
  Quality tier, decided BEFORE the canvas is created.
  Hardware hints first, then the GPU name from a throwaway WebGL2 context:
  software renderers -> low, integrated / mobile GPUs and touch devices -> at most medium.
  ?quality=low|medium|high overrides everything.
*/

export type Tier = "low" | "medium" | "high";

export const TIERS: Record<Tier, { particles: number; sparks: number; dprCap: number; antialias: boolean }> = {
  high: { particles: 60000, sparks: 900, dprCap: 2, antialias: true },
  medium: { particles: 26000, sparks: 500, dprCap: 1.5, antialias: true },
  low: { particles: 9000, sparks: 220, dprCap: 1, antialias: false },
};

const ORDER: Tier[] = ["low", "medium", "high"];
const lower = (a: Tier, b: Tier): Tier => (ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b);

function gpuName(gl: WebGL2RenderingContext) {
  const name = String(gl.getParameter(gl.RENDERER) || "");
  if (!/^webkit/i.test(name)) return name;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || name) : name;
}

export function detectQuality(): { webgl: boolean; tier: Tier; gpu: string } {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = document.createElement("canvas").getContext("webgl2", { powerPreference: "high-performance" });
  } catch {
    gl = null;
  }
  if (!gl) return { webgl: false, tier: "low", gpu: "" };

  const gpu = gpuName(gl);
  gl.getExtension("WEBGL_lose_context")?.loseContext();

  const forced = new URLSearchParams(window.location.search).get("quality");
  if (forced === "low" || forced === "medium" || forced === "high") return { webgl: true, tier: forced, gpu };

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency || 4;
  const memory = nav.deviceMemory || 4;
  const touch = window.matchMedia("(pointer: coarse)").matches;

  let tier: Tier = "high";
  if (nav.connection?.saveData || cores <= 2 || memory <= 2) tier = "low";
  else if (touch || cores <= 4) tier = "medium";

  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) tier = "low";
  else if (/intel|uhd|iris|mali|adreno|powervr|apple gpu|radeon\(tm\) graphics|radeon graphics|vega/i.test(gpu))
    tier = lower(tier, "medium");

  return { webgl: true, tier, gpu };
}
