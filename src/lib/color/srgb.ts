/**
 * sRGB transfer functions (IEC 61966-2-1), per Bruce Lindbloom:
 * - decode (sRGB → linear): http://www.brucelindbloom.com/Eqn_RGB_to_XYZ.html
 * - encode (linear → sRGB): http://www.brucelindbloom.com/Eqn_XYZ_to_RGB.html
 *
 * The two thresholds are intentionally asymmetric (0.04045 decode, 0.0031308
 * encode) — that is per the standard, not a typo.
 */

import type { Srgb } from "./types";

/** Decode one sRGB channel (0–1) to linear light. Total: inputs are clamped to [0, 1] first; poles are exact. */
export function srgbDecode(v: number): number {
  const c = clampUnit(v);
  if (c === 0) return 0;
  if (c === 1) return 1;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Encode one linear-light channel to sRGB (0–1). Total: inputs are clamped to [0, 1] first; poles are exact. */
export function srgbEncode(v: number): number {
  const c = clampUnit(v);
  if (c === 0) return 0;
  if (c === 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function clampUnit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * WCAG 2.x relative luminance (WCAG 2.1 §1.4.3 definition): the weighted sum
 * of linearized sRGB channels (R 0.2126, G 0.7152, B 0.0722), in [0, 1].
 * Note: WCAG's published text uses the 0.03928 linearization threshold (a
 * known errata-class typo); this follows the IEC-correct 0.04045 — identical
 * for all 8-bit sRGB inputs, and only theoretically different for floats in
 * the 0.03928–0.04045 gap.
 * Numerically ≈ CIE Y from srgbToXyz (same transfer, weights agree to the
 * 5th decimal: 0.2126 vs 0.2126729) but computed per the WCAG formula so the
 * info panel's WCAG figure is the standard's own definition, not a proxy.
 */
export function wcagRelativeLuminance(rgb: Srgb): number {
  return (
    0.2126 * srgbDecode(rgb.r) + 0.7152 * srgbDecode(rgb.g) + 0.0722 * srgbDecode(rgb.b)
  );
}