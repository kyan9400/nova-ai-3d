/*
  The particle mind, as a plain class so the per-frame work never touches React.
  Hierarchy: root (layout: position/scale from scroll) -> core glow
                                                     -> tilt (cursor lean + spin) -> nucleus, shell, sparks, filaments
  Draw order: glow -> nucleus -> shell -> sparks/filaments (glow and nucleus sit in the opaque pass).
  Everything that changes per frame is preallocated here (no allocations in update()).
*/
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  Quaternion,
  Raycaster,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { orbSignal } from "@/lib/orb-signal";
import type { TierSettings } from "@/lib/quality";
import {
  coreFragment,
  coreVertex,
  filamentFragment,
  filamentVertex,
  pointFragment,
  shellVertex,
  sparkVertex,
} from "./shaders";

const CAM_Z = 4.2;
const FOV = 40;
const FOV_OPEN = 32;
const HALF_H = CAM_Z * Math.tan(((FOV / 2) * Math.PI) / 180);
const RADIUS = 1.15;
const INTRO_S = 1.8;
const ARC_SEGMENTS = 12;

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
  pos: Float32Array;
  seed: Float32Array;
  orbit: Float32Array;
  twinkle: Float32Array;
  filPos: Float32Array;
  filT: Float32Array;
  filSeed: Float32Array;
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

