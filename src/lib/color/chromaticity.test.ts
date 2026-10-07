import { describe, expect, it } from "vitest";

import {
  chromaticityOf,
  gamutPointToSrgb,
} from "./chromaticity";
import { hexToSrgb, srgbToHex } from "./hex";
import { isInGamutLinear, srgbToXyz, xyzToLinearSrgb } from "./xyz";

describe("chromaticityOf (forward derivation)", () => {
  it("maps the sRGB red primary to its published chromaticity", () => {
    const { x, y } = chromaticityOf({ r: 1, g: 0, b: 0 });
    expect(x).toBeCloseTo(0.64, 3);
    expect(y).toBeCloseTo(0.33, 3);
  });

  it("maps D65 white to (0.3127, 0.3290)", () => {
    const { x, y } = chromaticityOf({ r: 1, g: 1, b: 1 });
    expect(x).toBeCloseTo(0.3127, 3);
    expect(y).toBeCloseTo(0.329, 3);
  });

  it("carries the luminance Y through", () => {
    // Red primary's Y per the Lindbloom sRGB→XYZ matrix.
    expect(chromaticityOf({ r: 1, g: 0, b: 0 }).Y).toBeCloseTo(0.2126729, 6);
  });

  it("snaps black to D65 so the Cursor stays visible and the reverse path stays total", () => {
    const chroma = chromaticityOf({ r: 0, g: 0, b: 0 });
    expect(chroma.x).toBeCloseTo(0.3127, 4);
    expect(chroma.y).toBeCloseTo(0.329, 4);
    expect(chroma.Y).toBe(0);
  });
});

describe("gamutPointToSrgb (reverse drag path)", () => {
  // Drag points across and beyond the diagram — including regions outside the
  // locus and the sRGB triangle at many luminance levels.
  const xs = [-0.05, 0, 0.05, 0.15, 0.3127, 0.45, 0.6, 0.7347, 0.8, 1.2];
  const ys = [-0.05, 0, 0.05, 0.2, 0.329, 0.5, 0.7, 0.8338, 0.95, 1.2];
  const Ys = [0, 0.05, 0.2, 0.5, 0.8441, 1];

  it("never produces out-of-gamut sRGB (ticket-05 store guarantee, isInGamutLinear predicate)", () => {
    for (const Y of Ys) {
      for (const x of xs) {
        for (const y of ys) {
          const rgb = gamutPointToSrgb(x, y, Y);
          const linear = xyzToLinearSrgb(srgbToXyz(rgb));
          expect(isInGamutLinear(linear), `at (x=${x}, y=${y}, Y=${Y})`).toBe(true);
        }
      }
    }
  });

  it("preserves the luminance Y exactly through the gamutMapLab path", () => {
    // D65 chromaticity is in gamut at every Y: no mapping needed, so Y must
    // survive to 8-bit quantization precision.
    for (const Y of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const rgb = gamutPointToSrgb(0.3127, 0.329, Y);
      expect(srgbToXyz(rgb).y).toBeCloseTo(Y, 2);
    }
  });

  it("round-trips in-gamut colors: color → (x, y, Y) → reverse path → same color", () => {
    // 8-bit-exact colors so encode quantization is a no-op. hexToSrgb's
    // Srgba return is fine: the Current Color model drops alpha at the boundary.
    for (const hex of ["#aaffcc", "#ff0000", "#223344", "#f39d91"]) {
      const rgb = hexToSrgb(hex)!;
      const chroma = chromaticityOf(rgb);
      const back = gamutPointToSrgb(chroma.x, chroma.y, chroma.Y);
      expect(srgbToHex({ ...back, a: 1 })).toBe(hex);
    }
  });
});
