"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import type { PerspectiveCamera } from "three";
import { orbSignal } from "@/lib/orb-signal";
import { detectQuality, TIERS } from "@/lib/quality";
import { AdaptiveDpr, CAMERA, OrbEngine } from "./engine";

type Props = {
  reduced: boolean;
  onReady: () => void;
  onFail: () => void;
};

export default function OrbCanvas({ reduced, onReady, onFail }: Props) {
  const [quality] = useState(detectQuality);

  useEffect(() => {
    if (!quality.webgl) onFail();
  }, [quality.webgl, onFail]);

  if (!quality.webgl) return null;
  const settings = TIERS[quality.tier];
  const cap = Math.min(window.devicePixelRatio || 1, settings.dprCap);

  return (
    <Canvas
      className="orb-canvas"
      frameloop="demand"
      dpr={cap}
      camera={CAMERA}
      gl={{
        antialias: settings.antialias,
        alpha: true,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.domElement.dataset.tier = quality.tier;
        gl.domElement.addEventListener(
          "webglcontextlost",
          (event) => {
            event.preventDefault();
            onFail();
          },
          { once: true },
        );
      }}
    >
      <Mind particles={settings.particles} sparks={settings.sparks} cap={cap} reduced={reduced} onReady={onReady} />
    </Canvas>
  );
}

type MindProps = {
  particles: number;
  sparks: number;
  cap: number;
  reduced: boolean;
  onReady: () => void;
};

function Mind({ particles, sparks, cap, reduced, onReady }: MindProps) {
  const [engine] = useState(() => new OrbEngine(particles, sparks));
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);
  const [adaptive] = useState(() => new AdaptiveDpr(cap, setDpr));

  // let the page wake the loop (typing, cursor, scroll, coming back on screen)
  useEffect(() => {
    orbSignal.wake = () => invalidate();
    return () => {
      orbSignal.wake = () => {};
    };
  }, [invalidate]);

  useEffect(() => {
    invalidate();
  }, [reduced, invalidate]);

  // warm-up: compile every shader behind the poster, reveal only when ready
  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      invalidate();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) onReady();
        }),
      );
    };
    gl.compileAsync(scene, camera).then(reveal, reveal);
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, invalidate, onReady]);

  useEffect(() => () => engine.dispose(), [engine]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const cam = state.camera as PerspectiveCamera;
    const moving = engine.update(dt, cam, cam.aspect, state.size.height, state.viewport.dpr, reduced);
    const continuous = orbSignal.visible && (!reduced || moving);
    if (continuous && !reduced) adaptive.frame(delta * 1000, performance.now());
    if (continuous) state.invalidate();
  });

  return <primitive object={engine.root} />;
}
