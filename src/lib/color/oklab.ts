/**
 * OKLab / OKLCH (Björn Ottosson, "A perceptual color space for digital
 * processing") — used by the info panel for the read-only OKLCH display.
 *
 * Reference: https://bottosson.github.io/posts/oklab/ — the reference
 * implementation in the post, with the matrices updated 2021-01-25
 * ("derived using a higher precision sRGB matrix and with exactly matching
 * D65 values"). Public domain / MIT at the author's option.
 *
 * Conventions (matching the rest of the module, src/lib/color/types.ts):
 * - Input is *encoded* sRGB in [0, 1]; transfer decode/encode via ./srgb
 *   (Ottosson's reference takes *linear* sRGB, so we wrap it).
 * - OKLab L in [0, 1] (0–1 convention, unlike CIE Lab's 0–100).
 * - OKLCH: c is chroma (≈[0, 0.4] in sRGB), h in degrees [0, 360).
 *   h === 0 for achromatic colors (chroma 0), matching the srgbToHsl
 *   achromatic convention.
 */

import { srgbDecode, srgbEncode } from "./srgb";
import type { Oklab, Oklch, Srgb } from "./types";

/** OKLab: lightness in [0, 1]; a/b opponent axes (a: green↔red, b: blue↔yellow). */

// Linear sRGB → LMS cone response (Ottosson 2021-01-25, row sums exactly 1).
const M_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
] as const;

// LMS^1/3 → OKLab.
const M_OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
] as const;

// OKLab → LMS^1/3.
const M_LMS_FROM_OKLAB = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
] as const;

// LMS → linear sRGB (inverse of M_LMS, matched variant set).
const M_SRGB = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
] as const;

/** Encoded sRGB (0–1) → OKLab. */
export function srgbToOklab(rgb: Srgb): Oklab {
  const r = srgbDecode(rgb.r);
  const g = srgbDecode(rgb.g);
  const b = srgbDecode(rgb.b);

  const l = M_LMS[0][0] * r + M_LMS[0][1] * g + M_LMS[0][2] * b;
  const m = M_LMS[1][0] * r + M_LMS[1][1] * g + M_LMS[1][2] * b;
  const s = M_LMS[2][0] * r + M_LMS[2][1] * g + M_LMS[2][2] * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: M_OKLAB[0][0] * l_ + M_OKLAB[0][1] * m_ + M_OKLAB[0][2] * s_,
    a: M_OKLAB[1][0] * l_ + M_OKLAB[1][1] * m_ + M_OKLAB[1][2] * s_,
    b: M_OKLAB[2][0] * l_ + M_OKLAB[2][1] * m_ + M_OKLAB[2][2] * s_,
  };
}

/** OKLab → encoded sRGB (0–1); channels clamp via srgbEncode (total function). */
export function oklabToSrgb(lab: Oklab): Srgb {
  const l_ = M_LMS_FROM_OKLAB[0][0] * lab.l + M_LMS_FROM_OKLAB[0][1] * lab.a + M_LMS_FROM_OKLAB[0][2] * lab.b;
  const m_ = M_LMS_FROM_OKLAB[1][0] * lab.l + M_LMS_FROM_OKLAB[1][1] * lab.a + M_LMS_FROM_OKLAB[1][2] * lab.b;
  const s_ = M_LMS_FROM_OKLAB[2][0] * lab.l + M_LMS_FROM_OKLAB[2][1] * lab.a + M_LMS_FROM_OKLAB[2][2] * lab.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: srgbEncode(M_SRGB[0][0] * l + M_SRGB[0][1] * m + M_SRGB[0][2] * s),
    g: srgbEncode(M_SRGB[1][0] * l + M_SRGB[1][1] * m + M_SRGB[1][2] * s),
    b: srgbEncode(M_SRGB[2][0] * l + M_SRGB[2][1] * m + M_SRGB[2][2] * s),
  };
}

/** OKLab → OKLCH (c = chroma magnitude, h = hue in degrees [0, 360); h = 0 when achromatic).
 *
 * Achromatic threshold: exact grays produce chroma at float-noise scale
 * (measured ≈ 2.3e-8 from the reference implementation's own roundoff),
 * while any perceptibly chromatic color has C ≥ ~0.005. Below 1e-6 the hue
 * is pure roundoff junk, so we normalize to the srgbToHsl achromatic
 * convention (h = 0).
 */
const ACHROMATIC_EPSILON = 1e-6;

export function oklabToOklch(lab: Oklab): Oklch {
  const c = Math.hypot(lab.a, lab.b);
  if (c <= ACHROMATIC_EPSILON) return { l: lab.l, c: 0, h: 0 };
  const h = Math.atan2(lab.b, lab.a) * (180 / Math.PI);
  return { l: lab.l, c, h: h < 0 ? h + 360 : h };
}

/** OKLCH → OKLab. */
export function oklchToOklab(lch: Oklch): Oklab {
  const rad = lch.h * (Math.PI / 180);
  return { l: lch.l, a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad) };
}
