/*
  Code-drawn poster of the orb. A server component: the SVG is in the HTML and never hydrates.
  Shown while the 3D chunk loads and warms up, and permanently when WebGL is missing, is a software
  renderer, or the context is lost. Stage hides it (opacity only) via .stage-layer.is-live.
*/

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const COLORS = ["#c8cbd2", "#c8cbd2", "#8e9097", "#f4f3ee", "#ffd60a"];

function buildDots(count: number) {
  const dots: { x: number; y: number; r: number; o: number; c: string }[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const tilt = 0.45;
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * i;
    const x = Math.cos(th) * rad;
    const z = Math.sin(th) * rad;
    // tilt around x so the poles read as a sphere
    const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
    const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
    const wobble = 1 + (hash(i) - 0.5) * 0.14;
    const depth = (z2 + 1) / 2;
    dots.push({
      x: 200 + x * 150 * wobble,
      y: 200 + y2 * 150 * wobble,
      r: Number((0.8 + depth * 1.9).toFixed(2)),
      o: Number((0.15 + depth * 0.8).toFixed(2)),
      c: COLORS[Math.floor(hash(i * 3.1) * COLORS.length)],
    });
  }
  return dots;
}

const DOTS = buildDots(340);

export default function OrbPoster() {
  return (
    <div className="orb-poster">
      <svg viewBox="0 0 400 400" role="presentation" focusable="false">
        <defs>
          <radialGradient id="poster-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd60a" stopOpacity="0.34" />
            <stop offset="35%" stopColor="#c8cbd2" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#0a0a0b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="200" fill="url(#poster-glow)" />
        <ellipse cx="200" cy="200" rx="186" ry="58" fill="none" stroke="#ffd60a" strokeOpacity="0.24" transform="rotate(-18 200 200)" />
        <ellipse cx="200" cy="200" rx="176" ry="40" fill="none" stroke="#c8cbd2" strokeOpacity="0.18" transform="rotate(24 200 200)" />
        {DOTS.map((d, i) => (
          <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r} fill={d.c} fillOpacity={d.o} />
        ))}
      </svg>
    </div>
  );
}
