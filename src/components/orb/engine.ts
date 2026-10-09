/*
  The particle mind, as a plain class so the per-frame work never touches React.
  Hierarchy: root (layout: position/scale from scroll) -> core glow
                                                     -> tilt (cursor lean + spin) -> shell, sparks
  Everything that changes per frame is preallocated here (no allocations in update()).
*/
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  Quaternion,
  Raycaster,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { orbSignal } from "@/lib/orb-signal";
import { coreFragment, coreVertex, pointFragment, shellVertex, sparkVertex } from "./shaders";

const CAM_Z = 4.2;
const FOV = 40;
const HALF_H = CAM_Z * Math.tan(((FOV / 2) * Math.PI) / 180);
const RADIUS = 1.15;

// deterministic pseudo-random in [0, 1)
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export const CAMERA = { position: [0, 0, CAM_Z] as [number, number, number], fov: FOV, near: 0.1, far: 20 };

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

  constructor(particles: number, sparks: number) {
    // --- shell: Fibonacci sphere home points + 4 random seeds per particle
    const pos = new Float32Array(particles * 3);
    const seed = new Float32Array(particles * 4);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < particles; i++) {
      const y = 1 - ((i + 0.5) / particles) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      pos[i * 3] = Math.cos(th) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(th) * r;
      seed[i * 4] = hash(i * 1.13);
      seed[i * 4 + 1] = hash(i * 2.71 + 3.1);
      seed[i * 4 + 2] = hash(i * 0.57 + 9.4);
      seed[i * 4 + 3] = Math.pow(hash(i * 3.33 + 1.7), 2.2);
    }
    this.shellGeo.setAttribute("position", new BufferAttribute(pos, 3));
    this.shellGeo.setAttribute("aSeed", new BufferAttribute(seed, 4));
    this.shellGeo.boundingSphere = new Sphere(new Vector3(), 2);

    // fewer particles -> slightly bigger points so the orb keeps its density
    this.baseSize = 10.5 * Math.pow(60000 / particles, 0.33);

    this.shellMat = new ShaderMaterial({
      vertexShader: shellVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
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
      },
    });
    const shell = new Points(this.shellGeo, this.shellMat);
    shell.frustumCulled = false;

    // --- sparks: little satellites on crossing orbits
    const orbit = new Float32Array(sparks * 4);
    const twinkle = new Float32Array(sparks);
    const sparkPos = new Float32Array(sparks * 3);
    for (let i = 0; i < sparks; i++) {
      const ring = i % 5;
      orbit[i * 4] = 1.38 + ring * 0.09 + hash(i * 7.1) * 0.12;
      orbit[i * 4 + 1] = (0.6 + hash(i * 4.4) * 0.8) * (ring % 2 ? -1 : 1);
      orbit[i * 4 + 2] = hash(i * 9.9) * Math.PI * 2;
      orbit[i * 4 + 3] = 0.35 + ring * 0.55;
      twinkle[i] = hash(i * 5.5 + 2.2);
    }
    this.sparkGeo.setAttribute("position", new BufferAttribute(sparkPos, 3));
    this.sparkGeo.setAttribute("aOrbit", new BufferAttribute(orbit, 4));
    this.sparkGeo.setAttribute("aTwinkle", new BufferAttribute(twinkle, 1));
    this.sparkGeo.boundingSphere = new Sphere(new Vector3(), 2);
    this.sparkMat = new ShaderMaterial({
      vertexShader: sparkVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uThink: { value: 0 },
        uSpin: { value: 0 },
        uSize: { value: 14 },
        uPixelRatio: { value: 1 },
      },
    });
    const sparkPoints = new Points(this.sparkGeo, this.sparkMat);
    sparkPoints.frustumCulled = false;

    // --- core glow (a camera-facing quad; the camera never rotates)
    this.coreMat = new ShaderMaterial({
      vertexShader: coreVertex,
      fragmentShader: coreFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: { uEnergy: { value: 0 }, uThink: { value: 0 }, uSpeak: { value: 0 } },
    });
    const core = new Mesh(this.coreGeo, this.coreMat);
    core.renderOrder = -1;

    this.tilt.add(shell, sparkPoints);
    this.root.add(core, this.tilt);
  }

  /**
   * Advance one frame. Returns true while something is still moving towards its target,
   * so the caller knows whether another frame is needed (render on demand).
   */
  update(dt: number, camera: Camera, aspect: number, viewportHeight: number, pixelRatio: number, reduced: boolean) {
    const s = orbSignal;
    const snap = this.firstFrame;
    this.firstFrame = false;

    // ---------- layout from scroll: hero -> demo (a cut instead of a sweep in reduced motion)
    const halfW = HALF_H * aspect;
    const prog = smoothstep(0.12, 0.7, s.scroll);
    const t = reduced ? (prog > 0.5 ? 1 : 0) : prog;
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
    const kPos = reduced || snap ? 1 : damp(6, dt);
    const r = this.root;
    r.position.x += (x - r.position.x) * kPos;
    r.position.y += (y - r.position.y) * kPos;
    const sc = r.scale.x + (scale - r.scale.x) * kPos;
    r.scale.setScalar(sc);
    const layoutMoving = Math.abs(x - r.position.x) + Math.abs(y - r.position.y) + Math.abs(scale - sc) > 0.002;

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
    const su = this.sparkMat.uniforms;
    su.uTime.value = this.time;
    su.uThink.value = this.think;
    su.uSpin.value = this.sparkSpin;
    su.uPixelRatio.value = pixelRatio;
    su.uSize.value = 14 * sizeScale;
    const cu = this.coreMat.uniforms;
    cu.uEnergy.value = this.energy;
    cu.uThink.value = this.think;
    cu.uSpeak.value = this.speak;

    return (
      layoutMoving ||
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
