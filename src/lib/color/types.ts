/**
 * Shared color-space types for the chromadex color module.
 *
 * Conventions (per the ticket 02 research brief, `.scratch/chromadex/research/02-color-module.md`):
 * - sRGB channels are float64 in [0, 1]; 8-bit quantization happens only at hex/UI boundaries.
 * - XYZ is on the 0–1 scale (D65 reference white Y = 1; white point X 0.95047, Z 1.08883).
 * - Lab uses the 0–100 convention (L in [0, 100]) against the D65 white point (plain pipeline,
 *   no Bradford adaptation — see ticket 02's resolved pipeline fork).
 * - HSL: h in degrees [0, 360), s and l in [0, 1].
 */

export interface Srgb {
  r: number;
  g: number;
  b: number;
}

export interface Srgba extends Srgb {
  /** Alpha in [0, 1]. chromadex's Current Color model is opaque; alpha is parsed and preserved so callers can decide. */
  a: number;
}

export interface Xyz {
  x: number;
  y: number;
  z: number;
}

export interface Lab {
  /** Lightness, 0–100 convention. */
  l: number;
  a: number;
  b: number;
}

export interface Hsl {
  /** Hue in degrees, normalized to [0, 360). */
  h: number;
  /** Saturation in [0, 1]. */
  s: number;
  /** Lightness in [0, 1]. */
  l: number;
}

export interface Oklab {
  /** Lightness in [0, 1] (OKLab's own 0–1 convention). */
  l: number;
  /** Opponent axis a (green −, red +). */
  a: number;
  /** Opponent axis b (blue −, yellow +). */
  b: number;
}

export interface Oklch {
  /** Lightness in [0, 1]. */
  l: number;
  /** Chroma (≈ [0, 0.4] within sRGB). */
  c: number;
  /** Hue in degrees [0, 360); 0 for achromatic colors. */
  h: number;
}