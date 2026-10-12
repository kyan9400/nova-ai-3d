/*
  Nova's mind, as a plain class so the per-frame work never touches React.
  Hierarchy: world -> dust (depth layer, parallax)
                   -> root (layout: position/scale from scroll) -> halo quad (glow, rays, waveform, sound rings)
                                                                -> tilt (cursor lean + spin) -> glass core, shell,
                                                                   light streams, sparks, filaments
  Draw order: halo -> glass (opaque pass, writes depth so it hides far-side particles) -> dust/shell -> streams/sparks/filaments.
  Everything that changes per frame is preallocated here (no allocations in update()).
  Noise for every shader is one 32^3 RGBA texture (buildNoise), not inline GLSL noise: fast to compile on ANGLE.
*/
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Data3DTexture,
  Group,
  LinearFilter,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { orbSignal } from "@/lib/orb-signal";
import type { TierSettings } from "@/lib/quality";
import {
  dustVertex,
  filamentFragment,
  filamentVertex,
  glassFragment,
  glassVertex,
  haloFragment,
  haloVertex,
  pointFragment,
  shellVertex,
  sparkVertex,
  streamVertex,
} from "./shaders";

const CAM_Z = 4.2;
const FOV = 40;
const FOV_OPEN = 32;
const HALF_H = CAM_Z * Math.tan(((FOV / 2) * Math.PI) / 180);
const RADIUS = 1.15;
const GLASS_R = 0.6;
const INTRO_S = 1.8;
const ARC_SEGMENTS = 12;
const NOISE_N = 32;

// chapter palettes: [key, light, deep accent] as linear-ish RGB
const PAL_LISTEN = [1.0, 0.72, 0.16, 1.0, 0.9, 0.72, 0.95, 0.42, 0.1];
const PAL_THINK = [0.4, 0.68, 1.0, 0.82, 0.9, 1.0, 0.58, 0.36, 1.0];
const PAL_SPEAK = [1.0, 0.8, 0.04, 1.0, 0.94, 0.66, 1.0, 0.36, 0.08];

