/*
  GLSL for Nova's mind. All motion happens on the GPU and is driven by uniforms from the page
  (cursor, typing ripples, thinking, speaking, intro, scroll chapters, mind modes).

  Noise comes from a small tileable 32^3 RGBA texture built in JS (engine.ts, buildNoise), never from
  inline procedural noise: on Windows (ANGLE / D3D11) long noise functions take seconds to compile, while
  a texture lookup compiles instantly and is cheaper per vertex.

  Chapter palette: uColA (key), uColB (light), uColC (deep accent) are blended in JS between
  listen (gold), think (ice / violet) and speak (signal amber).
*/

// Shared by every shader that needs noise or the "mind opens" disc.
const shared = /* glsl */ `
uniform sampler3D uNoise;

// 4 decorrelated smooth value-noise channels in -1..1, one lattice cell per unit of q
vec4 nz(vec3 q) { return texture(uNoise, q * 0.125) * 2.0 - 1.0; }

// noise sample point for the breathing surface
vec3 breatheQ(vec3 p, float t) { return p * 1.25 + vec3(0.0, t * 0.11, t * 0.07); }

// "the mind opens": fly outward, flatten into a disc, swirl, then tilt the disc toward the camera
vec3 openUp(vec3 p, float open, float spread, float layer) {
  if (open < 0.0005) return p;
  p *= 1.0 + open * spread;
  p.y *= 1.0 - 0.8 * open;
  float a = open * (1.6 - layer) * 2.0;
  float ca = cos(a), sa = sin(a);
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;
  float tl = open * 1.05;
  float ct = cos(tl), st = sin(tl);
  p.yz = mat2(ct, -st, st, ct) * p.yz;
  return p;
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
uniform float uIntro;  // 0 -> 1: the orb switches on
uniform float uOpen;   // 0 -> 1 -> 0 across the hero -> demo scroll ("thinks" chapter)
uniform float uListen; // listening waveform on the shell (hero chapter + typing)
uniform float uFocus;  // mind mode weights (0..1, damped)
uniform float uBright;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;

attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

${shared}

const vec3 DEEP = vec3(0.10, 0.09, 0.15);
const vec3 COOL = vec3(0.62, 0.68, 0.78);
const vec3 KEY = vec3(-0.476, 0.667, 0.572); // warm key light from the upper left (normalised)

void main() {
  vec3 home = position;
  // a thick shell: most particles near the surface, some drifting inside (Focus tightens it)
  float layer = mix(mix(0.55, 0.75, uFocus), 1.0, pow(aSeed.x, 0.3));
  vec3 p = home * layer;

  float t = uTime;
  vec3 q = breatheQ(p, t);
  vec4 N = nz(q);
  float n1 = N.x * 1.3;
  float n2 = nz(q * 2.3 + vec3(5.2, 1.3, 7.7) - t * 0.05).y;

  // curl-like currents: three decorrelated channels bend each particle off its home
  p += N.yzw * 1.3 * (0.10 + 0.10 * uEnergy + 0.06 * uThink) * (0.6 + 0.4 * layer) * mix(1.0, 0.5, uFocus);

  // breathing surface, louder with energy
  p *= 1.0 + n1 * (0.11 + 0.12 * uEnergy);

  // thinking: gather inwards and spin, inner layers faster
  p *= 1.0 - 0.16 * uThink;
  float a = uSwirl * (1.6 - layer);
  float ca = cos(a), sa = sin(a);
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;

  vec3 dir = normalize(p);

  // listening: latitude bands run over the shell like an audio waveform, louder on one side
  float lon = atan(dir.z, dir.x);
  float env = 0.55 + 0.45 * sin(lon * 3.0 + t * 0.7);
  float wave = sin(dir.y * 15.0 - t * 3.4) * env;
  p += dir * wave * uListen * 0.055 * layer;
  float crest = max(wave, 0.0) * uListen * smoothstep(0.8, 1.0, layer);

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
    ring += exp(-k * k) * exp(-r.w * 1.4);
  }
  p += dir * ring * 0.16;

  // cursor: the shell bulges and brightens where you point
  float pd = distance(dir, uPointer);
  float lean = exp(-pd * pd * 5.0) * uPointerStrength;
  p += dir * lean * 0.28;

  // intro: each particle converges from far out, with its own delay
  float ki = clamp(uIntro * 1.5 - aSeed.x * 0.5, 0.0, 1.0);
  ki = 1.0 - pow(1.0 - ki, 3.0);
  p *= mix(2.6 + aSeed.z * 1.2, 1.0, ki);

  // the mind opens into a tilted spiral disc of thought
  float spread = 0.6 + 1.6 * aSeed.z;
  float arm = 0.5 + 0.5 * cos(2.0 * atan(p.z, p.x) - 3.2 * length(p.xz) * (1.0 + uOpen * spread));
  p = openUp(p, uOpen, spread, layer);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // fade the far side so the orb reads as a volume, not a flat disc
  float centerZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  float facing = clamp((mv.z - centerZ) * 0.6 + 0.5, 0.0, 1.0);

  float highlight = clamp(lean * 1.2 + ring * 1.5 + uSpeak * 0.25 + crest * 0.8, 0.0, 1.6);
  float size = uSize * (0.55 + aSeed.w * 1.1) * (1.0 + highlight * 0.6) * (0.7 + 0.3 * layer);
#ifdef BOKEH
  // near particles grow and soften: cheap depth of field
  vSoft = smoothstep(0.8, 1.0, facing) * (1.0 - uOpen);
  size *= 1.0 + 0.6 * vSoft;
#else
  vSoft = 0.0;
#endif
  // clamp so particles that pass close to the camera (intro, open) never become huge quads
  gl_PointSize = clamp(size * uPixelRatio / -mv.z, 0.0, 64.0 * uPixelRatio);

  // lit particle volume: each point is shaded as a point on a lit sphere, plus a fresnel rim
  vec3 n = normalize(mat3(modelMatrix) * dir);
  vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz);
  float diffuse = 0.3 + 0.7 * max(dot(n, KEY), 0.0);
  // clamp: |dot| can round past 1, and pow() of a negative base is undefined (NaN on some GPUs)
  float rim = pow(clamp(1.0 - abs(dot(n, viewDir)), 0.0, 1.0), 3.0);

  // deep inner layers, light outer skin, key-colour noise peaks, accent veins
  vec3 c = mix(DEEP, uColB * 0.8, smoothstep(0.6, 0.97, layer));
  c = mix(c, uColA, smoothstep(mix(0.25, 0.1, uBright), 0.8, n1) * 0.95 * (1.0 - 0.5 * uFocus));
  c = mix(c, uColC, smoothstep(0.35, 0.9, n2) * (0.35 + 0.5 * uThink));
  c = mix(c, COOL, 0.3 * uFocus);
  c *= diffuse;
  c += uColB * rim * 0.55;
  c += uColA * highlight * 0.7;
  // keep overlapping colour out of pure-white blowout
  vColor = min(c, vec3(1.35));

  vAlpha = mix(0.16, 0.95, facing) * (0.55 + 0.45 * aSeed.y) * ki;
  vAlpha *= 1.0 - 0.3 * uOpen * aSeed.z;
  vAlpha *= mix(1.0, 0.12 + 1.5 * arm * arm * arm, uOpen); // spiral arms in the open disc
  vAlpha *= 1.0 - 0.35 * vSoft;
}
`;

