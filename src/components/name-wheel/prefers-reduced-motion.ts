/**
 * `prefers-reduced-motion` media-query hook.
 *
 * Guarded for jsdom (which lacks `window.matchMedia`): the hook returns
 * `false` when the API is unavailable, so consumers get their animated
 * behavior there; tests that need the reduced path stub `window.matchMedia`
 * before mounting (see NameWheel.test.tsx for the documented stub shape).
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
