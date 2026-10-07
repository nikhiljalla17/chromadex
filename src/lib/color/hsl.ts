/**
 * HSL ↔ sRGB per the CSS Color 4 sample algorithms (§7.1, §7.2):
 * https://drafts.csswg.org/css-color-4/
 *
 * chromadex normalizes hue itself (the spec's sample code assumes parse-time
 * normalization): `h = ((h % 360) + 360) % 360` before use; results stay in
 * [0, 360) (pure red extracts h = 0, never 360). Achromatic colors return
 * s = 0, h = 0. Saturation/lightness inputs clamp to [0, 1] (CSS parse-time
 * clamping semantics); nothing throws.
 */

import { clampUnit } from "./srgb";
import type { Hsl, Srgb } from "./types";

/** sRGB (0–1) → HSL. Hue in [0, 360); achromatic colors yield { h: 0, s: 0 }. Inputs clamp to [0, 1]. */
export function srgbToHsl(rgb: Srgb): Hsl {
  const r = clampUnit(rgb.r);
  const g = clampUnit(rgb.g);
  const b = clampUnit(rgb.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (min + max) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l: light };

  const sat =
    light === 0 || light === 1 ? 0 : (max - light) / Math.min(light, 1 - light);

  let hue: number;
  if (max === rgb.r) hue = (rgb.g - rgb.b) / d + (rgb.g < rgb.b ? 6 : 0);
  else if (max === rgb.g) hue = (rgb.b - rgb.r) / d + 2;
  else hue = (rgb.r - rgb.g) / d + 4;

  // The +6 branch keeps hue in [0, 6) before scaling; guard float drift anyway.
  const h = (hue * 60) % 360;
  return { h: h < 0 ? h + 360 : h, s: sat, l: light };
}

/** HSL → sRGB (0–1). Hue wraps modulo 360; s/l clamp to [0, 1]; s = 0 → gray regardless of hue. */
export function hslToSrgb(hsl: Hsl): Srgb {
  const h = (((hsl.h % 360) + 360) % 360) / 30;
  const s = clampUnit(hsl.s);
  const light = clampUnit(hsl.l);

  const a = s * Math.min(light, 1 - light);
  const f = (n: number): number => {
    const k = (n + h) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0), g: f(8), b: f(4) };
}