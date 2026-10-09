import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Nova — a mind that listens before it speaks. A glowing particle orb on a near-black background.";

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// a code-drawn particle orb (Fibonacci sphere, projected)
function orbDots() {
  const dots = [];
  const count = 260;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const colors = ["#c8cbd2", "#c8cbd2", "#8e9097", "#f4f3ee", "#ffd60a"];
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const y2 = y * Math.cos(0.45) - z * Math.sin(0.45);
    const z2 = y * Math.sin(0.45) + z * Math.cos(0.45);
    const depth = (z2 + 1) / 2;
    const size = 3 + depth * 6;
    dots.push({
      left: 230 + x * 210 - size / 2,
      top: 230 + y2 * 210 - size / 2,
      size,
      opacity: 0.15 + depth * 0.85,
      color: colors[Math.floor(hash(i * 3.1) * colors.length)],
    });
  }
  return dots;
}

export function renderOg() {
  const dots = orbDots();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0a0a0b",
          backgroundImage:
            "radial-gradient(circle at 78% 50%, rgba(255,214,10,0.16), rgba(10,10,11,0) 45%), radial-gradient(circle at 10% 100%, rgba(200,203,210,0.10), rgba(10,10,11,0) 40%)",
          color: "#f4f3ee",
          fontFamily: "sans-serif", fontWeight: 800,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 80px", width: 640 }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#ffd60a", fontFamily: "monospace" }}>
            NOVA / ASSISTANT FOR TEAMS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 80, lineHeight: 1.02, marginTop: 28 }}>
            A mind that&nbsp;<span style={{ color: "#ffd60a" }}>listens</span>&nbsp;before it speaks.
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#b5b4ad", marginTop: 32, fontFamily: "sans-serif" }}>
            Answers from your docs, meetings and tickets — with sources.
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 460, height: 460, marginTop: 85, marginLeft: 40 }}>
          <div
            style={{
              position: "absolute",
              left: 80,
              top: 80,
              width: 300,
              height: 300,
              borderRadius: 300,
              background: "radial-gradient(circle, rgba(255,214,10,0.38), rgba(200,203,210,0.10) 50%, rgba(10,10,11,0) 72%)",
            }}
          />
          {dots.map((d, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: d.left,
                top: d.top,
                width: d.size,
                height: d.size,
                borderRadius: d.size,
                background: d.color,
                opacity: d.opacity,
              }}
            />
          ))}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
