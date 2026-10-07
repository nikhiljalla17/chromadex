/**
 * URL sync for the Current Color, coalesced to one write per animation frame
 * (Nolan Lawson's rAF-throttle pattern — research brief §5). A Gamut Map
 * drag is a burst of dispatches; without coalescing every pointermove would
 * churn a `history.replaceState` for no benefit. The scheduled flush reads
 * the *latest* state, so the URL always ends correct after a burst.
 *
 * The scheduler and write sink are injectable so tests can run the
 * coalescing logic deterministically without a frame loop.
 */

import { hexOf, type CurrentColorStore } from "./current-color-store";
import { writeColorToUrl } from "./url-state";

export type ScheduleFn = (callback: () => void) => () => void;

function rafSchedule(callback: () => void): () => void {
  const id = requestAnimationFrame(() => callback());
  return () => cancelAnimationFrame(id);
}

/**
 * Subscribe `store` and coalesce its URL writes per frame. Returns a stop
 * function that cancels any pending flush and unsubscribes.
 */
export function startUrlSync(
  store: CurrentColorStore,
  schedule: ScheduleFn = rafSchedule,
  write: (hex: string) => void = writeColorToUrl,
): () => void {
  let cancelScheduled: (() => void) | null = null;

  const unsubscribe = store.subscribe(() => {
    if (cancelScheduled) return; // flush already scheduled; it reads the latest state
    cancelScheduled = schedule(() => {
      cancelScheduled = null;
      write(hexOf(store.getState()));
    });
  });

  return () => {
    cancelScheduled?.();
    cancelScheduled = null;
    unsubscribe();
  };
}
