/**
 * URL state for the Current Color: `?color=<hex>` (spec Implementation
 * Decisions). Seeding reads the query string; writing uses
 * `history.replaceState` — no navigation, no history entries.
 */

import { hexToSrgb } from "../lib/color/hex";
import type { Srgb } from "../lib/color/types";

/** Parse `?color=<hex>` from a location search string. Returns null when absent or invalid. */
export function initialColorFromSearch(search: string): Srgb | null {
  if (typeof search !== "string") return null;
  const raw = new URLSearchParams(search).get("color");
  if (!raw) return null;
  const parsed = hexToSrgb(raw);
  if (!parsed) return null;
  // Current Color is opaque: drop any parsed alpha.
  return { r: parsed.r, g: parsed.g, b: parsed.b };
}

/** Replace the URL's color param for the Current Color's hex (no history spam).
 *  Unrelated query params are preserved — only `color` is ours. */
export function writeColorToUrl(hex: string): void {
  if (typeof window === "undefined" || !window.history) return;
  const params = new URLSearchParams(window.location.search);
  params.set("color", hex.replace(/^#/, ""));
  window.history.replaceState(null, "", `?${params.toString()}`);
}
