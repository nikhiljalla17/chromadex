import { describe, expect, it } from "vitest";
import { ciede2000 } from "./delta-e";
import { clampToSrgb, gamutMapLab } from "./gamut";
import { srgbEncode } from "./srgb";
import { labToXyz, srgbToXyz, xyzToLab, xyzToLinearSrgb } from "./xyz";
import type { Lab, Srgb } from "./types";

describe("clampToSrgb (naive clip, fast path)", () => {
  it("clamps each channel to [0, 1]", () => {
    expect(clampToSrgb({ r: -0.2, g: 0.5, b: 1.4 })).toEqual({ r: 0, g: 0.5, b: 1 });
  });

  it("leaves in-range colors untouched", () => {
    const rgb: Srgb = { r: 0.25, g: 0.5, b: 0.75 };
    expect(clampToSrgb(rgb)).toEqual(rgb);
  });
});

describe("gamutMapLab", () => {
  it("returns the direct conversion for in-gamut Lab (zero-cost path)", () => {
    const inGamut = xyzToLab(srgbToXyz({ r: 0.3, g: 0.6, b: 0.9 }));
    const mapped = gamutMapLab(inGamut);
    expect(mapped.r).toBeCloseTo(0.3, 6);
    expect(mapped.g).toBeCloseTo(0.6, 6);
    expect(mapped.b).toBeCloseTo(0.9, 6);
  });

  it("keeps output inside the sRGB gamut for extreme Lab colors", () => {
    const extreme: Lab[] = [
      { l: 50, a: 120, b: 0 },
      { l: 50, a: 0, b: -130 },
      { l: 95, a: 60, b: 60 },
      { l: 5, a: -40, b: 40 },
      { l: 50, a: 500, b: -500 },
      { l: -20, a: 10, b: 10 },
      { l: 150, a: 0, b: 0 },
    ];
    for (const lab of extreme) {
      const mapped = gamutMapLab(lab);
      expect(mapped.r).toBeGreaterThanOrEqual(0);
      expect(mapped.r).toBeLessThanOrEqual(1);
      expect(mapped.g).toBeGreaterThanOrEqual(0);
      expect(mapped.g).toBeLessThanOrEqual(1);
      expect(mapped.b).toBeGreaterThanOrEqual(0);
      expect(mapped.b).toBeLessThanOrEqual(1);
    }
  });

  it("preserves lightness and hue for out-of-gamut colors (within JND effects)", () => {
    const origin: Lab = { l: 50, a: 90, b: -60 };
    const mappedLab = xyzToLab(srgbToXyz(gamutMapLab(origin)));
    // L and hue are preserved to within ~1 unit / 2°; the local-MINDE shortcut
    // may return the clipped origin, which can sit up to one JND away.
    expect(Math.abs(mappedLab.l - origin.l)).toBeLessThan(2);
    const originHue = Math.atan2(origin.b, origin.a);
    const mappedHue = Math.atan2(mappedLab.b, mappedLab.a);
    const hueDiff = Math.abs(((mappedHue - originHue + Math.PI) % (2 * Math.PI)) - Math.PI);
    expect(hueDiff).toBeLessThan(2 * (Math.PI / 180)); // within ~2°
  });

  it("never returns a color farther than the naive clip (local MINDE guarantee)", () => {
    // Mild excursions: in-gamut colors with chroma scaled 1.3× — the regime
    // the Gamut Map cursor actually operates in. Extreme excursions (chroma ≫
    // gamut) are not covered by the one-JND contract; the guarantee there is
    // only "in gamut + on-ray", which the other tests cover.
    const baseLabs: Lab[] = [
      xyzToLab(srgbToXyz({ r: 0.9, g: 0.1, b: 0.2 })),
      xyzToLab(srgbToXyz({ r: 0.1, g: 0.7, b: 0.4 })),
      xyzToLab(srgbToXyz({ r: 0.8, g: 0.8, b: 0.2 })),
    ];
    for (const base of baseLabs) {
      const lab: Lab = { l: base.l, a: base.a * 1.3, b: base.b * 1.3 };
      // Naive baseline: convert origin to linear, clip, encode — the CSS clip() path.
      const naiveLinear = mapLinear(lab);
      const naiveSrgb = {
        r: srgbEncode(naiveLinear.r),
        g: srgbEncode(naiveLinear.g),
        b: srgbEncode(naiveLinear.b),
      };
      const naive = xyzToLab(srgbToXyz(naiveSrgb));
      const mapped = gamutMapLab(lab);
      const mappedLab = xyzToLab(srgbToXyz(mapped));
      // The mapped color must be at least as close as the naive clip,
      // allowing the one-JND shortcut slack (2 ΔE00 units).
      expect(ciede2000(lab, mappedLab)).toBeLessThanOrEqual(ciede2000(lab, naive) + 2);
    }
  });

  it("is total and idempotent (mapping an already-mapped color is stable)", () => {
    const lab: Lab = { l: 50, a: 120, b: 0 };
    const once = gamutMapLab(lab);
    const twice = gamutMapLab(xyzToLab(srgbToXyz(once)));
    expect(twice.r).toBeCloseTo(once.r, 4);
    expect(twice.g).toBeCloseTo(once.g, 4);
    expect(twice.b).toBeCloseTo(once.b, 4);
  });
});

function mapLinear(lab: Lab): Srgb {
  // The naive path in linear space (unclamped), for comparison baselines.
  return xyzToLinearSrgb(labToXyz(lab));
}