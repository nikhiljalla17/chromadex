/**
 * The Current Color store — the single mutable state in chromadex (spec:
 * "Single state seam"). Framework-agnostic; React wiring lives in ./store.tsx.
 *
 * The Current Color is sRGB float channels in [0, 1], opaque (the Current
 * Color model has no alpha; Drivers parse and drop it). Every view derives
 * from this state via the selectors below; every control writes through
 * `dispatch`. Invalid Driver input never changes the color — it only sets a
 * flag the offending Driver can render.
 */

import {
  hexToSrgb,
  oklabToOklch,
  srgbToHsl,
  srgbToHex,
  srgbToOklab,
  srgbToXyz,
  xyzToLab,
  type Hsl,
  type Lab,
  type Oklch,
  type Srgb,
} from "../lib/color";
import { clampUnit } from "../lib/color/srgb";
export interface CurrentColorState {
  /** The Current Color — sRGB float channels in [0, 1], opaque. */
  color: Srgb;
  /** True when the most recent `setFromHex` action carried invalid hex (a no-op for the color). */
  invalidHex: boolean;
}

export type CurrentColorAction =
  | { type: "setFromHex"; hex: string }
  | { type: "setFromSrgb"; color: Srgb };

/** App default (used when the URL carries no valid color). */
export const STARTING_COLOR_SRGB: Srgb = { r: 170 / 255, g: 1, b: 204 / 255 };

export interface CurrentColorStore {
  getState(): CurrentColorState;
  dispatch(action: CurrentColorAction): void;
  subscribe(listener: () => void): () => void;
}

export function createCurrentColorStore(
  initial: Srgb = STARTING_COLOR_SRGB,
): CurrentColorStore {
  let state: CurrentColorState = { color: { ...initial }, invalidHex: false };
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    dispatch(action) {
      switch (action.type) {
        case "setFromHex": {
          const parsed = hexToSrgb(action.hex);
          if (!parsed) {
            state = { ...state, invalidHex: true };
          } else {
            // Current Color is opaque: parse alpha, drop it at the boundary.
            state = {
              color: { r: parsed.r, g: parsed.g, b: parsed.b },
              invalidHex: false,
            };
          }
          break;
        }
        case "setFromSrgb":
          // Clamp at the boundary: a clamped action can never produce
          // out-of-gamut sRGB (spec guarantee — ticket 03 review carry-over).
          state = {
            color: {
              r: clampUnit(action.color.r),
              g: clampUnit(action.color.g),
              b: clampUnit(action.color.b),
            },
            invalidHex: false,
          };
          break;
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// --- Derived selectors (pure; views never keep their own copy of the color) ---

/** The Current Color as a canonical `#rrggbb` string (the hex Driver's value). */
export function hexOf(state: CurrentColorState): string {
  return srgbToHex({ ...state.color, a: 1 });
}

/** The Current Color as HSL (h in [0, 360), s and l in [0, 1]). */
export function hslOf(state: CurrentColorState): Hsl {
  return srgbToHsl(state.color);
}

/** The Current Color as Lab (D65 plain pipeline, 0–100 lightness). */
export function labOf(state: CurrentColorState): Lab {
  return xyzToLab(srgbToXyz(state.color));
}

/** The Current Color as OKLCH (Ottosson OKLab; l/c in [0, 1], h in degrees). */
export function oklchOf(state: CurrentColorState): Oklch {
  return oklabToOklch(srgbToOklab(state.color));
}
