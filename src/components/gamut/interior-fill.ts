/**
 * The Gamut Map's color-filled interior (ticket 13): a raster of the spectral
 * locus interior, one pixel per crop coordinate, colored via
 * `spectralFillLinear` (spectral chromaticities in their own color; out-of-
 * gamut regions desaturated toward D65 white).
 *
 * The raster is STATIC — the locus and crop never change — so it is computed
 * once per size and memoized module-level ({@link gamutInteriorPixels}). The
 * component draws it into a <canvas> underlay beneath the interactive SVG
 * overlay; the canvas is pointer-events-inert and aria-hidden, so drag
 * handling (on the SVG surface) and a11y semantics are unchanged.
 */

import { srgbEncode } from "../../lib/color/srgb";
import { spectralFillLinear } from "../../lib/color/spectral";
import { CROP, SPECTRAL_LOCUS } from "./locus-data";

/** Memoized raster per size; keyed by the one parameter that can change it. */
const cache = new Map<number, Uint8ClampedArray>();

/**
 * Ray-casting point-in-polygon against the spectral-locus polygon (the table
 * in order; the wrap from the 700 nm point back to 380 nm IS the purple
 * line, so the closed polygon is exactly the horseshoe boundary).
 */
export function isInsideLocus(x: number, y: number): boolean {
  let inside = false;
  const n = SPECTRAL_LOCUS.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = SPECTRAL_LOCUS[i].y;
    const yj = SPECTRAL_LOCUS[j].y;
    // Standard even-odd rule: count edge crossings of the leftward ray.
    if (yi > y !== yj > y) {
      const xi = SPECTRAL_LOCUS[i].x;
      const xj = SPECTRAL_LOCUS[j].x;
      const intersectX = xi + ((y - yi) / (yj - yi)) * (xj - xi);
      if (x < intersectX) inside = !inside;
    }
  }
  return inside;
}

/**
 * The interior raster as RGBA bytes (alpha 0 outside the locus), computed
 * once per size and memoized. Pixel (px, py) maps to chromaticity via the
 * SAME CROP constants as the SVG mapping, so the canvas underlay and the SVG
 * overlay can never drift.
 */
export function gamutInteriorPixels(size: number): Uint8ClampedArray {
  const cached = cache.get(size);
  if (cached) return cached;

  const data = new Uint8ClampedArray(size * size * 4);
  const spanX = CROP.xMax - CROP.xMin;
  const spanY = CROP.yMax - CROP.yMin;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Pixel centers, screen-space y flipped exactly like xyToSvg.
      const x = CROP.xMin + ((px + 0.5) / size) * spanX;
      const y = CROP.yMax - ((py + 0.5) / size) * spanY;
      if (!isInsideLocus(x, y)) continue;
      const c = spectralFillLinear(x, y);
      const i = (py * size + px) * 4;
      // srgbEncode clamps and gamma-encodes per channel; srgbEncode already
      // clamps, so the ×255 round-trip is safe.
      data[i] = Math.round(srgbEncode(c.r) * 255);
      data[i + 1] = Math.round(srgbEncode(c.g) * 255);
      data[i + 2] = Math.round(srgbEncode(c.b) * 255);
      data[i + 3] = 255;
    }
  }
  cache.set(size, data);
  return data;
}