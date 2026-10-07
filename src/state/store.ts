/**
 * App-wide Current Color store singleton + React binding.
 *
 * Seeds from `?color=` on load (falling back to the default), keeps the URL in
 * sync via history.replaceState, and exposes hooks. Views call `useCurrentColor`
 * and write through `currentColorStore.dispatch` — no per-component state.
 */

import { useSyncExternalStore } from "react";

import {
  createCurrentColorStore,
  STARTING_COLOR_SRGB,
  type CurrentColorAction,
  type CurrentColorState,
} from "./current-color-store";
import { initialColorFromSearch } from "./url-state";
import { startUrlSync } from "./url-sync";

const seeded =
  typeof window !== "undefined"
    ? (initialColorFromSearch(window.location.search) ?? STARTING_COLOR_SRGB)
    : STARTING_COLOR_SRGB;

export const currentColorStore = createCurrentColorStore(seeded);

// URL writes are coalesced to one per animation frame: a Gamut Map drag is a
// burst of dispatches, and per-dispatch replaceState churns history objects
// for no benefit (ticket-04 review carry-over; see url-sync.ts).
if (typeof window !== "undefined") {
  startUrlSync(currentColorStore);
}

export function useCurrentColor(): CurrentColorState {
  return useSyncExternalStore(
    currentColorStore.subscribe,
    currentColorStore.getState,
  );
}

export function dispatchCurrentColor(action: CurrentColorAction): void {
  currentColorStore.dispatch(action);
}
