import { describe, expect, it } from "vitest";

import {
  CROP,
  locusPathD,
  SPECTRAL_LOCUS,
  srgbTrianglePoints,
  svgToXy,
  VIEW_SIZE,
  xyToSvg,
} from "./locus-data";

describe("spectral locus table", () => {
  it("holds the published CIE 1931 anchor values", () => {
    const byNm = new Map(SPECTRAL_LOCUS.map((p) => [p.nm, p]));
    // Spot goldens from the research brief (CIE 018:2019 Table 6 mirrors).
    expect(byNm.get(520)).toMatchObject({ x: 0.074302, y: 0.833803 });
    expect(byNm.get(550)).toMatchObject({ x: 0.301604, y: 0.692308 });
    expect(byNm.get(700)).toMatchObject({ x: 0.73469, y: 0.26531 });
  });

  it("spans 380–700 nm in 10 nm steps with no duplicate rows", () => {
    expect(SPECTRAL_LOCUS[0].nm).toBe(380);
    expect(SPECTRAL_LOCUS[SPECTRAL_LOCUS.length - 1].nm).toBe(700);
    expect(SPECTRAL_LOCUS).toHaveLength(33);
    expect(new Set(SPECTRAL_LOCUS.map((p) => p.nm)).size).toBe(33);
  });

  it("every row satisfies the x + y + z = 1 checksum", () => {
    for (const { nm, x, y, z } of SPECTRAL_LOCUS) {
      expect(x + y + z, `${nm} nm`).toBeCloseTo(1, 5);
    }
  });
});

describe("xy ↔ SVG mapping", () => {
  it("is invertible", () => {
    for (const { x, y } of SPECTRAL_LOCUS) {
      const [px, py] = xyToSvg(x, y);
      const back = svgToXy(px, py);
      expect(back.x).toBeCloseTo(x, 10);
      expect(back.y).toBeCloseTo(y, 10);
    }
  });

  it("flips the y axis for screen space (higher chromaticity y → smaller SVG y)", () => {
    const [, pyLow] = xyToSvg(0.3, 0.1);
    const [, pyHigh] = xyToSvg(0.3, 0.7);
    expect(pyHigh).toBeLessThan(pyLow);
  });

  it("maps the crop corners to the viewBox corners", () => {
    expect(xyToSvg(CROP.xMin, CROP.yMax)).toEqual([0, 0]);
    expect(xyToSvg(CROP.xMax, CROP.yMin)).toEqual([VIEW_SIZE, VIEW_SIZE]);
  });
});

describe("path builders", () => {
  it("starts at 380 nm, ends at the 700 nm point, and closes (purple line)", () => {
    const d = locusPathD();
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/ Z$/);
    const first = SPECTRAL_LOCUS[0];
    const last = SPECTRAL_LOCUS[SPECTRAL_LOCUS.length - 1];
    expect(d).toContain(xyToSvg(first.x, first.y).map((v) => v.toFixed(3)).join(" "));
    expect(d).toContain(xyToSvg(last.x, last.y).map((v) => v.toFixed(3)).join(" "));
  });

  it("emits the sRGB triangle through its three published primaries", () => {
    const points = srgbTrianglePoints();
    expect(points.split(" ").filter((_, i) => i % 2 === 0)).toHaveLength(3);
  });
});
