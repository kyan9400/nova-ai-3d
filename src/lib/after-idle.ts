/*
  Run cb once the page has fully loaded AND the main thread is idle (never during hydration).
  Shared by the 3D stage and the UI enhancements so both wait for the headline to paint first.
  Returns a cancel function.
*/
type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function afterLoadIdle(cb: () => void, timeout = 2500): () => void {
  const w = window as IdleWindow;
  let cancelled = false;
  // idle callbacks and timeouts have separate id spaces, so remember which one was used
  let idleHandle = 0;
  let timeoutHandle = 0;
  const run = () => {
    if (!cancelled) cb();
  };
  const schedule = () => {
    if (w.requestIdleCallback) idleHandle = w.requestIdleCallback(run, { timeout });
    else timeoutHandle = window.setTimeout(run, 600);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", schedule);
    if (idleHandle && w.cancelIdleCallback) w.cancelIdleCallback(idleHandle);
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
  };
}
