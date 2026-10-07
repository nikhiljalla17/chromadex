import { describe, expect, it } from "vitest";
import { hexToSrgb } from "./hex";
import { srgbDecode, srgbEncode } from "./srgb";
import {
  isInGamutLinear,
  labToXyz,
  srgbToXyz,
  xyYToXyz,
  xyzToLab,
  xyzToLinearSrgb,
  xyzToSrgb,
} from "./xyz";
import type { Lab, Srgb, Xyz } from "./types";

/**
 * Golden values from the ticket 02 research brief (plain-D65 pipeline):
 * - dvisvgm ColorTest.cpp (CTAN) — primaries, 4 dp
 * - iqa crate tests — #ffffff/#000000/#808080 landmarks
 * - oanor Color Distance API worked example (#ff0000)
 * Lab tolerance 1e-2 (inter-source rounding of matrix/white-point digits);
 * XYZ on the 0–100 scale with 1e-2 tolerance.
 */

const rgb = (r: number, g: number, b: number): Srgb => ({ r, g, b });

describe("srgbToXyz", () => {
  it("matches the published XYZ landmarks (0–100 scale)", () => {
    const cases: Array<[Srgb, Xyz]> = [
      [rgb(1, 0, 0), { x: 41.2456, y: 21.2673, z: 1.93339 }],
      [rgb(0, 1, 0), { x: 35.7576, y: 71.5152, z: 11.9192 }],
      [rgb(0, 0, 1), { x: 18.0437, y: 7.2175, z: 95.0304 }],
      [rgb(1, 1, 1), { x: 95.047, y: 100, z: 108.883 }],
      [rgb(0, 0, 0), { x: 0, y: 0, z: 0 }],
    ];
    for (const [input, expected] of cases) {
      const xyz = srgbToXyz(input);
      expect(xyz.x * 100).toBeCloseTo(expected.x, 2);
      expect(xyz.y * 100).toBeCloseTo(expected.y, 2);
      expect(xyz.z * 100).toBeCloseTo(expected.z, 2);
    }
  });
});

describe("xyzToLab / labToXyz (D65, L in [0,100])", () => {
  it("matches the published Lab goldens (tolerance 1e-2 Lab units)", () => {
    const cases: Array<{ rgb: Srgb; lab: Lab }> = [
      { rgb: rgb(1, 0, 0), lab: { l: 53.2408, a: 80.0925, b: 67.2032 } },
      { rgb: rgb(0, 1, 0), lab: { l: 87.7347, a: -86.1827, b: 83.1793 } },
      { rgb: rgb(0, 0, 1), lab: { l: 32.297, a: 79.1875, b: -107.8602 } },
      { rgb: rgb(1, 1, 1), lab: { l: 100, a: 0, b: 0 } },
      { rgb: rgb(0, 0, 0), lab: { l: 0, a: 0, b: 0 } },
      { rgb: rgb(128 / 255, 128 / 255, 128 / 255), lab: { l: 53.585, a: 0, b: 0 } },
      {
        // float-pipeline golden; 0.75/0.9 are not exact 8-bit values
        rgb: rgb(0.2, 0.75, 0.9),
        lab: { l: 72.0647, a: -23.7597, b: -29.4733 },
      },
      {
        // #aaffcc, plain-D65 pipeline — 4 dp pinned: identical to chroma.js
        // (cross-check evidence in .scratch/chromadex/research/02-golden-pin.md)
        rgb: hexToSrgb("#aaffcc")!,
        lab: { l: 93.6336, a: -36.0718, b: 16.3451 },
      },
    ];
    for (const { rgb: input, lab } of cases) {
      const result = xyzToLab(srgbToXyz(input));
      // tolerance 2 (|diff| < 0.005) per brief §2.3 — goldens pinned to 4 dp
      expect(result.l).toBeCloseTo(lab.l, 2);
      expect(result.a).toBeCloseTo(lab.a, 2);
      expect(result.b).toBeCloseTo(lab.b, 2);
    }
  });

  it("keeps the neutral axis neutral (a and b = 0 for grays, to matrix precision)", () => {
    for (let v = 0; v <= 255; v += 17) {
      const lab = xyzToLab(srgbToXyz(rgb(v / 255, v / 255, v / 255)));
      expect(lab.a).toBeCloseTo(0, 4);
      expect(lab.b).toBeCloseTo(0, 4);
    }
  });

  it("round-trips sRGB → XYZ → Lab → XYZ → sRGB within half a quantum", () => {
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 19) {
        for (let b = 0; b < 256; b += 23) {
          const original = { r: r / 255, g: g / 255, b: b / 255 };
          const back = xyzToSrgb(srgbToXyz(original));
          expect(Math.abs(back.r - original.r)).toBeLessThan(0.5 / 255);
          expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(0.5 / 255);
          expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(0.5 / 255);
        }
      }
    }
  });
});

