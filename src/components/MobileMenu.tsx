"use client";

/*
  Small-screen menu. The section links are hidden under 900px, so this button opens a solid
  panel (never backdrop-filter — the canvas sits behind it) with the same links plus the CTA.
  Plain DOM + CSS: it works whether or not the 3D ever loads.
*/
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Link = { href: string; label: string };

function lockScroll(locked: boolean) {
  document.documentElement.style.overflow = locked ? "hidden" : "";
  document.body.style.overflow = locked ? "hidden" : "";
}

export default function MobileMenu({ links, cta }: { links: Link[]; cta: Link }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const returnFocus = useRef(true);

  const close = useCallback((restoreFocus = true) => {
    // unlock right away so a link's own scroll-to-section isn't fighting overflow: hidden
    lockScroll(false);
    returnFocus.current = restoreFocus;
    setOpen(false);
  }, []);
  // a link hands the keyboard to its section; pulling focus back to the button would undo that
  const onLinkClick = () => close(false);

  useEffect(() => {
    if (open) {
      lockScroll(true);
      panelRef.current?.querySelector<HTMLElement>("a")?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      if (returnFocus.current) buttonRef.current?.focus({ preventScroll: true });
      returnFocus.current = true;
      wasOpen.current = false;
    }
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // the panel disappears at the desktop breakpoint; don't leave the page locked
    const mq = window.matchMedia("(min-width: 900px)");
    const onWide = () => mq.matches && close(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
      lockScroll(false);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="menu-btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="menu-btn__icon" aria-hidden="true" />
        <span>Menu</span>
      </button>

      <div
        ref={panelRef}
        id={panelId}
        className="menu-panel"
        data-open={open ? "" : undefined}
        inert={!open}
      >
        <nav aria-label="Main (mobile)">
          <ul className="menu-panel__links">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={onLinkClick}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <a href={cta.href} className="btn btn--primary menu-panel__cta" onClick={onLinkClick}>
          {cta.label}
        </a>
      </div>
    </>
  );
}
