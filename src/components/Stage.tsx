"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { orbSignal, touchOrb } from "@/lib/orb-signal";
import { useReducedMotion } from "@/lib/motion";
import OrbPoster from "./OrbPoster";

// The 3D chunk (three + r3f) loads after hydration and never on the server.
const OrbCanvas = dynamic(() => import("./orb/OrbCanvas"), { ssr: false });

export default function Stage({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const onReady = useCallback(() => setReady(true), []);
  const onFail = useCallback(() => setFailed(true), []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    let onScreen = true;
    const updateVisible = () => {
      const visible = onScreen && document.visibilityState === "visible";
      if (visible !== orbSignal.visible) {
        orbSignal.visible = visible;
        if (visible) touchOrb();
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      updateVisible();
    });
    io.observe(el);

    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const range = Math.max(1, rect.height - window.innerHeight);
      const p = Math.min(1, Math.max(0, -rect.top / range));
      if (Math.abs(p - orbSignal.scroll) > 0.001) {
        orbSignal.scroll = p;
        if (orbSignal.visible) touchOrb();
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    const onPointerMove = (e: PointerEvent) => {
      orbSignal.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      orbSignal.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
      orbSignal.pointerActive = true;
      if (orbSignal.visible) touchOrb();
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (e.type !== "pointerup" || e.pointerType === "touch") {
        orbSignal.pointerActive = false;
        if (orbSignal.visible) touchOrb();
      }
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerEnd, { passive: true });
    window.addEventListener("pointercancel", onPointerEnd, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerEnd);
    document.addEventListener("visibilitychange", updateVisible);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      document.documentElement.removeEventListener("pointerleave", onPointerEnd);
      document.removeEventListener("visibilitychange", updateVisible);
    };
  }, []);

  const live = ready && !failed;

  return (
    <div ref={stageRef} className="stage">
      <div className="stage-layer" aria-hidden="true">
        <OrbPoster hidden={live} />
        {!failed && (
          <div className={`orb-wrap${live ? " is-live" : ""}`}>
            <OrbCanvas reduced={reduced} onReady={onReady} onFail={onFail} />
          </div>
        )}
      </div>
      <div className="stage-content">{children}</div>
    </div>
  );
}
