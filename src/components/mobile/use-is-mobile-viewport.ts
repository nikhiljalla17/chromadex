/**
 * Mobile Spotlight shell breakpoint hook (ticket 30): true below 768px,
 * where App renders the Spotlight stack instead of the desktop three-pane.
 *
 * Same guarded-matchMedia pattern as `usePrefersReducedMotion` — jsdom lacks
 * `window.matchMedia` and reads as desktop, so the existing desktop test
 * suite is untouched; mobile tests stub the API before mounting (see
 * App.mobile.test.tsx for the stub shape).
 */

import { useEffect, useState } from "react";

/** Ticket 30 breakpoint: mobile shell below 768px, desktop at ≥ 768px. */
const QUERY = "(max-width: 767px)";

export function useIsMobileViewport(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setMobile(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}