export const pointFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  float d = length(gl_PointCoord - 0.5);
  // vSoft (bokeh) flattens the disc
  float a = 1.0 - smoothstep(mix(0.05, 0.25, vSoft), 0.5, d);
  a *= a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

/*
  Light streams: comet trails of points on tilted, wobbling loops around the core.
  Point s = 0 is the bright head, s = 1 the end of the tail. uFlow is accumulated in JS so speed
  changes never jump.
*/
export const streamVertex = /* glsl */ `
uniform float uTime;
uniform float uFlow;
uniform float uThink;
uniform float uSpeak;
uniform float uOpen;
uniform float uSize;
uniform float uPixelRatio;
uniform float uIntro; // eased 0..1
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
attribute vec4 aA; // s (0 head .. 1 tail), radius, speed (signed), phase
attribute vec4 aB; // tilt x, tilt z, wobble, hue

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

${shared}

void main() {
  float s = aA.x;
  float dirSign = aA.z < 0.0 ? -1.0 : 1.0;
  float th = aA.w * 6.2832 + uFlow * aA.z - s * 3.4 * dirSign;
  float r = aA.y * (1.0 - 0.14 * uThink) * (1.0 + 0.06 * uSpeak);
  vec3 p = vec3(cos(th), sin(2.0 * th + aA.w * 9.0) * aB.z, sin(th)) * r;
  p *= 1.0 + 0.07 * sin(3.0 * th + aA.w * 5.0 + uTime * 0.6);

  // tilt the loop (slowly precessing), then a second tilt so the loops cross
  float tx = aB.x + uTime * 0.04 * (aB.w - 0.5);
  float ct = cos(tx), st = sin(tx);
  p.yz = mat2(ct, -st, st, ct) * p.yz;
  float cz = cos(aB.y), sz = sin(aB.y);
  p.xy = mat2(cz, -sz, sz, cz) * p.xy;

  // liquid wobble from the shared noise field
  p += nz(p * 1.4 + vec3(0.0, uTime * 0.1, 0.0)).xyz * 0.08;
  p = openUp(p, uOpen, 0.35 + 0.7 * aB.w, 0.9);
  p *= mix(0.35, 1.0, uIntro);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float head = 1.0 - s;
  float hot = pow(head, 10.0);
  gl_PointSize = clamp(uSize * (0.55 + 0.25 * head + 1.2 * hot) * uPixelRatio / -mv.z, 0.0, 40.0 * uPixelRatio);

  vec3 c = aB.w < 0.5 ? mix(uColA, uColB, aB.w * 2.0) : mix(uColB, uColC, aB.w * 2.0 - 1.0);
  vColor = c * (0.75 + 0.6 * hot) + vec3(1.0, 0.97, 0.9) * hot * 0.6;

  float centerZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  float facing = clamp((mv.z - centerZ) * 0.7 + 0.5, 0.0, 1.0);
  vAlpha = pow(head, 1.15) * mix(0.15, 1.0, facing) * uIntro * (0.6 + 0.35 * uThink + 0.3 * uSpeak);
  vSoft = 0.0;
}
`;

