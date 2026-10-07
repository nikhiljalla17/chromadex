import { describe, expect, it, vi } from "vitest";

import {
  createCurrentColorStore,
  hexOf,
  hslOf,
  labOf,
  STARTING_COLOR_SRGB,
} from "./current-color-store";
import { initialColorFromSearch, writeColorToUrl } from "./url-state";

describe("current color store", () => {
  it("starts at the given Current Color with no invalid flag", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);
    expect(store.getState()).toEqual({
      color: { r: 170 / 255, g: 1, b: 204 / 255 },
      invalidHex: false,
    });
  });

  it("setFromHex updates the Current Color and every derived representation", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);

    store.dispatch({ type: "setFromHex", hex: "#ff0000" });

    const state = store.getState();
    expect(state.color).toEqual({ r: 1, g: 0, b: 0 });
    expect(state.invalidHex).toBe(false);
    expect(hexOf(state)).toBe("#ff0000");
    expect(hslOf(state)).toEqual({ h: 0, s: 1, l: 0.5 });
    // Plain-D65 Lab, per the ticket 02 pipeline decision.
    expect(labOf(state).l).toBeCloseTo(53.24, 1);
  });

  it("setFromHex with invalid hex is a no-op for the color and sets the invalid flag", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);

    store.dispatch({ type: "setFromHex", hex: "not-a-color" });

    const state = store.getState();
    expect(state.color).toEqual(STARTING_COLOR_SRGB);
    expect(state.invalidHex).toBe(true);

    // A later valid write clears the flag.
    store.dispatch({ type: "setFromHex", hex: "00ff00" });
    expect(store.getState().invalidHex).toBe(false);
  });

  it("setFromSrgb (any other source) updates the derived hex field — two-way", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);

    store.dispatch({ type: "setFromSrgb", color: { r: 0, g: 0, b: 1 } });

    expect(store.getState().color).toEqual({ r: 0, g: 0, b: 1 });
    expect(hexOf(store.getState())).toBe("#0000ff");
  });

  it("setFromSrgb clamps out-of-range channels — clamped actions never go out of gamut", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);

    store.dispatch({ type: "setFromSrgb", color: { r: 1.5, g: -0.2, b: 0.5 } });

    expect(store.getState().color).toEqual({ r: 1, g: 0, b: 0.5 });
  });

  it("setFromHex drops alpha — the Current Color model is opaque", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);

    store.dispatch({ type: "setFromHex", hex: "#ff000080" });

    expect(store.getState().color).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexOf(store.getState())).toBe("#ff0000");
  });

  it("notifies subscribers on every action", () => {
    const store = createCurrentColorStore(STARTING_COLOR_SRGB);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch({ type: "setFromHex", hex: "#ff0000" });
    store.dispatch({ type: "setFromHex", hex: "bogus" });
    unsubscribe();
    store.dispatch({ type: "setFromHex", hex: "#0000ff" });

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("initialColorFromSearch", () => {
  it('parses ?color=<hex> with or without "#"', () => {
    expect(initialColorFromSearch("?color=ff0000")).toEqual({
      r: 1,
      g: 0,
      b: 0,
    });
    expect(initialColorFromSearch("?color=%23ff0000")).toEqual({
      r: 1,
      g: 0,
      b: 0,
    });
  });

  it("returns null when the param is absent or invalid", () => {
    expect(initialColorFromSearch("")).toBeNull();
    expect(initialColorFromSearch("?other=1")).toBeNull();
    expect(initialColorFromSearch("?color=zzz")).toBeNull();
    expect(initialColorFromSearch("?color=12345")).toBeNull();
  });
});

describe("writeColorToUrl", () => {
  const cleanup = () => window.history.replaceState(null, "", "/");

  it("writes the color param while preserving unrelated query params", () => {
    window.history.replaceState(null, "", "/?foo=1");

    writeColorToUrl("#ff0000");

    expect(window.location.search).toContain("color=ff0000");
    expect(window.location.search).toContain("foo=1");
    cleanup();
  });

  it("rewrites an existing color param in place", () => {
    window.history.replaceState(null, "", "/?color=aaffcc");

    writeColorToUrl("#0000ff");

    expect(window.location.search).toBe("?color=0000ff");
    cleanup();
  });
});
