"use client";

/*
  UI enhancements, loaded after load + idle (see EnhancementsGate):
  - section dots + the active nav underline, driven by one IntersectionObserver
  - magnetic primary buttons and a cursor ring that follows the native cursor
  The last two run only with a fine pointer and full motion. All per-frame work writes styles
  directly (CSS variables / transforms), never React state.
*/
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "@/lib/motion";

const SECTIONS = [
  { id: "top", label: "Intro" },
  { id: "demo", label: "Live demo" },
  { id: "capabilities", label: "Capabilities" },
  { id: "how", label: "How it works" },
  { id: "trust", label: "Trust" },
  { id: "voices", label: "Voices" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact" },
];

const FINE = "(hover: hover) and (pointer: fine)";

function useFinePointer() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(FINE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(FINE).matches,
    () => false,
  );
}

export default function Enhancements() {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  const [active, setActive] = useState("top");

  // the section crossing a thin band in the middle of the viewport is the active one
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-45% 0px -54% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // nav underline: data-active on the matching main-nav link
  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>(".nav__links a");
    links.forEach((a) => {
      if (a.getAttribute("href") === `#${active}`) a.dataset.active = "";
      else delete a.dataset.active;
    });
  }, [active]);

  return (
    <>
      <nav aria-label="Sections" className="dots">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="dots__link" aria-current={active === s.id ? "true" : undefined}>
            <span className="dots__label">{s.label}</span>
          </a>
        ))}
      </nav>
      {fine && !reduced && <Pointer />}
    </>
  );
}

const MAGNET = ".btn--primary, .chat__send";
const HOVERABLE = "a, button, summary, label, [role='button']";
const PULL = 6; // px, maximum magnetic offset
const LERP = 0.18;

type Magnet = { x: number; y: number; tx: number; ty: number };

/** Cursor ring + dot and magnetic buttons. Mounted only for a fine pointer with full motion. */
function Pointer() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!ring || !dot) return;

    const magnets = new Map<HTMLElement, Magnet>();
    let current: HTMLElement | null = null;
    let px = -100;
    let py = -100;
    let rx = px;
    let ry = py;
    let dx = px;
    let dy = py;
    let grow = 0;
    let growTarget = 0;
    let raf = 0;
    let seen = false;

    const tick = () => {
      raf = 0;
      let moving = false;

      rx += (px - rx) * LERP;
      ry += (py - ry) * LERP;
      dx += (px - dx) * 0.5;
      dy += (py - dy) * 0.5;
      grow += (growTarget - grow) * LERP;
      // ring 28px -> 48px over interactive elements (scale only)
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) scale(${1 + grow * 0.714})`;
      dot.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      if (Math.abs(px - rx) + Math.abs(py - ry) + Math.abs(growTarget - grow) > 0.1) moving = true;

      magnets.forEach((m, el) => {
        m.x += (m.tx - m.x) * LERP;
        m.y += (m.ty - m.y) * LERP;
        el.style.setProperty("--mx", `${m.x.toFixed(2)}px`);
        el.style.setProperty("--my", `${m.y.toFixed(2)}px`);
        if (Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) > 0.05) moving = true;
        else if (m.tx === 0 && m.ty === 0) {
          el.style.removeProperty("--mx");
          el.style.removeProperty("--my");
          magnets.delete(el);
        }
      });

      if (moving) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      if (!seen) {
        seen = true;
        rx = dx = px;
        ry = dy = py;
        ring.dataset.on = "";
        dot.dataset.on = "";
      }

      const target = e.target instanceof Element ? e.target : null;
      growTarget = target?.closest(HOVERABLE) ? 1 : 0;
      // keep the caret clear in the chat input
      const typing = !!target?.closest(".chat__input");
      ring.classList.toggle("is-hidden", typing);
      dot.classList.toggle("is-hidden", typing);

      // magnetic pull toward the pointer, up to PULL px
      const el = target?.closest<HTMLElement>(MAGNET) ?? null;
      if (current && current !== el) {
        const m = magnets.get(current);
        if (m) m.tx = m.ty = 0;
      }
      current = el && !(el as HTMLButtonElement).disabled ? el : null;
      if (current) {
        const r = current.getBoundingClientRect();
        const m = magnets.get(current) ?? { x: 0, y: 0, tx: 0, ty: 0 };
        m.tx = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / (r.width / 2))) * PULL;
        m.ty = Math.max(-1, Math.min(1, (py - (r.top + r.height / 2)) / (r.height / 2))) * PULL;
        magnets.set(current, m);
      }
      wake();
    };
    const onLeave = () => {
      delete ring.dataset.on;
      delete dot.dataset.on;
      seen = false;
      if (current) {
        const m = magnets.get(current);
        if (m) m.tx = m.ty = 0;
        current = null;
      }
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      magnets.forEach((_, el) => {
        el.style.removeProperty("--mx");
        el.style.removeProperty("--my");
      });
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" aria-hidden="true" />
      <div ref={dotRef} className="cursor-dot" aria-hidden="true" />
    </>
  );
}