export const sparkVertex = /* glsl */ `
uniform float uTime;
uniform float uThink;
uniform float uSpin;
uniform float uSize;
uniform float uPixelRatio;
uniform float uIntro; // eased 0..1
uniform float uOpen;
uniform vec3 uColA;
uniform vec3 uColB;
attribute vec4 aOrbit; // radius, speed, phase, tilt
attribute float aTwinkle;

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  float ang = aOrbit.z + uSpin * aOrbit.y;
  // pushed out to the disc rim while the mind is open
  float r = aOrbit.x * (1.0 - 0.12 * uThink) * (1.0 + 0.8 * uOpen);
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
  gl_PointSize = clamp(uSize * (0.5 + aTwinkle) * uPixelRatio / -mv.z, 0.0, 48.0 * uPixelRatio);
  vColor = mix(uColB, uColA, step(0.6, aTwinkle));
  float centerZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  vAlpha = tw * mix(0.25, 0.9, clamp((mv.z - centerZ) * 0.5 + 0.5, 0.0, 1.0)) * uIntro;
  vSoft = 0.0;
}
`;

// Depth dust: a far field of drifting motes around the mind (parallax layer), with near-camera bokeh.
export const dustVertex = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uIntro;
uniform vec3 uColA;
uniform vec3 uColB;
attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.12 + aSeed.x * 6.28) * 0.12;
  p.x += cos(uTime * 0.09 + aSeed.y * 6.28) * 0.08;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  vSoft = smoothstep(3.0, 1.2, dist);
  gl_PointSize = clamp(uSize * (0.4 + aSeed.w * 1.2) * (1.0 + 2.5 * vSoft) * uPixelRatio / dist, 0.0, 48.0 * uPixelRatio);
  float tw = 0.6 + 0.4 * sin(uTime * (0.6 + aSeed.z) + aSeed.x * 30.0);
  vColor = mix(uColB * 0.7, uColA, step(0.82, aSeed.y));
  vAlpha = tw * uIntro * (0.22 + 0.4 * aSeed.z) * (1.0 - 0.6 * vSoft) * smoothstep(9.0, 4.0, dist);
}
`;

// Synapse filaments: great-circle arcs between shell points with a travelling pulse ("neural lines").
export const filamentVertex = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uThink;
uniform float uSwirl;
uniform float uOpen;
attribute float aT;    // 0..1 along the arc
attribute vec2 aSeed;  // pulse phase, pulse speed

varying float vT;
varying vec2 vSeed;
varying float vFacing;

${shared}

void main() {
  vec3 p = position;
  // same breathing, contraction and swirl as the outer shell layer
  float n1 = nz(breatheQ(p, uTime)).x * 1.3;
  p *= 1.0 + n1 * (0.11 + 0.12 * uEnergy);
  p *= 1.0 - 0.16 * uThink;
  float a = uSwirl * 0.6;
  float ca = cos(a), sa = sin(a);
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;
  p = openUp(p, uOpen, 0.6, 1.0);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float centerZ = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
  vFacing = clamp((mv.z - centerZ) * 0.6 + 0.5, 0.0, 1.0);
  vT = aT;
  vSeed = aSeed;
}
`;