// deterministic pseudo-random in [0, 1)
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Let the browser handle input and paint between heavy steps (keeps each task short). */
export const yieldToMain = () =>
  new Promise<void>((resolve) => {
    const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (s?.yield) s.yield().then(resolve, () => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });

type Attributes = {
  noise: Uint8Array;
  pos: Float32Array;
  seed: Float32Array;
  orbit: Float32Array;
  twinkle: Float32Array;
  filPos: Float32Array;
  filT: Float32Array;
  filSeed: Float32Array;
  streamA: Float32Array;
  streamB: Float32Array;
  dustPos: Float32Array;
  dustSeed: Float32Array;
};

const SLICE = 8000;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Fibonacci-sphere home point i of n, written into out at offset o. */
function fib(i: number, n: number, out: Float32Array | number[], o = 0) {
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = GOLDEN * i;
  out[o] = Math.cos(th) * r;
  out[o + 1] = y;
  out[o + 2] = Math.sin(th) * r;
}

/**
 * Tileable smooth value noise, 4 decorrelated channels, two octaves (8 and 16 cells per period),
 * stretched to the full 0..255 range. Sampled in GLSL with q * 0.125, so one cell = one unit of q.
 */
async function buildNoise(): Promise<Uint8Array> {
  const N = NOISE_N;
  const out = new Uint8Array(N * N * N * 4);
  const acc = new Float32Array(N * N * N);
  const sm = (x: number) => x * x * (3 - 2 * x);
  for (let c = 0; c < 4; c++) {
    acc.fill(0);
    for (const [P, w] of [
      [8, 1],
      [16, 0.35],
    ]) {
      const lat = new Float32Array(P * P * P);
      for (let i = 0; i < lat.length; i++) lat[i] = hash(i * 1.618 + c * 97.3 + P * 13.1);
      const L = (x: number, y: number, z: number) => lat[(x % P) + (y % P) * P + (z % P) * P * P];
      const k = P / N;
      for (let z = 0; z < N; z++) {
        const fz = z * k;
        const iz = Math.floor(fz);
        const tz = sm(fz - iz);
        for (let y = 0; y < N; y++) {
          const fy = y * k;
          const iy = Math.floor(fy);
          const ty = sm(fy - iy);
          for (let x = 0; x < N; x++) {
            const fx = x * k;
            const ix = Math.floor(fx);
            const tx = sm(fx - ix);
            const a = L(ix, iy, iz) + (L(ix + 1, iy, iz) - L(ix, iy, iz)) * tx;
            const b = L(ix, iy + 1, iz) + (L(ix + 1, iy + 1, iz) - L(ix, iy + 1, iz)) * tx;
            const cc = L(ix, iy, iz + 1) + (L(ix + 1, iy, iz + 1) - L(ix, iy, iz + 1)) * tx;
            const d = L(ix, iy + 1, iz + 1) + (L(ix + 1, iy + 1, iz + 1) - L(ix, iy + 1, iz + 1)) * tx;
            const ab = a + (b - a) * ty;
            const cd = cc + (d - cc) * ty;
            acc[x + y * N + z * N * N] += (ab + (cd - ab) * tz) * w;
          }
        }
      }
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < acc.length; i++) {
      if (acc[i] < lo) lo = acc[i];
      if (acc[i] > hi) hi = acc[i];
    }
    const span = hi - lo || 1;
    for (let i = 0; i < acc.length; i++) out[i * 4 + c] = Math.round(((acc[i] - lo) / span) * 255);
    await yieldToMain();
  }
  return out;
}

/** Every attribute buffer, generated in slices with a yield between them. */
async function buildAttributes(s: TierSettings): Promise<Attributes> {
  const noise = await buildNoise();
  const { particles, sparks, filaments } = s;

  // --- shell: Fibonacci sphere home points + 4 random seeds per particle
  const pos = new Float32Array(particles * 3);
  const seed = new Float32Array(particles * 4);
  for (let start = 0; start < particles; start += SLICE) {
    const end = Math.min(particles, start + SLICE);
    for (let i = start; i < end; i++) {
      fib(i, particles, pos, i * 3);
      seed[i * 4] = hash(i * 1.13);
      seed[i * 4 + 1] = hash(i * 2.71 + 3.1);
      seed[i * 4 + 2] = hash(i * 0.57 + 9.4);
      seed[i * 4 + 3] = Math.pow(hash(i * 3.33 + 1.7), 2.2);
    }
    await yieldToMain();
  }

  // --- sparks: little satellites on crossing orbits
  const orbit = new Float32Array(sparks * 4);
  const twinkle = new Float32Array(sparks);
  for (let i = 0; i < sparks; i++) {
    const ring = i % 5;
    orbit[i * 4] = 1.38 + ring * 0.09 + hash(i * 7.1) * 0.12;
    orbit[i * 4 + 1] = (0.6 + hash(i * 4.4) * 0.8) * (ring % 2 ? -1 : 1);
    orbit[i * 4 + 2] = hash(i * 9.9) * Math.PI * 2;
    orbit[i * 4 + 3] = 0.35 + ring * 0.55;
    twinkle[i] = hash(i * 5.5 + 2.2);
  }

  // --- light streams: comet trails on tilted loops (per point: s, radius, speed, phase | tilt x, tilt z, wobble, hue)
  const sCount = s.streams * s.streamPoints;
  const streamA = new Float32Array(sCount * 4);
  const streamB = new Float32Array(sCount * 4);
  for (let k = 0; k < s.streams; k++) {
    const radius = 0.72 + hash(k * 3.7 + 1.1) * 0.5;
    const speed = (0.35 + hash(k * 6.1) * 0.45) * (k % 3 === 0 ? -1 : 1);
    const phase = hash(k * 2.3 + 0.7);
    const tiltX = (hash(k * 4.9) - 0.5) * 2.6;
    const tiltZ = (hash(k * 8.3 + 2) - 0.5) * 2.2;
    const wobble = 0.05 + hash(k * 5.7) * 0.22;
    const hue = hash(k * 9.1 + 4.4);
    for (let j = 0; j < s.streamPoints; j++) {
      const v = k * s.streamPoints + j;
      streamA[v * 4] = j / (s.streamPoints - 1);
      streamA[v * 4 + 1] = radius;
      streamA[v * 4 + 2] = speed;
      streamA[v * 4 + 3] = phase;
      streamB[v * 4] = tiltX;
      streamB[v * 4 + 1] = tiltZ;
      streamB[v * 4 + 2] = wobble;
      streamB[v * 4 + 3] = hue;
    }
  }

  // --- dust: a deep field of motes, mostly behind the mind, a few close to the camera (bokeh)
  const dustPos = new Float32Array(s.dust * 3);
  const dustSeed = new Float32Array(s.dust * 4);
  for (let i = 0; i < s.dust; i++) {
    dustPos[i * 3] = (hash(i * 1.7 + 0.2) - 0.5) * 14;
    dustPos[i * 3 + 1] = (hash(i * 2.9 + 1.3) - 0.5) * 8;
    dustPos[i * 3 + 2] = -6.5 + Math.pow(hash(i * 3.1 + 2.4), 0.8) * 9.2;
    dustSeed[i * 4] = hash(i * 4.3);
    dustSeed[i * 4 + 1] = hash(i * 5.9 + 1);
    dustSeed[i * 4 + 2] = hash(i * 7.7 + 2);
    dustSeed[i * 4 + 3] = Math.pow(hash(i * 8.8 + 3), 2);
  }
  await yieldToMain();

  // --- filaments: great-circle arcs between shell points 25-70 degrees apart, lifted by sin(pi t) * 0.12
  const verts = filaments * ARC_SEGMENTS * 2;
  const filPos = new Float32Array(verts * 3);
  const filT = new Float32Array(verts);
  const filSeed = new Float32Array(verts * 2);
  const A = [0, 0, 0];
  const B = [0, 0, 0];
  const lo = Math.cos((70 * Math.PI) / 180);
  const hi = Math.cos((25 * Math.PI) / 180);
  let v = 0;
  for (let k = 0; k < filaments; k++) {
    fib(Math.floor(hash(k * 1.91 + 0.3) * particles), particles, A);
    let d = 1;
    for (let tries = 0; tries < 32; tries++) {
      fib(Math.floor(hash(k * 5.3 + tries * 1.7 + 2.2) * particles), particles, B);
      d = A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
      if (d >= lo && d <= hi) break;
    }
    const om = Math.acos(Math.min(1, Math.max(-1, d)));
    const so = Math.sin(om) || 1;
    const phase = hash(k * 8.1);
    const speed = hash(k * 2.9 + 4);
    for (let sg = 0; sg < ARC_SEGMENTS; sg++) {
      for (let e = 0; e < 2; e++) {
        const t = (sg + e) / ARC_SEGMENTS;
        const wa = Math.sin((1 - t) * om) / so;
        const wb = Math.sin(t * om) / so;
        const lift = 1 + Math.sin(Math.PI * t) * 0.12;
        filPos[v * 3] = (A[0] * wa + B[0] * wb) * lift;
        filPos[v * 3 + 1] = (A[1] * wa + B[1] * wb) * lift;
        filPos[v * 3 + 2] = (A[2] * wa + B[2] * wb) * lift;
        filT[v] = t;
        filSeed[v * 2] = phase;
        filSeed[v * 2 + 1] = speed;
        v++;
      }
    }
  }
  await yieldToMain();
  return { noise, pos, seed, orbit, twinkle, filPos, filT, filSeed, streamA, streamB, dustPos, dustSeed };
}

export const CAMERA = { position: [0, 0, CAM_Z] as [number, number, number], fov: FOV, near: 0.1, far: 30 };

const additivePoints = { transparent: true, depthWrite: false, depthTest: true, blending: AdditiveBlending };

export class OrbEngine {
  /** the object R3F mounts */
  readonly world = new Group();
  private readonly root = new Group();
  private readonly tilt = new Group();
  private readonly dust = new Group();
  private readonly noiseTex: Data3DTexture;
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: ShaderMaterial[] = [];
  private readonly shellMat: ShaderMaterial;
  private readonly sparkMat: ShaderMaterial;
  private readonly streamMat: ShaderMaterial;
  private readonly haloMat: ShaderMaterial;
  private readonly glassMat: ShaderMaterial;
  private readonly glass: Mesh;
  private readonly dustMat: ShaderMaterial | null = null;
  private readonly filMat: ShaderMaterial | null = null;
  private readonly baseSize: number;

  // chapter palette, shared by reference with every material's uColA / uColB / uColC
  private readonly colA = new Color();
  private readonly colB = new Color();
  private readonly colC = new Color();
  private wL = 1;
  private wT = 0;
  private wS = 0;

  // smoothed state
  private time = 0;
  private flow = 0;
  private waveT = 0;
  private ringDir = 0;
  private energy = 0;
  private think = 0;
  private swirl = 0;
  private speak = 0;
  private spin = 0;
  private sparkSpin = 0;
  private lean = 0;
  private yaw = 0;
  private pitch = 0;
  private open = 0;
  private focus = 0;
  private bright = 0;
  private intro = 0;
  private introOn = false;
  private firstFrame = true;
  private readonly ripples = [
    new Vector4(0, 0, 1, -1),
    new Vector4(0, 0, 1, -1),
    new Vector4(0, 0, 1, -1),
    new Vector4(0, 0, 1, -1),
  ];
  private rippleSlot = 0;

  // scratch objects (reused every frame)
  private readonly ndc = new Vector2();
  private readonly raycaster = new Raycaster();
  private readonly sphere = new Sphere(new Vector3(), RADIUS);
  private readonly hit = new Vector3();
  private readonly pointerDir = new Vector3(0, 0, 1);
  private readonly target = new Vector3();
  private readonly quat = new Quaternion();

  /** Build the engine in short, yielding steps so no single task blocks the main thread for long. */
  static async create(settings: TierSettings): Promise<OrbEngine> {
    const attrs = await buildAttributes(settings);
    return new OrbEngine(settings, attrs);
  }

  private geo(attrs: Record<string, [Float32Array, number]>, radius: number) {
    const g = new BufferGeometry();
    for (const name in attrs) g.setAttribute(name, new BufferAttribute(attrs[name][0], attrs[name][1]));
    g.boundingSphere = new Sphere(new Vector3(), radius);
    this.geos.push(g);
    return g;
  }

  private mat(m: ShaderMaterial) {
    this.mats.push(m);
    return m;
  }

  private constructor(settings: TierSettings, attrs: Attributes) {
    const { particles } = settings;
    const tex = new Data3DTexture(attrs.noise, NOISE_N, NOISE_N, NOISE_N);
    tex.format = RGBAFormat;
    tex.type = UnsignedByteType;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    this.noiseTex = tex;
    this.applyPalette();

    const palette = { uColA: { value: this.colA }, uColB: { value: this.colB }, uColC: { value: this.colC } };
    const noise = { uNoise: { value: tex } };

    // fewer particles -> slightly bigger points so the orb keeps its density
    this.baseSize = 10.5 * Math.pow(60000 / particles, 0.33);

    // --- halo: glow, rays, waveform and sound rings on one camera-facing quad (camera never rotates)
    this.haloMat = this.mat(
      new ShaderMaterial({
        vertexShader: haloVertex,
        fragmentShader: haloFragment,
        defines: settings.rays ? { RAYS: "" } : {},
        transparent: false,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        uniforms: {
          ...noise,
          ...palette,
          uTime: { value: 0 },
          uWaveT: { value: 0 },
          uDir: { value: 0 },
          uLevel: { value: 0 },
          uRing: { value: 0 },
          uRays: { value: 0 },
          uGlow: { value: 0 },
          uIntro: { value: 0 },
        },
      }),
    );
    const haloGeo = new PlaneGeometry(7, 7);
    this.geos.push(haloGeo);
    const halo = new Mesh(haloGeo, this.haloMat);
    halo.renderOrder = -2;
    halo.frustumCulled = false;

    // --- glass core: opaque dark glass, writes depth (hides far-side particles and the halo behind it)
    this.glassMat = this.mat(
      new ShaderMaterial({
        vertexShader: glassVertex,
        fragmentShader: glassFragment,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        uniforms: { ...noise, ...palette, uTime: { value: 0 }, uGlow: { value: 0 }, uIntro: { value: 0 } },
      }),
    );
    const glassGeo = new SphereGeometry(GLASS_R, settings.glassSegments, Math.round(settings.glassSegments * 0.75));
    this.geos.push(glassGeo);
    this.glass = new Mesh(glassGeo, this.glassMat);
    this.glass.renderOrder = -1;

    // --- shell
    this.shellMat = this.mat(
      new ShaderMaterial({
        vertexShader: shellVertex,
        fragmentShader: pointFragment,
        defines: settings.bokeh ? { BOKEH: "" } : {},
        ...additivePoints,
        uniforms: {
          ...noise,
          ...palette,
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uThink: { value: 0 },
          uSpeak: { value: 0 },
          uSwirl: { value: 0 },
          uSize: { value: this.baseSize },
          uPixelRatio: { value: 1 },
          uPointer: { value: this.pointerDir },
          uPointerStrength: { value: 0 },
          uRipples: { value: this.ripples },
          uIntro: { value: 0 },
          uOpen: { value: 0 },
          uListen: { value: 0 },
          uFocus: { value: 0 },
          uBright: { value: 0 },
        },
      }),
    );
    const shell = new Points(this.geo({ position: [attrs.pos, 3], aSeed: [attrs.seed, 4] }, 2), this.shellMat);
    shell.frustumCulled = false;
    shell.renderOrder = 1;

    // --- light streams
    const sCount = settings.streams * settings.streamPoints;
    this.streamMat = this.mat(
      new ShaderMaterial({
        vertexShader: streamVertex,
        fragmentShader: pointFragment,
        ...additivePoints,
        uniforms: {
          ...noise,
          ...palette,
          uTime: { value: 0 },
          uFlow: { value: 0 },
          uThink: { value: 0 },
          uSpeak: { value: 0 },
          uOpen: { value: 0 },
          uSize: { value: 14 },
          uPixelRatio: { value: 1 },
          uIntro: { value: 0 },
        },
      }),
    );
    const streams = new Points(
      this.geo(
        { position: [new Float32Array(sCount * 3), 3], aA: [attrs.streamA, 4], aB: [attrs.streamB, 4] },
        2.5,
      ),
      this.streamMat,
    );
    streams.frustumCulled = false;
    streams.renderOrder = 2;

    // --- sparks
    this.sparkMat = this.mat(
      new ShaderMaterial({
        vertexShader: sparkVertex,
        fragmentShader: pointFragment,
        ...additivePoints,
        uniforms: {
          ...palette,
          uTime: { value: 0 },
          uThink: { value: 0 },
          uSpin: { value: 0 },
          uSize: { value: 14 },
          uPixelRatio: { value: 1 },
          uIntro: { value: 0 },
          uOpen: { value: 0 },
        },
      }),
    );
    const sparkPoints = new Points(
      this.geo(
        {
          position: [new Float32Array(settings.sparks * 3), 3],
          aOrbit: [attrs.orbit, 4],
          aTwinkle: [attrs.twinkle, 1],
        },
        2,
      ),
      this.sparkMat,
    );
    sparkPoints.frustumCulled = false;
    sparkPoints.renderOrder = 2;

    this.root.add(halo, this.tilt);
    this.tilt.add(this.glass, shell, streams, sparkPoints);

    // --- synapse filaments ("neural lines"): one LineSegments, pulses travel along each arc
    if (settings.filaments > 0) {
      const mat = this.mat(
        new ShaderMaterial({
          vertexShader: filamentVertex,
          fragmentShader: filamentFragment,
          ...additivePoints,
          uniforms: {
            ...noise,
            ...palette,
            uTime: { value: 0 },
            uEnergy: { value: 0 },
            uThink: { value: 0 },
            uSwirl: { value: 0 },
            uOpen: { value: 0 },
            uVis: { value: 0 },
          },
        }),
      );
      const lines = new LineSegments(
        this.geo({ position: [attrs.filPos, 3], aT: [attrs.filT, 1], aSeed: [attrs.filSeed, 2] }, 2),
        mat,
      );
      lines.frustumCulled = false;
      lines.renderOrder = 2;
      this.tilt.add(lines);
      this.filMat = mat;
    }

    // --- dust: depth layer outside the root, so it stays put while the mind moves with the scroll
    if (settings.dust > 0) {
      const mat = this.mat(
        new ShaderMaterial({
          vertexShader: dustVertex,
          fragmentShader: pointFragment,
          ...additivePoints,
          uniforms: {
            ...palette,
            uTime: { value: 0 },
            uSize: { value: 16 },
            uPixelRatio: { value: 1 },
            uIntro: { value: 0 },
          },
        }),
      );
      const pts = new Points(this.geo({ position: [attrs.dustPos, 3], aSeed: [attrs.dustSeed, 4] }, 12), mat);
      pts.frustumCulled = false;
      pts.renderOrder = 0;
      this.dust.add(pts);
      this.dustMat = mat;
    }
    this.world.add(this.dust, this.root);
  }

  /** Blend the three chapter palettes by the current weights into the shared colours. */
  private applyPalette() {
    const { wL, wT, wS } = this;
    const mix = (i: number) => PAL_LISTEN[i] * wL + PAL_THINK[i] * wT + PAL_SPEAK[i] * wS;
    this.colA.setRGB(mix(0), mix(1), mix(2));
    this.colB.setRGB(mix(3), mix(4), mix(5));
    this.colC.setRGB(mix(6), mix(7), mix(8));
  }

  /** The orb "switches on": particles converge, then the glow and the glass light up. */
  startIntro() {
    this.introOn = true;
  }

  /**
   * Advance one frame. Returns true while something is still moving towards its target,
   * so the caller knows whether another frame is needed (render on demand).
   */
  update(dt: number, camera: PerspectiveCamera, viewportHeight: number, pixelRatio: number, reduced: boolean) {
    const s = orbSignal;
    const snap = this.firstFrame;
    this.firstFrame = false;
    const aspect = camera.aspect;

    // ---------- intro (instant in reduced motion)
    if (reduced) this.intro = 1;
    else if (this.introOn && this.intro < 1) this.intro = Math.min(1, this.intro + dt / INTRO_S);
    const introMoving = this.intro < 1 && this.introOn;
    const lightsOn = easeOut((this.intro - 0.25) / 0.75); // glow + glass ramp in behind the particles

    // ---------- layout from scroll: hero -> demo (a cut instead of a sweep in reduced motion)
    const halfW = HALF_H * aspect;
    const prog = smoothstep(0.12, 0.7, s.scroll);
    const t = reduced ? (prog > 0.5 ? 1 : 0) : prog;
    const kPos = reduced || snap ? 1 : damp(6, dt);

    // "the mind opens" at mid-scroll: 0 at hero, 1 halfway, 0 beside the chat
    const openTarget = reduced ? 0 : Math.sin(Math.PI * t);
    this.open += (openTarget - this.open) * kPos;
    const open = this.open;

    let x: number;
    let y: number;
    let scale: number;
    if (aspect >= 1.15) {
      x = halfW * (0.46 + (-0.45 - 0.46) * t);
      y = HALF_H * 0.03 * (1 - t);
      scale = 1 - 0.1 * t;
    } else {
      const base = Math.min(0.95, Math.max(0.5, aspect * 1.2));
      x = 0;
      y = HALF_H * (0.52 + 0.16 * t);
      scale = base * (1 - 0.42 * t);
    }
    scale *= 1 + 0.35 * open;
    const r = this.root;
    r.position.x += (x - r.position.x) * kPos;
    r.position.y += (y - r.position.y) * kPos;
    const sc = r.scale.x + (scale - r.scale.x) * kPos;
    r.scale.setScalar(sc);
    const layoutMoving =
      Math.abs(x - r.position.x) + Math.abs(y - r.position.y) + Math.abs(scale - sc) + Math.abs(openTarget - open) >
      0.002;

    // dolly-zoom feel without moving the camera: the FOV narrows while the root grows
    const fov = FOV + (FOV_OPEN - FOV) * open;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // ---------- cursor
    let leanTarget = 0;
    if (s.pointerActive) {
      this.ndc.set(s.ndcX, s.ndcY);
      this.raycaster.setFromCamera(this.ndc, camera);
      this.sphere.center.copy(r.position);
      this.sphere.radius = RADIUS * 1.25 * sc;
      if (this.raycaster.ray.intersectSphere(this.sphere, this.hit)) {
        this.tilt.worldToLocal(this.target.copy(this.hit)).normalize();
        this.pointerDir.lerp(this.target, damp(10, dt)).normalize();
        leanTarget = 1;
      }
    }
    this.lean += (leanTarget - this.lean) * damp(5, dt);
    const yawTarget = s.pointerActive ? s.ndcX * 0.3 : 0;
    const pitchTarget = s.pointerActive ? -s.ndcY * 0.2 : 0;
    this.yaw += (yawTarget - this.yaw) * damp(3, dt);
    this.pitch += (pitchTarget - this.pitch) * damp(3, dt);

    // ---------- typing, thinking, speaking
    s.pulse *= Math.exp(-dt * 1.6);
    this.energy += (s.pulse - this.energy) * damp(8, dt);
    this.think += ((s.thinking ? 1 : 0) - this.think) * damp(s.thinking ? 3 : 1.6, dt);
    this.swirl += dt * this.think * 2.2;
    if (s.speakKick > 0) {
      this.speak = Math.min(1, this.speak + 0.5 * s.speakKick);
      s.speakKick = 0;
    }
    const speakFloor = s.speaking ? 0.12 : 0;
    this.speak = speakFloor + (this.speak - speakFloor) * Math.exp(-dt * 5);

    // ---------- chapters: listens (hero, typing) -> thinks (open disc, sending) -> speaks (beside the chat, answering)
    const cL = 1 - smoothstep(0, 0.45, t);
    const cS = smoothstep(0.55, 1, t);
    const rL = cL + Math.min(1, this.energy * 1.2);
    const rT = open + 1.6 * this.think + 0.6 * (s.thinking ? 1 : 0);
    const rS = cS + 1.4 * this.speak + (s.speaking ? 0.8 : 0);
    const sum = rL + rT + rS || 1;
    const kPal = reduced || snap ? 1 : damp(3, dt);
    this.wL += (rL / sum - this.wL) * kPal;
    this.wT += (rT / sum - this.wT) * kPal;
    this.wS += (rS / sum - this.wS) * kPal;
    this.applyPalette();
    const paletteMoving = Math.abs(rL / sum - this.wL) + Math.abs(rT / sum - this.wT) > 0.004;
    const dirTarget = rS > rL ? 1 : 0;
    this.ringDir += (dirTarget - this.ringDir) * (reduced ? 1 : damp(2, dt));

    // ---------- mind mode (Calm / Focus / Bright): damped weights, uniforms only
    const focusTarget = s.mode === 1 ? 1 : 0;
    const brightTarget = s.mode === 2 ? 1 : 0;
    const kMode = reduced ? 1 : damp(4, dt);
    this.focus += (focusTarget - this.focus) * kMode;
    this.bright += (brightTarget - this.bright) * kMode;
    const modeMoving = Math.abs(focusTarget - this.focus) + Math.abs(brightTarget - this.bright) > 0.005;

    // new ripples start on the side facing the viewer, scattered by the typed character
    while (s.pendingRipples.length) {
      const h = s.pendingRipples.pop() as number;
      const slot = this.ripples[this.rippleSlot];
      this.rippleSlot = (this.rippleSlot + 1) % this.ripples.length;
      this.target.set(Math.sin(h * 1.7) * 0.75, Math.cos(h * 2.3) * 0.55, 0.9).normalize();
      this.tilt.getWorldQuaternion(this.quat).invert();
      this.target.applyQuaternion(this.quat);
      slot.set(this.target.x, this.target.y, this.target.z, 0);
    }
    let ripplesAlive = false;
    for (let i = 0; i < this.ripples.length; i++) {
      const rp = this.ripples[i];
      if (rp.w < 0) continue;
      rp.w += dt;
      if (rp.w > 2.6) rp.w = -1;
      else ripplesAlive = true;
    }

    // ---------- time & spin (autonomous drift only with full motion)
    const reacting = s.thinking || s.speaking;
    const drift = reduced ? (reacting ? 0.5 : 0) : 1;
    this.time += dt * drift * (1 + this.think * 1.2 + this.energy * 0.6);
    this.flow += dt * drift * (1 + this.think * 1.8 + this.speak * 1.2 + this.energy * 0.8 + open * 0.8);
    this.waveT += dt * drift * (1 + this.speak * 2 + this.energy * 2.5);
    this.spin += dt * ((reduced ? 0 : 0.06) + this.think * (reduced ? 0.2 : 0.8));
    this.sparkSpin += dt * ((reduced ? 0 : 0.22) + this.think * 0.7 + this.speak * 0.3);

    this.tilt.rotation.set(this.pitch, this.spin + this.yaw, 0);
    // depth layer: the dust drifts slowly and parallaxes against the cursor and the scroll
    this.dust.rotation.set(-this.pitch * 0.25, this.time * 0.01 - this.yaw * 0.3, 0);
    this.dust.position.y = s.scroll * 1.4;

    // ---------- uniforms
    const sizeScale = Math.min(1.6, Math.max(0.65, viewportHeight / 900));
    const listen = Math.max(cL * 0.75, Math.min(1, this.energy * 1.4)) * (1 - open);
    const glow = lightsOn * (0.3 + 0.8 * this.think + 1.0 * this.speak + 0.5 * open + 0.3 * this.energy + 0.25 * this.bright);

    const u = this.shellMat.uniforms;
    u.uTime.value = this.time;
    u.uEnergy.value = this.energy;
    u.uThink.value = this.think;
    u.uSpeak.value = this.speak;
    u.uSwirl.value = this.swirl;
    u.uPixelRatio.value = pixelRatio;
    u.uSize.value = this.baseSize * sizeScale;
    u.uPointerStrength.value = this.lean;
    u.uIntro.value = this.intro;
    u.uOpen.value = open;
    u.uListen.value = listen;
    u.uFocus.value = this.focus;
    u.uBright.value = this.bright;

    const st = this.streamMat.uniforms;
    st.uTime.value = this.time;
    st.uFlow.value = this.flow;
    st.uThink.value = this.think;
    st.uSpeak.value = this.speak;
    st.uOpen.value = open;
    st.uPixelRatio.value = pixelRatio;
    st.uSize.value = 14 * sizeScale;
    st.uIntro.value = lightsOn;

    const su = this.sparkMat.uniforms;
    su.uTime.value = this.time;
    su.uThink.value = this.think;
    su.uSpin.value = this.sparkSpin;
    su.uPixelRatio.value = pixelRatio;
    su.uSize.value = 14 * sizeScale * (1 + 0.4 * this.bright);
    su.uIntro.value = easeOut(this.intro);
    su.uOpen.value = open;

    const hu = this.haloMat.uniforms;
    hu.uTime.value = this.time;
    hu.uWaveT.value = this.waveT;
    hu.uDir.value = this.ringDir;
    hu.uLevel.value = (0.45 + 0.45 * cL + 0.3 * cS + this.energy * 1.2 + this.speak) * (1 - 0.75 * open);
    hu.uRing.value = Math.min(1.5, 0.45 + 0.4 * Math.max(cL, cS) + this.energy + this.speak) * (1 - 0.8 * open);
    hu.uRays.value = 0.4 + 0.65 * open + 0.4 * this.speak + 0.3 * this.think;
    hu.uGlow.value = glow;
    hu.uIntro.value = lightsOn;

    const gu = this.glassMat.uniforms;
    gu.uTime.value = this.time;
    gu.uGlow.value = glow;
    gu.uIntro.value = lightsOn;
    this.glass.scale.setScalar(
      (0.6 + 0.4 * lightsOn) * (1 + 0.05 * this.energy + 0.08 * this.speak) * (1 - 0.45 * open),
    );
    if (!reduced) this.glass.rotation.y += dt * 0.12;

    if (this.dustMat) {
      const du = this.dustMat.uniforms;
      du.uTime.value = this.time;
      du.uPixelRatio.value = pixelRatio;
      du.uSize.value = 16 * sizeScale;
      du.uIntro.value = lightsOn;
    }

    if (this.filMat) {
      const fu = this.filMat.uniforms;
      fu.uTime.value = this.time;
      fu.uEnergy.value = this.energy;
      fu.uThink.value = this.think;
      fu.uSwirl.value = this.swirl;
      fu.uOpen.value = open;
      // 0.1 idle (0.25 in Focus), up to 1 thinking / in the open disc, +0.4 on word beats
      const idle = 0.1 + 0.15 * this.focus;
      const vis = Math.max(idle + 0.8 * this.think + 0.4 * this.speak, 1.0 * open);
      fu.uVis.value = lightsOn * Math.min(1, vis);
    }

    return (
      layoutMoving ||
      introMoving ||
      modeMoving ||
      paletteMoving ||
      ripplesAlive ||
      reacting ||
      this.energy > 0.01 ||
      this.think > 0.01 ||
      this.speak > 0.01 ||
      Math.abs(dirTarget - this.ringDir) > 0.01 ||
      Math.abs(leanTarget - this.lean) > 0.01 ||
      Math.abs(yawTarget - this.yaw) + Math.abs(pitchTarget - this.pitch) > 0.002
    );
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.noiseTex.dispose();
  }
}

/*
  Adaptive resolution: lowers the pixel ratio when drawn frames get slow and raises it again
  after 2 s of headroom. Only consecutive frames count (render-on-demand gaps are ignored),
  and a raise that has to be undone twice stops further raises so the canvas never bounces.
*/
export class AdaptiveDpr {
  private avg = 16.7;
  private settleUntil = 0;
  private calmSince = 0;
  private lastRaise = -1e9;
  private bounces = 0;
  private dpr: number;
  private readonly cap: number;
  private readonly apply: (dpr: number) => void;

  constructor(cap: number, apply: (dpr: number) => void) {
    this.cap = cap;
    this.apply = apply;
    this.dpr = cap;
  }

  private set(value: number, now: number) {
    this.dpr = value;
    this.apply(value);
    this.settleUntil = now + 700;
    this.calmSince = 0;
    this.avg = 16.7;
  }

  frame(deltaMs: number, now: number) {
    if (deltaMs < 4 || deltaMs > 100) return;
    this.avg += (deltaMs - this.avg) * 0.1;
    if (now < this.settleUntil) return;
    const floor = Math.min(1, this.cap) * 0.75;
    if (this.avg > 22 && this.dpr > floor) {
      if (now - this.lastRaise < 3000) this.bounces++;
      this.set(Math.max(floor, Math.min(this.dpr - 0.25, this.dpr * Math.sqrt(17.5 / this.avg))), now);
    } else if (this.avg < 17.8 && this.dpr < this.cap && this.bounces < 2) {
      if (!this.calmSince) this.calmSince = now;
      if (now - this.calmSince > 2000) {
        this.set(Math.min(this.cap, this.dpr + 0.25), now);
        this.lastRaise = now;
      }
    } else this.calmSince = 0;
  }
}
