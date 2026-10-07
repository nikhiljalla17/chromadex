/**
 * Gamut mapping: mapping any Lab color to the nearest producible sRGB color.
 *
 * Two exported strategies (per the ticket 02 research brief §4):
 * - `clampToSrgb`: naive per-channel clipping — CSS's `clip()` fast path, O(1),
 *   used for final quantization and already-nearly-in-gamut colors.
 * - `gamutMapLab`: constant-lightness, constant-hue chroma reduction in CIE
 *   LCh(ab) via binary search — the CSS Color 4 §14.2.2 "Binary Search Gamut
 *   Mapping with Local MINDE" approach adapted to LCh(ab) (no Oklab dependency).
 *   Rationale: CSSWG #9449 documents that naive clipping breaks user
 *   expectations; constant-L/constant-h reduction is the CSSWG-chosen
 *   "nearest producible color" semantics.
 *
 * The local-MINDE shortcut: if the clipped origin color is within one JND
 * (2 ΔE00 units in CIE Lab) of the chroma-reduced candidate, return the
 * clipped origin — it is perceptually as close and cheaper to name.
 */

import { ciede2000 } from "./delta-e";
import { clampUnit, srgbEncode } from "./srgb";
import type { Lab, Srgb } from "./types";
import { isInGamutLinear, labToXyz, srgbToXyz, xyzToLab, xyzToLinearSrgb } from "./xyz";

/** Naive per-channel clip to [0, 1] on already-encoded sRGB values. */
export function clampToSrgb(rgb: Srgb): Srgb {
  return { r: clampUnit(rgb.r), g: clampUnit(rgb.g), b: clampUnit(rgb.b) };
}

/**
 * Map a Lab color to the nearest producible sRGB color.
 * In-gamut → direct conversion (zero-cost). Out-of-gamut → binary-search the
 * chroma scale factor t ∈ [0, 1] applied to (a, b), keeping L and the hue
 * angle fixed, then clip the final step. Total for all finite inputs.
 */
export function gamutMapLab(lab: Lab): Srgb {
  const linear = labToLinearSrgb(lab);
  if (isInGamutLinear(linear)) {
    return { r: srgbEncode(linear.r), g: srgbEncode(linear.g), b: srgbEncode(linear.b) };
  }

  const chroma = Math.hypot(lab.a, lab.b);
  if (chroma === 0) {
    return clampLinear(linear);
  }

  const hue = Math.atan2(lab.b, lab.a);

  // Binary search the largest chroma scale whose color is in gamut.
  // The achromatic axis (t = 0) is in gamut for L ∈ [0, 100]; out-of-range L
  // falls through to the final clip below either way.
  let lo = 0;
  let hi = 1;
  while (hi - lo > 1e-4) {
    const mid = (lo + hi) / 2;
    if (isInGamutLinear(labToLinearSrgb(scaleChroma(lab, hue, chroma * mid)))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const reducedLinear = labToLinearSrgb(scaleChroma(lab, hue, chroma * lo));
  const reducedSrgb = clampLinear(reducedLinear);

  // Local MINDE shortcut: one JND ≈ 2 ΔE00 in CIE Lab (CSS Color 4 §14.2 note).
  const clippedSrgb = clampLinear(linear);
  const clippedLab = xyzToLab(srgbToXyz(clippedSrgb));
  const reducedLab = xyzToLab(srgbToXyz(reducedSrgb));
  if (ciede2000(clippedLab, reducedLab) < 2) {
    return clippedSrgb;
  }
  return reducedSrgb;
}

function scaleChroma(lab: Lab, hue: number, chroma: number): Lab {
  return {
    l: lab.l,
    a: chroma * Math.cos(hue),
    b: chroma * Math.sin(hue),
  };
}

function labToLinearSrgb(lab: Lab): Srgb {
  return xyzToLinearSrgb(labToXyz(lab));
}

function clampLinear(linear: Srgb): Srgb {
  return {
    r: srgbEncode(clampUnit(linear.r)),
    g: srgbEncode(clampUnit(linear.g)),
    b: srgbEncode(clampUnit(linear.b)),
  };
}