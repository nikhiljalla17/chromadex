/**
 * sRGB ↔ XYZ ↔ Lab (plain D65 pipeline, no Bradford adaptation).
 *
 * Matrices: Bruce Lindbloom's sRGB D65 derivation (Y = 1.0 nominal), one
 * variant set, not mixed with the color.org/IEC published variants:
 * http://www.brucelindbloom.com/Eqn_RGB_XYZ_Matrix.html
 *
 * Lab constants per Lindbloom with the exact rationals (matching chroma.js):
 * - reference white Xn = 0.95047, Yn = 1, Zn = 1.08883 (0–1 scale)
 * - ε = 216/24389, κ = 24389/27 ("intent of the CIE standard" variants)
 * - XYZ → Lab: http://www.brucelindbloom.com/Eqn_XYZ_to_Lab.html
 * - Lab → XYZ: http://www.brucelindbloom.com/Eqn_Lab_to_XYZ.html
 */

import { srgbDecode, srgbEncode } from "./srgb";
import type { Lab, Srgb, Xyz } from "./types";

// Lindbloom sRGB → XYZ, D65, Y = 1.0 (rows: X, Y, Z).
const M_SRGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const;

// Lindbloom's inverse matrix (XYZ → linear sRGB), matched variant set.
const M_XYZ_TO_SRGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const;

// D65 reference white on the 0–1 XYZ scale.
const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;

// Exact rationals per the brief/ticket (chroma.js convention).
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

/** sRGB (0–1) → XYZ (0–1 scale, D65). */
export function srgbToXyz(rgb: Srgb): Xyz {
  const r = srgbDecode(rgb.r);
  const g = srgbDecode(rgb.g);
  const b = srgbDecode(rgb.b);
  return {
    x: M_SRGB_TO_XYZ[0][0] * r + M_SRGB_TO_XYZ[0][1] * g + M_SRGB_TO_XYZ[0][2] * b,
    y: M_SRGB_TO_XYZ[1][0] * r + M_SRGB_TO_XYZ[1][1] * g + M_SRGB_TO_XYZ[1][2] * b,
    z: M_SRGB_TO_XYZ[2][0] * r + M_SRGB_TO_XYZ[2][1] * g + M_SRGB_TO_XYZ[2][2] * b,
  };
}

/** XYZ → linear sRGB, without companding or clamping. Canonical out-of-gamut test. */
export function xyzToLinearSrgb(xyz: Xyz): Srgb {
  return {
    r: M_XYZ_TO_SRGB[0][0] * xyz.x + M_XYZ_TO_SRGB[0][1] * xyz.y + M_XYZ_TO_SRGB[0][2] * xyz.z,
    g: M_XYZ_TO_SRGB[1][0] * xyz.x + M_XYZ_TO_SRGB[1][1] * xyz.y + M_XYZ_TO_SRGB[1][2] * xyz.z,
    b: M_XYZ_TO_SRGB[2][0] * xyz.x + M_XYZ_TO_SRGB[2][1] * xyz.y + M_XYZ_TO_SRGB[2][2] * xyz.z,
  };
}

/**
 * Quantization noise at the gamut boundary: MINDE-shortcut boundary colors that
 * pass through 8-bit encode/decode can re-decode to linear values a few
 * float-ULPs outside the exact boundary (real case: −2.9e-9). The predicate
 * treats this float-noise headroom as in-gamut; the safety argument is that
 * every downstream exit path (srgbEncode/clampLinear/store clampUnit) clamps
 * unconditionally, so no out-of-gamut color can ever be stored. Anything
 * clearly beyond noise (e.g. −0.001) remains genuinely out of gamut.
 */
const GAMUT_NOISE = 1e-6;

/** A linear-sRGB triple is in the sRGB gamut iff every component is in [0, 1], within 8-bit quantization noise. Canonical out-of-gamut test. */
export function isInGamutLinear(linear: Srgb): boolean {
  return (
    linear.r >= -GAMUT_NOISE &&
    linear.r <= 1 + GAMUT_NOISE &&
    linear.g >= -GAMUT_NOISE &&
    linear.g <= 1 + GAMUT_NOISE &&
    linear.b >= -GAMUT_NOISE &&
    linear.b <= 1 + GAMUT_NOISE
  );
}

/** XYZ → sRGB with naive per-channel clipping (CSS `clip()`, the fast path). */
export function xyzToSrgb(xyz: Xyz): Srgb {
  const linear = xyzToLinearSrgb(xyz);
  return {
    r: srgbEncode(linear.r),
    g: srgbEncode(linear.g),
    b: srgbEncode(linear.b),
  };
}

/** XYZ → CIE Lab (D65, L in [0, 100]). Total: any finite XYZ is accepted. */
export function xyzToLab(xyz: Xyz): Lab {
  const xr = xyz.x / XN;
  const yr = xyz.y / YN;
  const zr = xyz.z / ZN;
  const fx = f(xr);
  const fy = f(yr);
  const fz = f(zr);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** CIE Lab → XYZ (0–1 scale). Total for all finite inputs; out-of-gamut results flow to the GMA. */
export function labToXyz(lab: Lab): Xyz {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;

  const xr = cube(fx) > EPSILON ? cube(fx) : (116 * fx - 16) / KAPPA;
  const yr = lab.l > KAPPA * EPSILON ? cube((lab.l + 16) / 116) : lab.l / KAPPA;
  const zr = cube(fz) > EPSILON ? cube(fz) : (116 * fz - 16) / KAPPA;

  return { x: xr * XN, y: yr * YN, z: zr * ZN };
}

/** CIE f(t): cbrt above ε, linear below (Lindbloom, XYZ → Lab). */
function f(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

/** xyY chromaticity → XYZ (standard relation X = x·Y/y, Z = (1−x−y)·Y/y). Total: y = 0 maps to black. */
export function xyYToXyz(x: number, y: number, Y: number): Xyz {
  if (y === 0) return { x: 0, y: 0, z: 0 };
  return { x: (x * Y) / y, y: Y, z: ((1 - x - y) * Y) / y };
}

function cube(v: number): number {
  return v * v * v;
}