"use client";

/*
  Motion preference. The OS "reduce motion" setting is respected by default, but plenty of
  Windows users switch animations off for speed rather than comfort — so visitors can turn
  full motion back on. The choice is remembered; ?motion=full|reduced overrides it.
*/
import { useSyncExternalStore } from "react";

const KEY = "nova-motion";
type Choice = "full" | "reduced";

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function readChoice(): Choice | null {
  const fromUrl = new URLSearchParams(window.location.search).get("motion");
  if (fromUrl === "full" || fromUrl === "reduced") return fromUrl;
  try {
    const saved = window.localStorage.getItem(KEY);
    return saved === "full" || saved === "reduced" ? saved : null;
  } catch {
    return null;
  }
}

function systemReduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function compute(): boolean {
  const choice = readChoice();
  return choice === "full" ? false : choice === "reduced" ? true : systemReduced();
}

function emit() {
  cached = compute();
  document.documentElement.classList.toggle("reduce-motion", cached);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", emit);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", emit);
  };
}

function getSnapshot() {
  if (cached === null) cached = compute();
  return cached;
}

/** Server render assumes reduced motion: nothing moves until the client knows better. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

export function setMotion(choice: Choice) {
  let saved = false;
  try {
    window.localStorage.setItem(KEY, choice);
    saved = true;
  } catch {
    saved = false;
  }
  const url = new URL(window.location.href);
  if (saved) url.searchParams.delete("motion");
  else url.searchParams.set("motion", choice);
  try {
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* ignore */
  }
  emit();
}
