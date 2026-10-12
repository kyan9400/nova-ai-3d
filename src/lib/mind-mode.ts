/*
  Mind mode (Calm / Focus / Bright) for the demo card. A tiny external store so the buttons render
  the saved choice without a hydration mismatch (the server always renders Calm).
  The choice lives in orbSignal.mode (read by the orb) and in localStorage "nova-mode".
*/
import { orbSignal, touchOrb } from "./orb-signal";

export type Mode = 0 | 1 | 2;
const KEY = "nova-mode";
const listeners = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = Number(window.localStorage.getItem(KEY));
    if (saved === 1 || saved === 2) orbSignal.mode = saved;
  } catch {
    /* storage blocked: stay on Calm */
  }
}

export function subscribeMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMode(): Mode {
  load();
  return orbSignal.mode;
}

export function setMode(mode: Mode) {
  orbSignal.mode = mode;
  try {
    window.localStorage.setItem(KEY, String(mode));
  } catch {
    /* ignore */
  }
  touchOrb();
  listeners.forEach((l) => l());
}