export const filamentFragment = /* glsl */ `
uniform float uTime;
uniform float uVis; // about 0.1 idle, up to 1 while thinking / in the open disc
uniform vec3 uColA;
uniform vec3 uColB;
varying float vT;
varying vec2 vSeed;
varying float vFacing;

void main() {
  // a pulse head running along the arc, with a short tail behind it
  float head = fract(uTime * (0.22 + vSeed.y * 0.3) + vSeed.x);
  float dd = head - vT;
  float pulse = (1.0 - smoothstep(0.0, 0.16, dd)) * step(0.0, dd);
  vec3 col = mix(uColB * 0.85, uColA * 1.3, smoothstep(0.45, 1.0, pulse));
  float a = uVis * (0.35 + 1.5 * pulse) * mix(0.2, 1.0, vFacing);
  gl_FragColor = vec4(col, a);
}
`;

// The glass mind: dark glass with a thin-film iridescent rim, two glints and light veins inside.
export const glassVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vP = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const glassFragment = /* glsl */ `
uniform sampler3D uNoise;
uniform float uTime;
uniform float uGlow;  // inner light: idle ~0.3, thinking / speaking up to ~1.3
uniform float uIntro;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float f = 1.0 - ndv;

  // thin-film rim: the hue shifts with the viewing angle, pulled toward the chapter colour
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + f * 1.5 + uTime * 0.02));
  vec3 rimC = mix(uColA, film, 0.55);
  vec3 col = rimC * (pow(f, 3.0) * 1.4 + pow(f, 9.0) * 1.6);

  // studio glints: a hard key upper left, a soft accent lower right
  vec3 R = reflect(-V, N);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(R, normalize(vec3(-0.5, 0.7, 0.5))), 0.0), 90.0) * 1.8;
  col += uColB * pow(max(dot(R, normalize(vec3(0.75, -0.35, 0.45))), 0.0), 20.0) * 0.35;

  // light veins inside: ridged noise sampled along the refracted ray
  vec3 rd = refract(-V, N, 0.72);
  vec3 drift = vec3(0.0, uTime * 0.045, uTime * 0.025);
  float veins = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 sp = vP * 1.7 + rd * (0.2 + 0.32 * fi);
    float n = texture(uNoise, sp * 0.2 + drift + fi * 0.31).x;
    float ridge = 1.0 - abs(n * 2.0 - 1.0);
    veins += pow(ridge, 34.0) * (1.0 - 0.28 * fi);
  }
  vec3 veinC = mix(uColA, vec3(1.0, 0.97, 0.88), 0.3);
  col += veinC * veins * (0.45 + 0.8 * uGlow) * (0.35 + 0.65 * ndv);
  col += uColC * veins * f * 0.35;

  // a small warm heart deep inside
  col += uColA * pow(ndv, 12.0) * (0.04 + 0.22 * uGlow);

  // opaque dark glass body (tinted by the chapter), so the halo behind it never fills it with colour
  vec3 body = mix(vec3(0.012, 0.012, 0.02), uColC * 0.05, 0.6) * (0.4 + 0.6 * ndv);
  gl_FragColor = vec4(body + min(col, vec3(1.6)) * uIntro, 1.0);
}
`;

