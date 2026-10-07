import { describe, expect, it } from "vitest";

import { srgbEncode } from "../../lib/color/srgb";
import { spectralFillLinear } from "../../lib/color/spectral";
import { gamutInteriorPixels, isInsideLocus } from "./interior-fill";
import { CROP } from "./locus-data";

describe("isInsideLocus", () => {
  it("contains interior points, excludes the crop corners and outside-locus points", () => {
    expect(isInsideLocus(0.3127, 0.329)).toBe(true); // D65 white
    expect(isInsideLocus(0.1, 0.6)).toBe(true); // left arm of the horseshoe
    expect(isInsideLocus(0.4, 0.2)).toBe(true); // above the purple line
    expect(isInsideLocus(0.05, 0.85)).toBe(false); // outside the locus, upper left
    expect(isInsideLocus(CROP.xMin + 0.001, CROP.yMax - 0.001)).toBe(false);
    expect(isInsideLocus(CROP.xMax - 0.001, CROP.yMin + 0.001)).toBe(false);
  });
});

describe("gamutInteriorPixels", () => {
  it("memoizes per size (static raster computed once)", () => {
    const first = gamutInteriorPixels(24);
    expect(gamutInteriorPixels(24)).toBe(first);
  });

  it("emits an RGBA raster of the requested size", () => {
    const pixels = gamutInteriorPixels(24);
    expect(pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(pixels.length).toBe(24 * 24 * 4);
  });

  it("fills pixels consistently with spectralFillLinear (mapping + encode + alpha)", () => {
    const pixels = gamutInteriorPixels(24);
    const spanX = CROP.xMax - CROP.xMin;
    const spanY = CROP.yMax - CROP.yMin;
    // The pixel nearest D65 white: its center is slightly off-white, so the
    // expected color is computed from ITS OWN chromaticity — this checks the
    // raster ↔ color-module pipeline, not neutrality.
    const px = Math.floor(((0.3127 - CROP.xMin) / spanX) * 24);
    const py = Math.floor(((CROP.yMax - 0.329) / spanY) * 24);
    const xc = CROP.xMin + ((px + 0.5) / 24) * spanX;
    const yc = CROP.yMax - ((py + 0.5) / 24) * spanY;
    const expected = spectralFillLinear(xc, yc);
    const i = (py * 24 + px) * 4;
    expect(pixels[i]).toBe(Math.round(srgbEncode(expected.r) * 255));
    expect(pixels[i + 1]).toBe(Math.round(srgbEncode(expected.g) * 255));
    expect(pixels[i + 2]).toBe(Math.round(srgbEncode(expected.b) * 255));
    expect(pixels[i + 3]).toBe(255);
    // And it is near-neutral (a hair off white due to pixel quantization).
    expect(Math.abs(pixels[i] - pixels[i + 1])).toBeLessThanOrEqual(24);
  });

  it("leaves the crop corner transparent", () => {
    const pixels = gamutInteriorPixels(24);
    expect(pixels[(0 * 24 + 0) * 4 + 3]).toBe(0);
  });

  it("colors a bounded fraction of the crop (the horseshoe interior, not everything)", () => {
    const pixels = gamutInteriorPixels(24);
    let opaque = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 255) opaque++;
    }
    const fraction = opaque / (24 * 24);
    // Locus interior ≈ 40% of the crop area; guard against pathological fills.
    expect(fraction).toBeGreaterThan(0.15);
    expect(fraction).toBeLessThan(0.65);
  });
});