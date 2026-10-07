import { describe, expect, it } from "vitest";
import { hexToSrgb, srgbToHex } from "./hex";

describe("hexToSrgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToSrgb("#ff0000")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(hexToSrgb("#aaffcc")).toEqual({ r: 170 / 255, g: 1, b: 204 / 255, a: 1 });
  });

  it("is case-insensitive", () => {
    expect(hexToSrgb("#00FF00")).toEqual(hexToSrgb("#00ff00"));
    expect(hexToSrgb("#AbCdEf")).toEqual(hexToSrgb("#abcdef"));
  });

  it("parses 3-digit shorthand by digit doubling", () => {
    expect(hexToSrgb("#f00")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(hexToSrgb("#89A")).toEqual(hexToSrgb("#8899aa"));
  });

  it("accepts an optional leading # and trims surrounding whitespace", () => {
    expect(hexToSrgb("ff0000")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(hexToSrgb(" #A98 \n")).toEqual(hexToSrgb("#aa9988"));
  });

  it("parses 4- and 8-digit forms including alpha", () => {
    expect(hexToSrgb("#f00c")).toEqual({ r: 1, g: 0, b: 0, a: 204 / 255 });
    expect(hexToSrgb("#ff000080")).toEqual({ r: 1, g: 0, b: 0, a: 128 / 255 });
  });

  it("returns null for malformed input (never throws, never substitutes)", () => {
    expect(hexToSrgb("#bcdefg")).toBeNull();
    expect(hexToSrgb("#ff")).toBeNull(); // 2 digits: invalid length
    expect(hexToSrgb("#fffff")).toBeNull(); // 5 digits
    expect(hexToSrgb("#fffffff")).toBeNull(); // 7 digits
    expect(hexToSrgb("#ffffffffff")).toBeNull(); // >8 digits
    expect(hexToSrgb("")).toBeNull();
    expect(hexToSrgb("not a color")).toBeNull();
  });
});

describe("srgbToHex", () => {
  it("formats opaque colors as #rrggbb", () => {
    expect(srgbToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe("#ff0000");
    expect(srgbToHex({ r: 170 / 255, g: 1, b: 204 / 255, a: 1 })).toBe("#aaffcc");
  });

  it("emits 8 digits only when alpha < 1", () => {
    expect(srgbToHex({ r: 1, g: 0, b: 0, a: 0.5 })).toBe("#ff000080");
    expect(srgbToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe("#ff0000");
  });

  it("quantizes by rounding and clamps out-of-range channels", () => {
    expect(srgbToHex({ r: 0.5019, g: 0, b: 0, a: 1 })).toBe("#800000");
    expect(srgbToHex({ r: -3, g: 2, b: 0.5, a: 1 })).toBe("#00ff80");
  });

  it("round-trips through 8-bit quantization", () => {
    for (let v = 0; v < 256; v += 7) {
      const hex = srgbToHex({ r: v / 255, g: v / 255, b: v / 255, a: 1 });
      expect(hexToSrgb(hex)).toEqual({ r: v / 255, g: v / 255, b: v / 255, a: 1 });
    }
  });
});