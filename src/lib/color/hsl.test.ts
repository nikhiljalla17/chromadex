import { describe, expect, it } from "vitest";
import { hslToSrgb, srgbToHsl } from "./hsl";
import type { Srgb } from "./types";

const rgb = (r: number, g: number, b: number): Srgb => ({ r, g, b });

describe("srgbToHsl", () => {
  it("extracts canonical hues for the primaries", () => {
    expect(srgbToHsl(rgb(1, 0, 0))).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(srgbToHsl(rgb(0, 1, 0))).toEqual({ h: 120, s: 1, l: 0.5 });
    expect(srgbToHsl(rgb(0, 0, 1))).toEqual({ h: 240, s: 1, l: 0.5 });
    expect(srgbToHsl(rgb(1, 1, 0))).toEqual({ h: 60, s: 1, l: 0.5 });
    expect(srgbToHsl(rgb(0, 1, 1))).toEqual({ h: 180, s: 1, l: 0.5 });
    expect(srgbToHsl(rgb(1, 0, 1))).toEqual({ h: 300, s: 1, l: 0.5 });
  });

  it("returns h = 0 (never 360) at the red axis", () => {
    expect(srgbToHsl(rgb(1, 0, 0)).h).toBe(0);
  });

  it("treats achromatic colors as s = 0, h = 0", () => {
    expect(srgbToHsl(rgb(0.5, 0.5, 0.5))).toEqual({ h: 0, s: 0, l: 0.5 });
    expect(srgbToHsl(rgb(0, 0, 0))).toEqual({ h: 0, s: 0, l: 0 });
    expect(srgbToHsl(rgb(1, 1, 1))).toEqual({ h: 0, s: 0, l: 1 });
  });
});

describe("hslToSrgb", () => {
  it("reproduces the primaries", () => {
    expect(hslToSrgb({ h: 0, s: 1, l: 0.5 })).toEqual(rgb(1, 0, 0));
    expect(hslToSrgb({ h: 120, s: 1, l: 0.5 })).toEqual(rgb(0, 1, 0));
    expect(hslToSrgb({ h: 240, s: 1, l: 0.5 })).toEqual(rgb(0, 0, 1));
  });

  it("normalizes any hue into [0, 360) before use", () => {
    expect(hslToSrgb({ h: 480, s: 1, l: 0.5 })).toEqual(rgb(0, 1, 0)); // 480 ≡ 120
    expect(hslToSrgb({ h: -120, s: 1, l: 0.5 })).toEqual(rgb(0, 0, 1)); // −120 ≡ 240
    expect(hslToSrgb({ h: 720, s: 1, l: 0.5 })).toEqual(rgb(1, 0, 0));
  });

  it("collapses to gray when s = 0, regardless of hue", () => {
    expect(hslToSrgb({ h: 123, s: 0, l: 0.5 })).toEqual(rgb(0.5, 0.5, 0.5));
    expect(hslToSrgb({ h: 300, s: 0, l: 0.25 })).toEqual(rgb(0.25, 0.25, 0.25));
  });

  it("clamps out-of-range s/l instead of throwing (CSS parse-time semantics)", () => {
    // Negative saturation clamps to 0 → gray, per CSS Color 4.
    expect(hslToSrgb({ h: 0, s: -5, l: 0.5 })).toEqual(rgb(0.5, 0.5, 0.5));
    expect(hslToSrgb({ h: 0, s: 5, l: -1 })).toEqual(rgb(0, 0, 0));
    expect(hslToSrgb({ h: 0, s: 5, l: 2 })).toEqual(rgb(1, 1, 1));
  });
});

describe("sRGB ↔ HSL round trip", () => {
  it("round-trips every 8-bit combination on a coarse grid within half a quantum", () => {
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 19) {
        for (let b = 0; b < 256; b += 23) {
          const original = { r: r / 255, g: g / 255, b: b / 255 };
          const back = hslToSrgb(srgbToHsl(original));
          expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(0.5 / 255);
          expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(0.5 / 255);
          expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(0.5 / 255);
        }
      }
    }
  });

  it("is hue-consistent near the red axis", () => {
    expect(srgbToHsl(rgb(1, 0, 0)).h).toBe(0);
    expect(srgbToHsl(rgb(1, 1e-12, 0)).h).toBeCloseTo(0, 9);
  });
});