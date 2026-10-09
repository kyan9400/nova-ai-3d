"use client";

import { setMotion, useReducedMotion } from "@/lib/motion";

export default function MotionToggle({ compact = false }: { compact?: boolean }) {
  const reduced = useReducedMotion();
  const label = reduced ? "Turn on full motion" : "Reduce motion";

  return (
    <button
      type="button"
      className={`motion-toggle${compact ? " motion-toggle--compact" : ""}`}
      onClick={() => setMotion(reduced ? "full" : "reduced")}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        {reduced ? (
          <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
        ) : (
          <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
        )}
      </svg>
      <span className={compact ? "motion-toggle__label" : undefined}>{label}</span>
    </button>
  );
}
