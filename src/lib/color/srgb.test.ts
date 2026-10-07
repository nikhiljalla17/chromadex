import { describe, expect, it } from "vitest";
import { srgbDecode, srgbEncode, clampUnit } from "./srgb";

describe("srgbDecode / srgbEncode", () => {
  it("maps the poles exactly", () => {
    expect(srgbDecode(0)).toBe(0);
    expect(srgbDecode(1)).toBe(1);
    expect(srgbEncode(0)).toBe(0);
    expect(srgbEncode(1)).toBe(1);
  });

  it("matches the published linear value for 8-bit mid-gray", () => {
    // 128/255 → 0.215861... (Lindbloom tables)
    expect(srgbDecode(128 / 255)).toBeCloseTo(0.2158605001, 9);
  });

  it("uses the asymmetric thresholds per the standard", () => {
    // Decode threshold 0.04045 → linear 0.04045/12.92
    expect(srgbDecode(0.04045)).toBeCloseTo(0.04045 / 12.92, 12);
    // One step below the decode threshold stays linear-division
    expect(srgbDecode(0.04044)).toBeCloseTo(0.04044 / 12.92, 12);
    // Encode threshold 0.0031308 → 12.92·v
    expect(srgbEncode(0.0031308)).toBeCloseTo(0.0031308 * 12.92, 12);
    expect(srgbEncode(0.0031307)).toBeCloseTo(0.0031307 * 12.92, 12);
  });

  it("round-trips every 8-bit value through decode → encode", () => {
    for (let v = 0; v < 256; v++) {
      expect(srgbEncode(srgbDecode(v / 255))).toBeCloseTo(v / 255, 12);
    }
  });

  it("clamps out-of-range input (total functions)", () => {
    expect(srgbDecode(-1)).toBe(0);
    expect(srgbDecode(2)).toBe(1);
    expect(srgbEncode(-1)).toBe(0);
    expect(srgbEncode(2)).toBe(1);
    expect(clampUnit(-0.5)).toBe(0);
    expect(clampUnit(1.5)).toBe(1);
  });
});