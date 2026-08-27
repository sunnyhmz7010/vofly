import { useEffect, useRef } from "react";

// Polling hook mirroring VoHive's: immediate run, fixed interval, pauses when hidden.
export function usePolling(fn: () => void, intervalMs: number, immediate = true) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    let timer: number | null = null;
    let stopped = false;

    const run = () => {
      if (!stopped && !document.hidden) saved.current();
    };
    const start = () => {
      stop();
      timer = window.setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        run();
        start();
      }
    };

    if (immediate) run();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, immediate]);
}
