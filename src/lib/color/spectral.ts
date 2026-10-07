/**
 * Spectral interior coloring for the Gamut Map (ticket 13): the classic CIE
 * chromaticity-diagram "blob" look. Each chromaticity (x, y) renders at its
 * own brightest representable color — the linear value is normalized so its
 * largest channel is exactly 1. Brightness normalization is essential: on a
 * fixed Y=1 plane nearly every chromaticity would sit out of gamut, because
 * Y=1 is the white point's luminance, not a saturated color's (e.g. the red
 * primary's linear r is ≈ 4.74 at Y=1 but its brightest representable form
 * is the pure channel at Y = 0.2126). Normalizing instead of scaling Y keeps
 * the computation on one plane while reproducing the reference look.
 *
 * Chromaticities whose hue is not representable in sRGB (between the spectral
 * locus and the sRGB triangle, including the purple-line region) are
 * desaturated by mixing toward the D65 white point until the hue becomes
 * representable (binary search on the mix factor) — the standard
 * reference-diagram clipping technique (research brief
 * `.scratch/chromadex/research/05-gamut-map.md` §6.2, per the Wikimedia
 * CIE1931xy rendering note). This is deliberately NOT the module's
 * MINDE/GMA path (that preserves the input Y, which is meaningless here) and
 * NOT a per-channel clip (which distorts hue); mixing in xy toward white
 * preserves the hue direction exactly like the classic diagrams.
 */

import { D65_CHROMATICITY } from "./chromaticity";
import type { Srgb } from "./types";
import { xyYToXyz, xyzToLinearSrgb } from "./xyz";

/** Binary-search iterations for the white-mix boundary: 1/2^24 precision, far below 8-bit quantization. */
const WHITE_MIX_ITERATIONS = 24;

/**
 * The linear sRGB for chromaticity (x, y) at Y=1 on the white-mix line.
 * Scaling Y scales the result linearly, so hue representability (no negative
 * components) is independent of Y.
 */
function linearAtWhiteMix(t: number, x: number, y: number): Srgb {
  const cx = D65_CHROMATICITY.x + (x - D65_CHROMATICITY.x) * t;
  const cy = D65_CHROMATICITY.y + (y - D65_CHROMATICITY.y) * t;
  return xyzToLinearSrgb(xyYToXyz(cx, cy, 1));
}

/**
 * Linear sRGB color for a chromaticity inside the spectral locus, rendered
 * at full vividness (largest linear channel = 1). Total for all finite
 * inputs; degenerate inputs (y = 0 → black) yield black.
 */
export function spectralFillLinear(x: number, y: number): Srgb {
  let linear = linearAtWhiteMix(1, x, y);
  if (linear.r < 0 || linear.g < 0 || linear.b < 0) {
    // Hue not representable: binary-search the largest white-mix factor t
    // that makes it representable (t = 0 is D65 white, always representable).
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < WHITE_MIX_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      const candidate = linearAtWhiteMix(mid, x, y);
      // "Hue representable" = no negative components. Positive overshoot
      // (> 1) is fine — brightness normalization scales it down below.
      if (candidate.r >= 0 && candidate.g >= 0 && candidate.b >= 0) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    linear = linearAtWhiteMix(lo, x, y);
  }
  // Brightness normalization: scale so the largest channel is exactly 1.
  // Scaling positive channels up cannot leave the gamut (max becomes 1, the
  // rest stay ≤ 1, negatives were already eliminated above).
  const max = Math.max(linear.r, linear.g, linear.b);
  if (max <= 0) return { r: 0, g: 0, b: 0 };
  return { r: linear.r / max, g: linear.g / max, b: linear.b / max };
}