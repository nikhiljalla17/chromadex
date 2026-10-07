import { describe, expect, it } from "vitest";

import { spectralFillLinear } from "./spectral";
import { isInGamutLinear } from "./xyz";

describe("spectralFillLinear", () => {
  it("renders the sRGB primaries as their pure channels", () => {
    const cases = [
      { xy: { x: 0.64, y: 0.33 }, dominant: "r", muted: ["g", "b"] },
      { xy: { x: 0.3, y: 0.6 }, dominant: "g", muted: ["r", "b"] },
      { xy: { x: 0.15, y: 0.06 }, dominant: "b", muted: ["r", "g"] },
    ] as const;
    for (const { xy, dominant, muted } of cases) {
      const c = spectralFillLinear(xy.x, xy.y);
      expect(c[dominant]).toBeCloseTo(1, 2);
      for (const ch of muted) expect(c[ch]).toBeCloseTo(0, 2);
    }
  });

  it("renders D65 white as neutral full brightness", () => {
    const c = spectralFillLinear(0.3127, 0.329);
    expect(c.r).toBeCloseTo(1, 2);
    expect(c.g).toBeCloseTo(1, 2);
    expect(c.b).toBeCloseTo(1, 2);
    expect(Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)).toBeLessThan(1e-2);
  });

  it("normalizes brightness: the largest linear channel is exactly 1 for an arbitrary in-triangle chromaticity", () => {
    // A point comfortably inside the sRGB triangle (between R, G, B).
    const c = spectralFillLinear(0.4, 0.45);
    expect(Math.max(c.r, c.g, c.b)).toBeCloseTo(1, 6);
    expect(isInGamutLinear(c)).toBe(true);
  });

  it("desaturates out-of-gamut chromaticities toward white without hue distortion (520 nm locus point)", () => {
    // 520 nm (0.074302, 0.833803) lies outside the sRGB triangle.
    const c = spectralFillLinear(0.074302, 0.833803);
    // Still green-dominant (hue preserved by the white-mix direction)…
    expect(c.g).toBeGreaterThan(c.r);
    expect(c.g).toBeGreaterThan(c.b);
    // …in gamut after the mix…
    expect(c.r).toBeGreaterThanOrEqual(-1e-4);
    expect(c.g).toBeGreaterThanOrEqual(-1e-4);
    expect(c.b).toBeGreaterThanOrEqual(-1e-4);
    // …and at full brightness.
    expect(Math.max(c.r, c.g, c.b)).toBeCloseTo(1, 6);
  });

  it("desaturates the purple-line region while staying magenta-ish", () => {
    // Midpoint of the purple line (700 nm → 380 nm): below the sRGB R–B edge.
    const c = spectralFillLinear(0.454401, 0.135137);
    expect(c.r).toBeGreaterThan(c.g);
    expect(c.b).toBeGreaterThan(c.g);
    expect(Math.max(c.r, c.g, c.b)).toBeCloseTo(1, 6);
  });

  it("is total for degenerate inputs (y = 0 yields black, not NaN)", () => {
    expect(spectralFillLinear(0.5, 0)).toEqual({ r: 0, g: 0, b: 0 });
    // The 4-dp D65 chromaticity rounds slightly off the module's exact white
    // (Xn 0.95047, Yn 1, Zn 1.08883), so r ≈ 0.9996, not 1e-6-exact.
    expect(spectralFillLinear(0.3127, 0.329).r).toBeCloseTo(1, 3);
  });
});