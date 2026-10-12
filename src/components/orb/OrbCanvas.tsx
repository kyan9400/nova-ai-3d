"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import type { PerspectiveCamera } from "three";
import { orbSignal } from "@/lib/orb-signal";
import { TIERS, type Tier } from "@/lib/quality";
import { AdaptiveDpr, CAMERA, OrbEngine, yieldToMain } from "./engine";

type Props = {
  /** decided by Stage (detectQuality) before this chunk was even requested */
  tier: Tier;
  reduced: boolean;
  onReady: () => void;
  onFail: () => void;
};

export default function OrbCanvas({ tier, reduced, onReady, onFail }: Props) {
  const settings = TIERS[tier];
  const [cap] = useState(() => Math.min(window.devicePixelRatio || 1, settings.dprCap));
  // particle attributes are generated in slices that yield to the main thread, before the canvas exists
  const [engine, setEngine] = useState<OrbEngine | null>(null);
  useEffect(() => {
    let alive = true;
    let built: OrbEngine | null = null;
    OrbEngine.create(settings)
      .then((e) => {
        built = e;
        if (alive) setEngine(e);
        else e.dispose();
      })
      .catch(() => alive && onFail());
    return () => {
      alive = false;
      built?.dispose();
    };
  }, [settings, onFail]);

  if (!engine) return null;

  return (
    <Canvas
      className="orb-canvas"
      frameloop="demand"
      dpr={cap}
      camera={CAMERA}
      gl={{
        antialias: settings.antialias,
        alpha: true,
        depth: true, // the glass core hides far-side particles
        stencil: false,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.domElement.dataset.tier = tier;
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
      <Mind engine={engine} cap={cap} reduced={reduced} onReady={onReady} />
    </Canvas>
  );
}

type MindProps = {
  engine: OrbEngine;
  cap: number;
  reduced: boolean;
  onReady: () => void;
};

function Mind({ engine, cap, reduced, onReady }: MindProps) {
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

  // warm-up behind the poster: compile every shader (and upload the noise texture); reveal only when ready
  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      engine.startIntro();
      invalidate();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) onReady();
        }),
      );
    };
    // renderer creation was its own long task: yield once before compiling
    yieldToMain()
      .then(() => (cancelled ? undefined : gl.compileAsync(scene, camera)))
      .then(reveal, reveal);
    return () => {
      cancelled = true;
    };
  }, [engine, gl, scene, camera, invalidate, onReady]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const cam = state.camera as PerspectiveCamera;
    const moving = engine.update(dt, cam, state.size.height, state.viewport.dpr, reduced);
    const continuous = orbSignal.visible && (!reduced || moving);
    if (continuous && !reduced) adaptive.frame(delta * 1000, performance.now());
    if (continuous) state.invalidate();
  });

  return <primitive object={engine.world} />;
}
