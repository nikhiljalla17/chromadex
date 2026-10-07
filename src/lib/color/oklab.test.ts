/**
 * OKLab/OKLCH golden tests.
 *
 * Sources:
 * - Goldens pinned from a faithful transcription of Ottosson's published
 *   reference implementation (https://bottosson.github.io/posts/oklab/,
 *   matrices updated 2021-01-25), computed with the standard sRGB transfer
 *   decode. Cross-check landmark: pure red → (0.6279554, 0.2248631,
 *   0.1258463) matches the values widely quoted from Ottosson's data.
 * - Structural landmarks (white → exactly L=1, a=0, b=0; exact grays →
 *   a=b=0) are documented design constraints of the space (the post derives
 *   the model with exactly matching D65 and cone-row sums of exactly 1).
 * - XYZ→OKLab landmark table from the post: white XYZ (0.950, 1.000, 1.089)
 *   → OKLab (1.000, 0, 0) — covered by the white sRGB case.
 */
import { describe, expect, it } from "vitest";
import { hexToSrgb } from "./hex";
import { oklabToOklch, oklabToSrgb, oklchToOklab, srgbToOklab } from "./oklab";
import type { Oklab, Srgb } from "./types";

function oklabOf(hex: string): Oklab {
  return srgbToOklab(hexToSrgb(hex)!);
}

describe("srgbToOklab — goldens (pinned from Ottosson's reference implementation)", () => {
  const cases: Array<{ hex: string; expected: Oklab }> = [
    { hex: "#ff0000", expected: { l: 0.6279554, a: 0.2248631, b: 0.1258463 } },
    { hex: "#00ff00", expected: { l: 0.8664396, a: -0.2338876, b: 0.1794985 } },
    { hex: "#0000ff", expected: { l: 0.4520137, a: -0.032457, b: -0.3115281 } },
    { hex: "#aaffcc", expected: { l: 0.9321961, a: -0.0998506, b: 0.0419963 } },
    { hex: "#00aaff", expected: { l: 0.7071807, a: -0.0787385, b: -0.1483478 } },
  ];
  for (const { hex, expected } of cases) {
    it(`converts ${hex}`, () => {
      const result = oklabOf(hex);
      expect(result.l).toBeCloseTo(expected.l, 6);
      expect(result.a).toBeCloseTo(expected.a, 6);
      expect(result.b).toBeCloseTo(expected.b, 6);
    });
  }

  it("maps white exactly to L=1, a=0, b=0 (design constraint, exactly matching D65)", () => {
    const result = oklabOf("#ffffff");
    // L = 1 to within the M2 lightness row sum (0.9999999935, i.e. 6.5e-9)
    expect(result.l).toBeCloseTo(1, 7);
    expect(Math.abs(result.a)).toBeLessThan(1e-7);
    expect(Math.abs(result.b)).toBeLessThan(1e-7);
  });

  it("maps black exactly to the origin", () => {
    expect(oklabOf("#000000")).toEqual({ l: 0, a: 0, b: 0 });
  });

  it("maps exact grays to a=b=0 (cone matrix rows sum to exactly 1)", () => {
    for (const v of [25, 50, 75, 128]) {
      const hex = `#${[v, v, v].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      const { a, b } = oklabOf(hex);
      expect(Math.abs(a)).toBeLessThan(1e-7);
      expect(Math.abs(b)).toBeLessThan(1e-7);
    }
  });
});

describe("oklabToSrgb — round-trip", () => {
  it("inverts srgbToOklab for in-gamut colors (within float tolerance)", () => {
    // worst-case roundoff through decode → M1 → cbrt → M2 → inverse ≈ 1.2e-7
    // (measured); tolerance 6 dp is still ~30× finer than 8-bit quantization (3.9e-3).
    const samples: Array<Srgb> = [
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 },
      { r: 0.667, g: 1, b: 0.8 },
      { r: 0.1, g: 0.2, b: 0.3 },
      { r: 0.9, g: 0.4, b: 0.15 },
      { r: 170 / 255, g: 1, b: 204 / 255 },
      { r: 1 / 3, g: 2 / 3, b: 0.125 },
    ];
    for (const rgb of samples) {
      const back = oklabToSrgb(srgbToOklab(rgb));
      expect(back.r).toBeCloseTo(rgb.r, 6);
      expect(back.g).toBeCloseTo(rgb.g, 6);
      expect(back.b).toBeCloseTo(rgb.b, 6);
    }
  });
});

describe("OKLCH conversion", () => {
  it("red → C=0.2576833, h=29.2339° (pinned from the reference transcription)", () => {
    const { c, h } = oklabToOklch(oklabOf("#ff0000"));
    expect(c).toBeCloseTo(0.2576833, 6);
    expect(h).toBeCloseTo(29.2339, 3);
  });

  it("achromatic colors normalize to c=0, h=0 (srgbToHsl convention)", () => {
    for (const hex of ["#000000", "#ffffff", "#808080"]) {
      const { c, h } = oklabToOklch(oklabOf(hex));
      expect(c).toBe(0);
      expect(h).toBe(0);
    }
  });

  it("round-trips oklch → oklab → oklch", () => {
    const samples = [
      { l: 0.7, c: 0.15, h: 120 },
      { l: 0.5, c: 0.1, h: 264.052 },
      { l: 0.9321961, c: 0.1083228, h: 157.1888 },
      { l: 0.3, c: 0.2, h: 0 },
      { l: 0.3, c: 0.2, h: 359 },
    ];
    for (const lch of samples) {
      const back = oklabToOklch(oklchToOklab(lch));
      expect(back.l).toBeCloseTo(lch.l, 12);
      expect(back.c).toBeCloseTo(lch.c, 12);
      expect(back.h).toBeCloseTo(lch.h, 9);
    }
  });
});
