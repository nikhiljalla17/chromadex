import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import App, { currentColorStore } from "../../App";
import {
  chromaticityOf,
  gamutPointToSrgb,
} from "../../lib/color";
import { srgbToHex } from "../../lib/color/hex";
import { isInGamutLinear, srgbToXyz, xyzToLinearSrgb } from "../../lib/color/xyz";
import { STARTING_COLOR_SRGB } from "../../state/current-color-store";
import { VIEW_SIZE, xyToSvg } from "./locus-data";

function resetToStartingColor() {
  act(() => {
    currentColorStore.dispatch({ type: "setFromSrgb", color: STARTING_COLOR_SRGB });
  });
}

/**
 * Pointer coordinates in viewBox units. jsdom rects are zero-sized, so the
 * component maps clientX × 100 → viewBox units; feed clientX = px/100 here.
 */
function pointerAt(
  px: number,
  py: number,
  type: "pointerDown" | "pointerMove" | "pointerUp" = "pointerMove",
) {
  fireEvent[type](screen.getByTestId("gamut-map"), {
    clientX: px / VIEW_SIZE,
    clientY: py / VIEW_SIZE,
    pointerId: 1,
    button: 0,
  });
}

describe("Gamut Map", () => {
  beforeEach(resetToStartingColor);

  it("renders the horseshoe, color-filled interior, sRGB triangle outline, white anchor, and Cursor", () => {
    render(<App />);

    expect(screen.getByTestId("gamut-map")).toBeInTheDocument();
    // Static color-filled interior: a pointer-events-inert canvas underlay.
    const interior = screen.getByTestId("gamut-interior");
    expect(interior).toHaveAttribute("aria-hidden", "true");
    expect(interior).toHaveStyle({ pointerEvents: "none" });
    // The flat shade is gone: the triangle is now a boundary outline only.
    const triangle = screen.getByTestId("srgb-triangle");
    expect(triangle.style.fill).toBe("none");
    // The exploratory wall is clearly visible over the color fill.
    expect(triangle.style.strokeOpacity).toBe("0.9");
    expect(triangle.style.strokeWidth).toBe("1.5");
    // The Cursor marks the Current Color's chromaticity.
    const chroma = chromaticityOf(STARTING_COLOR_SRGB);
    expect(screen.getByTestId("gamut-cursor")).toBeInTheDocument();
    // Dual-tone cursor: white halo behind the black ring for clarity on any fill.
    expect(screen.getByTestId("gamut-cursor-rim")).toBeInTheDocument();
    expect(screen.getByTestId("gamut-cursor-rim").style.stroke).toBe("white");
    // Cursor position attributes reflect the Current Color (screen-space y flipped).
    const cursor = screen.getByTestId("gamut-cursor");
    const px = ((chroma.x + 0.02) / 0.82) * 100;
    const py = ((0.88 - chroma.y) / 0.9) * 100;
    expect(cursor).toHaveAttribute("cx", px.toFixed(3));
    expect(cursor).toHaveAttribute("cy", py.toFixed(3));
  });

  it("clicking the map at an in-gamut point sets the exact reverse-path color", () => {
    render(<App />);

    // D65 chromaticity is in gamut at the Current Color's Y, so a single
    // pointerDown dispatch is directly computable (no gamut-mapping shift).
    const [cx, cy] = xyToSvg(0.3127, 0.329);
    pointerAt(cx, cy, "pointerDown");

    const startY = chromaticityOf(STARTING_COLOR_SRGB).Y;
    const expected = srgbToHex({
      ...gamutPointToSrgb(0.3127, 0.329, startY),
      a: 1,
    });
    expect(screen.getByTestId("hex-input")).toHaveValue(expected);
  });

  it("dragging (down → move → up) updates the Current Color continuously and keeps it in gamut", () => {
    render(<App />);

    const [cx, cy] = xyToSvg(0.3127, 0.329);
    pointerAt(cx, cy, "pointerDown");
    const afterDown = currentColorStore.getState().color;

    pointerAt(50, 45);
    const afterMove = currentColorStore.getState().color;
    pointerAt(50, 45, "pointerUp");
    const afterUp = currentColorStore.getState().color;

    // Every gesture event dispatches (continuous updates, no debounce)…
    expect(afterMove).not.toEqual(afterDown);
    // …the final commit re-runs the reverse path at the settled state; the
    // fixed-point iteration has converged by then (drift < 1e-6 per channel,
    // imperceptible)…
    expect(afterUp.r).toBeCloseTo(afterMove.r, 6);
    expect(afterUp.g).toBeCloseTo(afterMove.g, 6);
    expect(afterUp.b).toBeCloseTo(afterMove.b, 6);
    // …and the stored color is always valid.
    expect(isInGamutLinear(xyzToLinearSrgb(srgbToXyz(afterUp)))).toBe(true);
  });

  it("an extreme drag clamps to the nearest producible color — never out of gamut", () => {
    render(<App />);

    // Drag far beyond the diagram (viewBox units outside 0–100).
    pointerAt(50, 40, "pointerDown");
    pointerAt(180, -80);
    pointerAt(180, -80, "pointerUp");

    const state = currentColorStore.getState();
    const linear = xyzToLinearSrgb(srgbToXyz(state.color));
    expect(isInGamutLinear(linear)).toBe(true);
  });

  it("the Cursor handle is keyboard-nudgeable in (x, y)", () => {
    render(<App />);

    const cursor = screen.getByTestId("gamut-cursor");
    const before = currentColorStore.getState().color;
    fireEvent.keyDown(cursor, { key: "ArrowRight" });
    const after = currentColorStore.getState().color;

    // Nudging dispatches the reverse path; the color changes and stays valid.
    expect(after).not.toEqual(before);
    expect(isInGamutLinear(xyzToLinearSrgb(srgbToXyz(after)))).toBe(true);
  });

  it("the luminance slider changes the Current Color and composes with the Cursor", () => {
    render(<App />);

    const slider = screen.getByTestId("luminance-y");
    const { x, y } = chromaticityOf(STARTING_COLOR_SRGB);

    // Down to 0 → black (Y = 0).
    fireEvent.change(slider, { target: { value: "0" } });
    expect(currentColorStore.getState().color).toEqual({ r: 0, g: 0, b: 0 });

    // Back up to 100 at the held chromaticity → the D65-anchored path.
    fireEvent.change(slider, { target: { value: "100" } });
    const expected = srgbToHex({ ...gamutPointToSrgb(x, y, 1), a: 1 });
    expect(srgbToHex({ ...currentColorStore.getState().color, a: 1 })).toBe(expected);
  });
});
