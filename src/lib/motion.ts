"use client";

/*
  Motion preference. Every visit starts in full motion (the 3D is the point of the site); visitors
  who prefer calm can switch to reduced motion with the toggle. The choice is remembered;
  ?motion=full|reduced overrides it.
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

function compute(): boolean {
  return readChoice() === "reduced";
}

function emit() {
  cached = compute();
  document.documentElement.classList.toggle("reduce-motion", cached);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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
