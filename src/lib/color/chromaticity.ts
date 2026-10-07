/**
 * Chromaticity derivation: the forward Current Color → (x, y, Y) derivation
 * and the reverse Gamut Map point → nearest producible sRGB color path.
 *
 * Reverse path (research brief `.scratch/chromadex/research/05-gamut-map.md`
 * §4): (x, y) + luminance Y → `xyYToXyz` → `xyzToLab` → `gamutMapLab`.
 * `gamutMapLab` reduces chroma at constant L and constant hue, and Lab L is a
 * monotonic function of Y alone — so the mapped color sits at exactly the
 * slider's Y. This is the CSS Color 4 §14.2 "nearest producible color"
 * semantics; naive per-channel clipping would distort both hue and Y.
 */

import { gamutMapLab } from "./gamut";
import { srgbToXyz, xyYToXyz, xyzToLab } from "./xyz";
import type { Srgb } from "./types";

/** D65 white chromaticity, derived from the module's white (Xn 0.95047, Yn 1, Zn 1.08883) and matching IEC 61966-2-1. */
export const D65_CHROMATICITY = { x: 0.3127, y: 0.329 } as const;

/** A color's position on the chromaticity plane plus its luminance Y. */
export interface Chromaticity {
  x: number;
  y: number;
  /** CIE Y (0–1 scale) — the luminance slider's dimension. */
  Y: number;
}

/**
 * Current Color → (x, y, Y). Black (XYZ = 0) has undefined xy; snap to D65 so
 * the Cursor stays visible and the reverse path stays total (brief §4).
 */
export function chromaticityOf(rgb: Srgb): Chromaticity {
  const xyz = srgbToXyz(rgb);
  const sum = xyz.x + xyz.y + xyz.z;
  if (sum === 0) {
    return { x: D65_CHROMATICITY.x, y: D65_CHROMATICITY.y, Y: 0 };
  }
  return { x: xyz.x / sum, y: xyz.y / sum, Y: xyz.y };
}

/**
 * Gamut Map point → nearest producible sRGB color: the drag/luminance
 * reverse path. Total for all finite inputs; the result is always in the
 * sRGB gamut (constant-L/constant-h chroma reduction, then 8-bit encode).
 */
export function gamutPointToSrgb(x: number, y: number, Y: number): Srgb {
  return gamutMapLab(xyzToLab(xyYToXyz(x, y, Y)));
}
