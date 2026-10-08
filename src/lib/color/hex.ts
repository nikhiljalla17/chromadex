/**
 * Hex ↔ sRGB per the CSS Color 4 `<hex-color>` grammar (§5.2):
 * `#` followed by exactly 3, 4, 6, or 8 hex digits, case-insensitive.
 * chromadex additions (per the research brief): surrounding whitespace is
 * trimmed and a leading `#` is optional. Any other shape → null (never throw).
 *
 * Alpha: 4/8-digit forms parse alpha so callers can decide; the Current Color
 * model is opaque, so `srgbToHex` emits 8 digits only when alpha < 1.
 */

import { clampUnit } from "./srgb";
import type { Srgba } from "./types";

const HEX_DIGITS = /^([0-9a-f]+)$/i;

/** Parse a hex color string. Returns null for malformed input (defined "no color" result). */
export function hexToSrgb(input: string): Srgba | null {
  if (typeof input !== "string") return null;
  let text = input.trim();
  if (text.startsWith("#")) text = text.slice(1);
  if (!HEX_DIGITS.test(text)) return null;

  switch (text.length) {
    case 3: {
      const [r, g, b] = [...text].map((d) => parseInt(d + d, 16));
      return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
    }
    case 4: {
      const [r, g, b, a] = [...text].map((d) => parseInt(d + d, 16));
      return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
    }
    case 6: {
      const r = parseInt(text.slice(0, 2), 16);
      const g = parseInt(text.slice(2, 4), 16);
      const b = parseInt(text.slice(4, 6), 16);
      return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
    }
    case 8: {
      const r = parseInt(text.slice(0, 2), 16);
      const g = parseInt(text.slice(2, 4), 16);
      const b = parseInt(text.slice(4, 6), 16);
      const a = parseInt(text.slice(6, 8), 16);
      return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
    }
    default:
      // 1, 2, 5, 7, or >8 hex digits: valid characters, invalid length.
      return null;
  }
}

/**
 * Contrast-aware ink (black or white) for text rendered on a hex fill.
 * The on-device prototype's `contrastInk` (MobilePrototype v2), moved here
 * so the mobile swatch bar and the ticket-31 wheel chips share one spelling
 * of the validated spec. Byte math on the 8-bit hex (not the WCAG
 * linearized luminance) is deliberate — it is the validated look.
 */
export function contrastInk(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? "#000" : "#fff";
}

/** Format an sRGB color as `#rrggbb` (or `#rrggbbaa` when alpha < 1). Quantizes to 8-bit. */
export function srgbToHex(rgb: Srgba): string {
  const r = quantize(rgb.r);
  const g = quantize(rgb.g);
  const b = quantize(rgb.b);
  const a = quantize(clampUnit(rgb.a));
  const body = `${byte(r)}${byte(g)}${byte(b)}`;
  return a < 255 ? `#${body}${byte(a)}` : `#${body}`;
}

function quantize(v: number): number {
  const c = clampUnit(v);
  return Math.round(c * 255);
}

function byte(v: number): string {
  return v.toString(16).padStart(2, "0");
}