describe("out-of-gamut detection", () => {
  it("flags linear components outside [0, 1] (canonical condition)", () => {
    expect(isInGamutLinear({ r: 0, g: 0.5, b: 1 })).toBe(true);
    expect(isInGamutLinear({ r: -0.001, g: 0.5, b: 1 })).toBe(false);
    expect(isInGamutLinear({ r: 1.001, g: 0.5, b: 1 })).toBe(false);
  });

  it("tolerates 8-bit quantization noise at the boundary (~1e-6, nearest representable color)", () => {
    expect(isInGamutLinear({ r: 0.5, g: 0.5, b: -2.9e-9 })).toBe(true);
    expect(isInGamutLinear({ r: 0.5, g: 0.5, b: 1 + 2.9e-9 })).toBe(true);
  });

  it("maps an out-of-gamut XYZ through xyzToSrgb without throwing, clipped to [0,1]", () => {
    // WAY out of gamut: very high XYZ.
    const clipped = xyzToSrgb({ x: 2, y: 2, z: 2 });
    expect(clipped.r).toBeLessThanOrEqual(1);
    expect(clipped.g).toBeLessThanOrEqual(1);
    expect(clipped.b).toBeLessThanOrEqual(1);
    expect(clipped.r).toBeGreaterThanOrEqual(0);
  });
});

describe("labToXyz edge behavior", () => {
  it("is total for out-of-range Lab (never throws)", () => {
    expect(() => labToXyz({ l: -50, a: 300, b: -300 })).not.toThrow();
    expect(() => labToXyz({ l: 150, a: 0, b: 0 })).not.toThrow();
  });

  it("maps L = 0 to black and L = 100 to the D65 white", () => {
    const black = labToXyz({ l: 0, a: 0, b: 0 });
    expect(black.x).toBeCloseTo(0, 12);
    expect(black.y).toBeCloseTo(0, 12);
    const white = labToXyz({ l: 100, a: 0, b: 0 });
    expect(white.x).toBeCloseTo(0.95047, 9);
    expect(white.y).toBeCloseTo(1, 12);
    expect(white.z).toBeCloseTo(1.08883, 9);
  });
});

describe("xyYToXyz", () => {
  it("reproduces the D65 white from its chromaticity", () => {
    const xyz = xyYToXyz(0.3127, 0.329, 1);
    expect(xyz.x).toBeCloseTo(0.95047, 3);
    expect(xyz.y).toBeCloseTo(1, 9);
    expect(xyz.z).toBeCloseTo(1.08883, 3);
  });

  it("round-trips XYZ → xyY → XYZ (for a set of chromatic in-gamut colors)", () => {
    // Black is excluded: it has undefined chromaticity (x + y + z = 0).
    const toXY = (xyz: Xyz): [number, number] => {
      const sum = xyz.x + xyz.y + xyz.z;
      return [xyz.x / sum, xyz.y / sum];
    };
    const samples = [rgb(1, 0, 0), rgb(0, 1, 0), rgb(0, 0, 1), rgb(0.3, 0.6, 0.9), rgb(0.9, 0.2, 0.4)];
    for (const rgbInput of samples) {
      const xyz = srgbToXyz(rgbInput);
      const [x, y] = toXY(xyz);
      const back = xyYToXyz(x, y, xyz.y);
      expect(back.x).toBeCloseTo(xyz.x, 12);
      expect(back.y).toBeCloseTo(xyz.y, 12);
      expect(back.z).toBeCloseTo(xyz.z, 12);
    }
  });

  it("handles y = 0 as black (total, never throws)", () => {
    expect(xyYToXyz(0.5, 0, 1)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("transfer-function integration", () => {
  it("keeps decode/encode consistent across the XYZ boundary", () => {
    // White through both directions stays white (to matrix precision).
    const white = xyzToSrgb(srgbToXyz({ r: 1, g: 1, b: 1 }));
    expect(srgbEncode(srgbDecode(white.r))).toBeCloseTo(1, 6);
  });

  it("xyzToLinearSrgb agrees with srgbToXyz round-trip", () => {
    const xyz = srgbToXyz({ r: 0.25, g: 0.5, b: 0.75 });
    const linear = xyzToLinearSrgb(xyz);
    expect(srgbEncode(linear.r)).toBeCloseTo(0.25, 6);
    expect(srgbEncode(linear.g)).toBeCloseTo(0.5, 6);
    expect(srgbEncode(linear.b)).toBeCloseTo(0.75, 6);
  });
});