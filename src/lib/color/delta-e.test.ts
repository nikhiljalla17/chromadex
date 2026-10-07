import { describe, expect, it } from "vitest";
import { CIEDE2000_TEST_PAIRS } from "./ciede2000-pairs";
import { ciede2000 } from "./delta-e";
import type { Lab } from "./types";

describe("ciede2000 — official CIE supplementary test pairs", () => {
  // Sharma, Wu & Dalal (2005), "The CIEDE2000 Color-Difference Formula:
  // Implementation Notes, Supplementary Test Data, and Mathematical
  // Observations." Expected values to 4 decimal places.
  it("matches all 34 pairs to 4 dp", () => {
    for (const { lab1, lab2, expected } of CIEDE2000_TEST_PAIRS) {
      const result = ciede2000(lab1 as Lab, lab2 as Lab);
      expect(result).toBeCloseTo(expected, 4);
    }
  });

  it("is symmetric within float tolerance", () => {
    for (const { lab1, lab2 } of CIEDE2000_TEST_PAIRS) {
      const forward = ciede2000(lab1 as Lab, lab2 as Lab);
      const backward = ciede2000(lab2 as Lab, lab1 as Lab);
      expect(Math.abs(forward - backward)).toBeLessThan(1e-9);
    }
  });

  it("is zero for identical colors", () => {
    expect(ciede2000({ l: 50, a: 20, b: -30 }, { l: 50, a: 20, b: -30 })).toBe(0);
  });
});