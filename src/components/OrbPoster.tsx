/*
  Code-drawn poster of the orb. A server component: the SVG is in the HTML and never hydrates.
  Shown while the 3D chunk loads and warms up, and permanently when WebGL is missing, is a software
  renderer, or the context is lost. Stage hides it (opacity only) via .stage-layer.is-live.
  It mirrors the live scene: gold halo rings, far-side particles, the dark glass core with its iridescent
  rim, faint filament arcs, near-side particles.
  Node budget: <= 400 SVG elements.
*/

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const COLORS = ["#e9d9b0", "#c9a85a", "#8a6a2a", "#fff3cf", "#ffc21a"];
const TILT = 0.45;
const R = 150;

type Dot = { x: number; y: number; r: number; o: number; c: string; z: number };

/** Unit Fibonacci-sphere point, tilted around x so the poles read as a sphere. */
function fib(i: number, count: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - ((i + 0.5) / count) * 2;
  const rad = Math.sqrt(1 - y * y);
  const th = golden * i;
  const x = Math.cos(th) * rad;
  const z = Math.sin(th) * rad;
  return { x, y: y * Math.cos(TILT) - z * Math.sin(TILT), z: y * Math.sin(TILT) + z * Math.cos(TILT) };
}

function buildDots(count: number) {
  const dots: Dot[] = [];
  for (let i = 0; i < count; i++) {
    const p = fib(i, count);
    const wobble = 1 + (hash(i) - 0.5) * 0.14;
    const depth = (p.z + 1) / 2;
    // same warm key light from the upper left as the shader, so the poster is lit like the live orb
    const light = 0.35 + 0.65 * Math.max(0, -0.5 * p.x - 0.7 * p.y + 0.6 * p.z);
    dots.push({
      x: 200 + p.x * R * wobble,
      y: 200 + p.y * R * wobble,
      r: Number((0.8 + depth * 1.9).toFixed(2)),
      o: Number(((0.15 + depth * 0.8) * (0.55 + 0.45 * light)).toFixed(2)),
      c: COLORS[Math.floor(hash(i * 3.1) * COLORS.length)],
      z: p.z,
    });
  }
  return dots;
}

/** A filament: a great-circle arc between two shell points, lifted outward in the middle. */
function arc(a: number, b: number, count: number) {
  const A = fib(a, count);
  const B = fib(b, count);
  const dot = A.x * B.x + A.y * B.y + A.z * B.z;
  const om = Math.acos(Math.max(-1, Math.min(1, dot)));
  const pts: string[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const s = Math.sin(om) || 1;
    const wa = Math.sin((1 - t) * om) / s;
    const wb = Math.sin(t * om) / s;
    const lift = 1 + Math.sin(Math.PI * t) * 0.12;
    pts.push(`${(200 + (A.x * wa + B.x * wb) * R * lift).toFixed(1)},${(200 + (A.y * wa + B.y * wb) * R * lift).toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
}

const COUNT = 340;
const DOTS = buildDots(COUNT);
const BACK = DOTS.filter((d) => d.z < 0);
const FRONT = DOTS.filter((d) => d.z >= 0);

/** 7 filament pairs on the near side, 25-70 degrees apart, chosen deterministically. */
function pickArcs(n: number) {
  const out: string[] = [];
  for (let k = 0; out.length < n && k < 400; k++) {
    const a = Math.floor(hash(k * 7.7 + 1) * COUNT);
    const b = Math.floor(hash(k * 3.9 + 5) * COUNT);
    const A = fib(a, COUNT);
    const B = fib(b, COUNT);
    const ang = (Math.acos(Math.max(-1, Math.min(1, A.x * B.x + A.y * B.y + A.z * B.z))) * 180) / Math.PI;
    if (A.z > 0.15 && B.z > 0.15 && ang >= 25 && ang <= 70) out.push(arc(a, b, COUNT));
  }
  return out;
}
const ARCS = pickArcs(7);

function DotList({ dots }: { dots: Dot[] }) {
  return dots.map((d, i) => <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r} fill={d.c} fillOpacity={d.o} />);
}

export default function OrbPoster() {
  return (
    <div className="orb-poster">
      <svg viewBox="0 0 400 400" role="presentation" focusable="false">
        <defs>
          <radialGradient id="poster-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb81a" stopOpacity="0.4" />
            <stop offset="40%" stopColor="#f2a01a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#0a0a0b" stopOpacity="0" />
          </radialGradient>
          {/* glass core: dark body, a glint upper left, a warm iridescent rim */}
          <radialGradient id="poster-pearl" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2a1e08" />
            <stop offset="62%" stopColor="#0c0b0d" />
            <stop offset="88%" stopColor="#3a2410" />
            <stop offset="97%" stopColor="#e07a9a" />
            <stop offset="100%" stopColor="#ffd27a" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="200" fill="url(#poster-glow)" />
        <circle cx="200" cy="200" r="196" fill="none" stroke="#ffb81a" strokeOpacity="0.3" strokeWidth="1.2" />
        <circle cx="200" cy="200" r="170" fill="none" stroke="#fff0c0" strokeOpacity="0.14" />
        <ellipse cx="200" cy="200" rx="186" ry="58" fill="none" stroke="#ffd60a" strokeOpacity="0.3" transform="rotate(-18 200 200)" />
        <ellipse cx="200" cy="200" rx="176" ry="40" fill="none" stroke="#f4e3b8" strokeOpacity="0.2" transform="rotate(24 200 200)" />
        <DotList dots={BACK} />
        <circle cx="200" cy="200" r="78" fill="url(#poster-pearl)" />
        <circle cx="200" cy="200" r="78" fill="none" stroke="#ffd60a" strokeOpacity="0.45" strokeWidth="1" />
        <circle cx="176" cy="170" r="5" fill="#fff8e6" fillOpacity="0.85" />
        <g fill="none" stroke="#ffd27a" strokeOpacity="0.26" strokeWidth="0.7" strokeLinecap="round">
          {ARCS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <DotList dots={FRONT} />
      </svg>
    </div>
  );
}
