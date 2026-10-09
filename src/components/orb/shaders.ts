/*
  GLSL for the particle mind. All particle motion happens on the GPU: each vertex starts at a
  home point on a sphere and is pushed around by a 3D simplex-noise field and by uniforms that
  the page drives (cursor, typing ripples, thinking, speaking).

  3D simplex noise: after Ian McEwan & Stefan Gustavson, "webgl-noise" (MIT) — see CREDITS.md.
*/

const noise = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

export const shellVertex = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uThink;
uniform float uSpeak;
uniform float uSwirl;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uPointer;
uniform float uPointerStrength;
uniform vec4 uRipples[4];

attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;

${noise}

const vec3 SIGNAL = vec3(1.0, 0.82, 0.04);
const vec3 SILVER = vec3(0.78, 0.80, 0.84);
const vec3 GLOW = vec3(1.0, 0.94, 0.66);
const vec3 DEEP = vec3(0.22, 0.22, 0.25);

void main() {
  vec3 home = position;
  // a thick shell: most particles near the surface, some drifting inside
  float layer = mix(0.55, 1.0, pow(aSeed.x, 0.3));
  vec3 p = home * layer;

  float t = uTime;
  vec3 q = p * 1.25 + vec3(0.0, t * 0.11, t * 0.07);
  float n1 = snoise(q);
  float n2 = snoise(q * 2.3 + vec3(5.2, 1.3, 7.7) - t * 0.05);

  // curl-like currents: three decorrelated noise samples bend each particle off its home
  vec3 flow = vec3(
    snoise(q + vec3(31.4, 0.0, 0.0)),
    snoise(q + vec3(0.0, 17.1, 0.0)),
    snoise(q + vec3(0.0, 0.0, 9.7))
  );
  p += flow * (0.10 + 0.10 * uEnergy + 0.06 * uThink) * (0.6 + 0.4 * layer);

  // breathing surface, louder with energy
  p *= 1.0 + n1 * (0.12 + 0.12 * uEnergy);

  // thinking: gather inwards and spin, inner layers faster
  p *= 1.0 - 0.16 * uThink;
  float a = uSwirl * (1.6 - layer);
  float ca = cos(a), sa = sin(a);
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;

  vec3 dir = normalize(p);

  // speaking: a radial beat with a travelling band from top to bottom
  float band = sin(dir.y * 9.0 - uTime * 6.0 + aSeed.y * 2.0);
  p += dir * uSpeak * (0.07 + 0.05 * band) * (0.4 + aSeed.z);

  // typing ripples: rings that run across the shell from where each key "landed"
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipples[i];
    if (r.w < 0.0) continue;
    float d = acos(clamp(dot(dir, normalize(r.xyz)), -1.0, 1.0));
    float front = r.w * 2.4;
    float k = (d - front) * 5.0;
    float w = exp(-k * k) * exp(-r.w * 1.4);
    ring += w;
  }
  p += dir * ring * 0.16;

  // cursor: the shell bulges and brightens where you point
  float pd = distance(dir, uPointer);
  float lean = exp(-pd * pd * 5.0) * uPointerStrength;
  p += dir * lean * 0.28;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float highlight = clamp(lean * 1.2 + ring * 1.5 + uSpeak * 0.25, 0.0, 1.6);
  float size = uSize * (0.55 + aSeed.w * 1.1) * (1.0 + highlight * 0.6) * (0.7 + 0.3 * layer);
  gl_PointSize = size * uPixelRatio / -mv.z;

  vec3 c = mix(DEEP, SILVER, smoothstep(0.55, 0.95, layer));
  c = mix(c, SIGNAL, smoothstep(0.3, 0.85, n1) * 0.9);
  c = mix(c, GLOW, smoothstep(0.45, 0.95, n2) * (0.25 + 0.65 * uThink));
  c += vec3(1.0, 0.86, 0.3) * highlight * 0.6;
  vColor = c;

  // fade the far side so the orb reads as a volume, not a flat disc
  float centerZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  float facing = clamp((mv.z - centerZ) * 0.6 + 0.5, 0.0, 1.0);
  vAlpha = mix(0.18, 0.95, facing) * (0.55 + 0.45 * aSeed.y);
}
`;

export const pointFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.05, 0.5, d);
  a *= a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

export const sparkVertex = /* glsl */ `
uniform float uTime;
uniform float uThink;
uniform float uSpin;
uniform float uSize;
uniform float uPixelRatio;
attribute vec4 aOrbit; // radius, speed, phase, tilt
attribute float aTwinkle;

varying vec3 vColor;
varying float vAlpha;

void main() {
  float ang = aOrbit.z + uSpin * aOrbit.y;
  float r = aOrbit.x * (1.0 - 0.12 * uThink);
  vec3 p = vec3(cos(ang) * r, 0.0, sin(ang) * r);
  // tilt each orbit around x, then around z by its own phase so the rings cross
  float ct = cos(aOrbit.w), st = sin(aOrbit.w);
  p.yz = mat2(ct, -st, st, ct) * p.yz;
  float cz = cos(aOrbit.w * 2.7), sz = sin(aOrbit.w * 2.7);
  p.xy = mat2(cz, -sz, sz, cz) * p.xy;
  p.y += sin(ang * 3.0 + aTwinkle * 6.28) * 0.04;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + aTwinkle * 2.5) + aTwinkle * 40.0);
  gl_PointSize = uSize * (0.5 + aTwinkle) * uPixelRatio / -mv.z;
  vColor = mix(vec3(0.80, 0.82, 0.86), vec3(1.0, 0.84, 0.12), step(0.7, aTwinkle));
  float centerZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  vAlpha = tw * mix(0.25, 0.9, clamp((mv.z - centerZ) * 0.5 + 0.5, 0.0, 1.0));
}
`;

export const coreVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const coreFragment = /* glsl */ `
uniform float uEnergy;
uniform float uThink;
uniform float uSpeak;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = exp(-d * d * 4.5) * (0.22 + 0.18 * uEnergy + 0.25 * uThink + 0.3 * uSpeak);
  float core = exp(-d * d * 40.0) * (0.35 + 0.4 * uSpeak + 0.3 * uThink);
  vec3 c = mix(vec3(0.52, 0.53, 0.58), vec3(1.0, 0.8, 0.08), clamp(uSpeak + uEnergy * 0.5, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.93, 0.62), uThink * 0.5);
  float a = glow + core;
  gl_FragColor = vec4(c * a + vec3(core * 0.6), 1.0);
}
`;
