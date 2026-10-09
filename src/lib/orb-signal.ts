/*
  A tiny mutable channel between the DOM (chat box, scroll, cursor) and the 3D orb.
  The orb reads it inside useFrame, so nothing here ever triggers a React render.
*/

export const orbSignal = {
  /** cursor in normalised device coords (-1..1), relative to the viewport */
  ndcX: 0,
  ndcY: 0,
  pointerActive: false,
  /** 0 = hero, 1 = demo (progress through the sticky stage) */
  scroll: 0,
  /** the stage is on screen and the tab is visible */
  visible: true,
  /** energy from typing; decays inside the orb */
  pulse: 0,
  /** character codes waiting to launch a ripple */
  pendingRipples: [] as number[],
  /** Nova is "thinking" (between send and the first word) */
  thinking: false,
  /** Nova is streaming an answer */
  speaking: false,
  /** a word-beat to apply (consumed by the orb) */
  speakKick: 0,
  /** performance.now() of the last thing that should make the orb react */
  lastActivity: 0,
  /** set by the canvas: requests a frame when the loop is idle */
  wake: () => {},
};

export function touchOrb() {
  orbSignal.lastActivity = performance.now();
  orbSignal.wake();
}

export function orbKeystroke(code: number) {
  orbSignal.pulse = Math.min(orbSignal.pulse + 0.32, 1.6);
  if (orbSignal.pendingRipples.length < 4) orbSignal.pendingRipples.push(code);
  touchOrb();
}

export function orbThinking(on: boolean) {
  orbSignal.thinking = on;
  touchOrb();
}

export function orbSpeaking(on: boolean) {
  orbSignal.speaking = on;
  touchOrb();
}

export function orbWordBeat() {
  orbSignal.speakKick = 1;
  touchOrb();
}