export const haloVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/*
  Halo: one camera-facing quad behind the mind. Soft volumetric glow, light rays (high/medium),
  a three-line circular voice waveform, and sound rings that travel in while Nova listens and out
  while it speaks.
*/
export const haloFragment = /* glsl */ `
uniform sampler3D uNoise;
uniform float uTime;
uniform float uWaveT;  // ring clock (advances with motion)
uniform float uDir;    // 0 rings travel in (listening) .. 1 rings travel out (speaking)
uniform float uLevel;  // waveform loudness
uniform float uRing;   // ring visibility
uniform float uRays;
uniform float uGlow;
uniform float uIntro;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
varying vec2 vUv;

const float SIZE = 7.0;

void main() {
  vec2 q = (vUv - 0.5) * SIZE;
  float d = length(q);
  float a = atan(q.y, q.x);
  vec3 col = vec3(0.0);

  // volumetric glow: a warm heart and a wide coloured haze
  col += uColA * exp(-d * d * 1.6) * (0.16 + 0.22 * uGlow);
  col += uColC * exp(-d * 1.15) * 0.07;

#ifdef RAYS
  // light rays: angular noise, seamless around the circle, fading outward
  vec2 cs = vec2(cos(a), sin(a));
  float ray = texture(uNoise, vec3(cs * 0.9, uTime * 0.012)).x;
  float ray2 = texture(uNoise, vec3(cs * 2.1 + 3.0, uTime * 0.02)).y;
  float rays = pow(ray * ray2 * 1.7, 2.5);
  col += mix(uColB, uColA, 0.5) * rays * smoothstep(0.85, 1.35, d) * exp(-(d - 1.1) * 1.15) * uRays;
#endif

  // circular voice waveform: three phase-shifted lines
  for (int k = 0; k < 3; k++) {
    float ph = float(k) * 2.1;
    float w = sin(a * 3.0 + uTime * 1.3 + ph) * 0.5
            + sin(a * 5.0 - uTime * 1.9 + ph * 1.7) * 0.3
            + sin(a * 9.0 + uTime * 2.7 + ph) * 0.2;
    float env = 0.5 + 0.5 * sin(a * 2.0 - uTime * 0.4 + ph);
    float r = 1.46 + w * env * 0.1 * uLevel;
    float dl = (d - r) * 110.0;
    float line = exp(-dl * dl) + exp(-abs(d - r) * 28.0) * 0.16;
    vec3 lc = k == 0 ? uColA : (k == 1 ? uColB : uColC);
    col += lc * line * (0.35 + 0.65 * env) * 0.55 * clamp(uLevel, 0.0, 1.4);
  }

  // sound rings: in toward the mind while listening, out from it while speaking
  for (int k = 0; k < 4; k++) {
    float ph = fract(uWaveT * 0.2 + float(k) * 0.25);
    float rin = mix(3.1, 1.4, ph);
    float rout = mix(1.4, 3.3, ph);
    float rr = mix(rin, rout, uDir);
    float dr = (d - rr) * 70.0;
    float fade = sin(3.1416 * ph);
    col += uColB * exp(-dr * dr) * fade * fade * 0.32 * uRing;
  }

  gl_FragColor = vec4(col * uIntro, 1.0);
}
`;
