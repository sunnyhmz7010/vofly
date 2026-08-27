import { useEffect, useState } from "react";

// Returns whether a CSS media query currently matches. SSR-safe (defaults false).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, [query]);

  return matches;
}
