"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { orbSignal, touchOrb } from "@/lib/orb-signal";
import { useReducedMotion } from "@/lib/motion";
import { detectQuality, type Tier } from "@/lib/quality";

// The 3D chunk (three + r3f) never renders on the server. It is requested only after window "load" plus an
// idle callback (never during hydration), and never at all on software WebGL unless ?quality= forces it.
const OrbCanvas = dynamic(() => import("./orb/OrbCanvas"), { ssr: false });

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** poster: the server-rendered OrbPoster, passed in so its SVG never has to hydrate. */
export default function Stage({ children, poster }: { children: ReactNode; poster: ReactNode }) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // start the 3D only once the page is loaded and the main thread is idle
  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      const q = detectQuality();
      if (!q.webgl || (q.software && !q.forced)) {
        setFailed(true);
        return;
      }
      setTier(q.tier);
    };
    const w = window as IdleWindow;
    // idle callbacks and timeouts have separate id spaces, so remember which one was used
    let idleHandle = 0;
    let timeoutHandle = 0;
    const schedule = () => {
      if (w.requestIdleCallback) idleHandle = w.requestIdleCallback(start, { timeout: 2500 });
      else timeoutHandle = window.setTimeout(start, 600);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idleHandle && w.cancelIdleCallback) w.cancelIdleCallback(idleHandle);
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
    };
  }, []);

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
      <div className={`stage-layer${live ? " is-live" : ""}`} aria-hidden="true">
        {poster}
        {!failed && tier && (
          <div className="orb-wrap">
            <OrbCanvas tier={tier} reduced={reduced} onReady={onReady} onFail={onFail} />
          </div>
        )}
      </div>
      <div className="stage-content">{children}</div>
    </div>
  );
}