/** Shell, spark and filament attributes, generated in slices with a yield between them. */
async function buildAttributes(particles: number, sparks: number, filaments: number): Promise<Attributes> {
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
    for (let s = 0; s < ARC_SEGMENTS; s++) {
      for (let e = 0; e < 2; e++) {
        const t = (s + e) / ARC_SEGMENTS;
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
  return { pos, seed, orbit, twinkle, filPos, filT, filSeed };
}

export const CAMERA = { position: [0, 0, CAM_Z] as [number, number, number], fov: FOV, near: 0.1, far: 20 };

const SIGNAL = new Color(0xffd60a);

export class OrbEngine {
  readonly root = new Group();
  private readonly tilt = new Group();
  private readonly shellGeo = new BufferGeometry();
  private readonly sparkGeo = new BufferGeometry();
  private readonly coreGeo = new PlaneGeometry(4.2, 4.2);
  private readonly shellMat: ShaderMaterial;
  private readonly sparkMat: ShaderMaterial;
  private readonly coreMat: ShaderMaterial;
  private readonly baseSize: number;
  // optional per tier
  private readonly nucleus: Mesh<SphereGeometry, MeshPhysicalMaterial> | null = null;
  private readonly filGeo: BufferGeometry | null = null;
  private readonly filMat: ShaderMaterial | null = null;
  private envTarget: WebGLRenderTarget | null = null;

  // smoothed state
  private time = 0;
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
    const attrs = await buildAttributes(settings.particles, settings.sparks, settings.filaments);
    return new OrbEngine(settings, attrs);
  }

  private constructor(settings: TierSettings, attrs: Attributes) {
    const { particles } = settings;
    this.shellGeo.setAttribute("position", new BufferAttribute(attrs.pos, 3));
    this.shellGeo.setAttribute("aSeed", new BufferAttribute(attrs.seed, 4));
    this.shellGeo.boundingSphere = new Sphere(new Vector3(), 2);

    // fewer particles -> slightly bigger points so the orb keeps its density
    this.baseSize = 10.5 * Math.pow(60000 / particles, 0.33);

    // shell and sparks test depth (the nucleus hides far-side particles) but never write it
    this.shellMat = new ShaderMaterial({
      vertexShader: shellVertex,
      fragmentShader: pointFragment,
      defines: settings.bokeh ? { BOKEH: "" } : {},
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      uniforms: {
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
        uFocus: { value: 0 },
        uBright: { value: 0 },
      },
    });
    const shell = new Points(this.shellGeo, this.shellMat);
    shell.frustumCulled = false;
    shell.renderOrder = 1;

    // --- sparks (attributes from buildAttributes)
    const sparkPos = new Float32Array(settings.sparks * 3);
    this.sparkGeo.setAttribute("position", new BufferAttribute(sparkPos, 3));
    this.sparkGeo.setAttribute("aOrbit", new BufferAttribute(attrs.orbit, 4));
    this.sparkGeo.setAttribute("aTwinkle", new BufferAttribute(attrs.twinkle, 1));
    this.sparkGeo.boundingSphere = new Sphere(new Vector3(), 2);
    this.sparkMat = new ShaderMaterial({
      vertexShader: sparkVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uThink: { value: 0 },
        uSpin: { value: 0 },
        uSize: { value: 14 },
        uPixelRatio: { value: 1 },
        uIntro: { value: 0 },
        uOpen: { value: 0 },
      },
    });
    const sparkPoints = new Points(this.sparkGeo, this.sparkMat);
    sparkPoints.frustumCulled = false;
    sparkPoints.renderOrder = 2;

    // --- core glow (a camera-facing quad; the camera never rotates). transparent: false puts it in the
    // opaque pass so it draws before the nucleus; additive blending still applies.
    this.coreMat = new ShaderMaterial({
      vertexShader: coreVertex,
      fragmentShader: coreFragment,
      transparent: false,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: { uEnergy: { value: 0 }, uThink: { value: 0 }, uSpeak: { value: 0 }, uIntro: { value: 0 } },
    });
    const core = new Mesh(this.coreGeo, this.coreMat);
    core.renderOrder = -1;
    this.root.add(core, this.tilt);

    // --- pearl nucleus: a real material, undisplaced so its normals stay perfectly smooth
    if (settings.nucleus) {
      const mat = new MeshPhysicalMaterial({
        color: 0x1b1b1d,
        metalness: 0.2,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        iridescence: 1,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [180, 520],
        emissive: SIGNAL,
        emissiveIntensity: 0,
      });
      this.nucleus = new Mesh(new SphereGeometry(0.34, 96, 64), mat);
      this.nucleus.rotation.x = 0.3;
      this.tilt.add(this.nucleus);
    }

    this.tilt.add(shell, sparkPoints);

    // --- synapse filaments: one LineSegments, pulses travel along each arc
    if (settings.filaments > 0) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(attrs.filPos, 3));
      geo.setAttribute("aT", new BufferAttribute(attrs.filT, 1));
      geo.setAttribute("aSeed", new BufferAttribute(attrs.filSeed, 2));
      geo.boundingSphere = new Sphere(new Vector3(), 2);
      const mat = new ShaderMaterial({
        vertexShader: filamentVertex,
        fragmentShader: filamentFragment,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uThink: { value: 0 },
          uSwirl: { value: 0 },
          uOpen: { value: 0 },
          uVis: { value: 0 },
        },
      });
      const lines = new LineSegments(geo, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 2;
      this.tilt.add(lines);
      this.filGeo = geo;
      this.filMat = mat;
    }
  }

  /**
   * Studio lighting for the nucleus: a code-made RoomEnvironment, prefiltered once (no HDRI download).
   * Needs the renderer, so it runs after the canvas exists and before compileAsync / reveal.
   */
  attachEnvironment(renderer: WebGLRenderer) {
    if (!this.nucleus || this.envTarget) return;
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    this.nucleus.material.envMap = this.envTarget.texture;
    this.nucleus.material.needsUpdate = true;
    room.dispose();
    pmrem.dispose();
  }

  /** The orb "switches on": particles converge, then the glow and the nucleus light up. */
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
    const lightsOn = easeOut((this.intro - 0.25) / 0.75); // glow + nucleus ramp in behind the particles

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
      x = halfW * (0.42 + (-0.45 - 0.42) * t);
      y = 0;
      scale = 1 - 0.1 * t;
    } else {
      const base = Math.min(0.95, Math.max(0.5, aspect * 1.15));
      x = 0;
      y = HALF_H * (0.4 + 0.24 * t);
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
    this.spin += dt * ((reduced ? 0 : 0.06) + this.think * (reduced ? 0.2 : 0.8));
    this.sparkSpin += dt * ((reduced ? 0 : 0.22) + this.think * 0.7 + this.speak * 0.3);

    this.tilt.rotation.set(this.pitch, this.spin + this.yaw, 0);

    // ---------- uniforms
    const sizeScale = Math.min(1.6, Math.max(0.65, viewportHeight / 900));
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
    u.uFocus.value = this.focus;
    u.uBright.value = this.bright;
    const su = this.sparkMat.uniforms;
    su.uTime.value = this.time;
    su.uThink.value = this.think;
    su.uSpin.value = this.sparkSpin;
    su.uPixelRatio.value = pixelRatio;
    su.uSize.value = 14 * sizeScale * (1 + 0.4 * this.bright);
    su.uIntro.value = easeOut(this.intro);
    su.uOpen.value = open;
    const cu = this.coreMat.uniforms;
    cu.uEnergy.value = this.energy;
    cu.uThink.value = this.think;
    cu.uSpeak.value = this.speak;
    cu.uIntro.value = lightsOn;

    if (this.nucleus) {
      // breathes with energy and speech; the core lights up signal yellow when Nova answers
      const n = this.nucleus;
      n.scale.setScalar((0.6 + 0.4 * lightsOn) * (1 + 0.06 * this.energy + 0.1 * this.speak));
      if (!reduced) n.rotation.y += dt * 0.15;
      const glow = Math.max(0.25 * Math.max(this.speak, this.think), 0.12 * this.bright, 0.3 * open);
      n.material.emissiveIntensity = lightsOn * Math.min(0.3, glow);
    }

    if (this.filMat) {
      const fu = this.filMat.uniforms;
      fu.uTime.value = this.time;
      fu.uEnergy.value = this.energy;
      fu.uThink.value = this.think;
      fu.uSwirl.value = this.swirl;
      fu.uOpen.value = open;
      // 0.08 idle (0.25 in Focus), 0.6 thinking, +0.4 on word beats, 0.5 while the mind is open
      const idle = 0.08 + 0.17 * this.focus;
      const vis = Math.max(idle + 0.52 * this.think + 0.4 * this.speak, 0.5 * open);
      fu.uVis.value = lightsOn * Math.min(1, vis);
    }

    return (
      layoutMoving ||
      introMoving ||
      modeMoving ||
      ripplesAlive ||
      reacting ||
      this.energy > 0.01 ||
      this.think > 0.01 ||
      this.speak > 0.01 ||
      Math.abs(leanTarget - this.lean) > 0.01 ||
      Math.abs(yawTarget - this.yaw) + Math.abs(pitchTarget - this.pitch) > 0.002
    );
  }

  dispose() {
    this.shellGeo.dispose();
    this.sparkGeo.dispose();
    this.coreGeo.dispose();
    this.shellMat.dispose();
    this.sparkMat.dispose();
    this.coreMat.dispose();
    this.nucleus?.geometry.dispose();
    this.nucleus?.material.dispose();
    this.envTarget?.dispose();
    this.filGeo?.dispose();
    this.filMat?.dispose();
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
